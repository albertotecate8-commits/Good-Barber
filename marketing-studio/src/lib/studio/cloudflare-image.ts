// Generación directa de imágenes con Cloudflare Workers AI (API oficial).
//
// Por qué esta vía (investigado oct-2026):
//   * La suscripción de ChatGPT NO incluye la API de OpenAI (facturación aparte,
//     de pago por imagen). Gemini ya no ofrece generación de imágenes gratis en
//     su API. Automatizar chatgpt.com violaría sus condiciones.
//   * Workers AI incluye 10,000 «neuronas» al día sin costo. En el plan gratuito
//     (Workers Free) lo que pase de ese límite FALLA en lugar de cobrarse.
//   * FLUX.2 [klein] 4B acepta hasta 4 imágenes de referencia (< 512×512) en los
//     campos input_image_0…3: sirve para estilos guardados, referencias y para
//     modificar una versión anterior con nuevas instrucciones.
//
// Doble candado de gasto: además del límite de Cloudflare, la app lleva su
// propia cuenta diaria (mkt_ai_usage) y se detiene antes de 9,000 neuronas.
// Solo se activa con CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN y
// CLOUDFLARE_FREE_PLAN_CONFIRMED=1 (confirmas que la cuenta está en Workers Free).

export const CF_IMAGE_PROVIDER = "cloudflare-flux2";
export const CF_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
/** Tope propio por día (UTC), por debajo de las 10,000 neuronas gratuitas. */
export const CF_DAILY_NEURON_CAP = 9000;
/** Precio publicado (oct-2026) para FLUX.2 [klein] 4B, en neuronas. */
const NEURONS_PER_OUTPUT_TILE = 26.05;
const NEURONS_PER_INPUT_TILE = 5.37;
export const MAX_REFERENCE_IMAGES = 4;
export const MAX_REFERENCE_SIDE = 511;

type Env = Record<string, string | undefined>;

export function cloudflareImageUnavailableReason(env: Env): string | null {
  if (!/^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "")) return "Falta CLOUDFLARE_ACCOUNT_ID (cuenta gratuita de Cloudflare).";
  if ((env.CLOUDFLARE_AI_TOKEN?.trim().length ?? 0) < 20) return "Falta CLOUDFLARE_AI_TOKEN (token con permiso «Workers AI»).";
  if (env.CLOUDFLARE_FREE_PLAN_CONFIRMED !== "1")
    return "Falta CLOUDFLARE_FREE_PLAN_CONFIRMED=1 (confirma que la cuenta está en el plan gratuito: así nunca se cobra).";
  return null;
}

const tiles = (w: number, h: number) => Math.ceil(w / 512) * Math.ceil(h / 512);

/** Neuronas estimadas de una generación (salida + referencias). */
export function estimateNeurons(width: number, height: number, refs: { width: number; height: number }[]): number {
  const out = tiles(width, height) * NEURONS_PER_OUTPUT_TILE;
  const input = refs.reduce((s, r) => s + tiles(r.width, r.height) * NEURONS_PER_INPUT_TILE, 0);
  return Math.ceil(out + input);
}

/** Tamaño de salida: múltiplos de 16 y máximo ~1.5 MP para cuidar la cuota diaria. */
export function outputSize(format: "post" | "story" | "reel" | "carousel"): { width: number; height: number } {
  return format === "story" || format === "reel" ? { width: 768, height: 1360 } : { width: 1024, height: 1280 };
}

export interface GenerateInput {
  prompt: string;
  width: number;
  height: number;
  references: { bytes: Uint8Array; type: string }[];
  seed?: number;
}

export type GenerateResult = { ok: true; bytes: Uint8Array; mime: string; neurons: number } | { ok: false; message: string; retryable: boolean };

/** API oficial. Solo las pruebas locales pueden apuntar a un simulador en 127.0.0.1. */
function apiBase(env: Env) {
  const b = env.CLOUDFLARE_API_BASE?.trim() ?? "";
  return /^http:\/\/127\.0\.0\.1:\d+$/.test(b) ? b : "https://api.cloudflare.com/client/v4";
}

/** Llama a la API oficial. Nunca reintenta sola (cada intento cuenta contra la cuota). */
export async function generateWithCloudflare(input: GenerateInput, deps: { fetch: typeof fetch; env: Env; timeoutMs?: number }): Promise<GenerateResult> {
  const reason = cloudflareImageUnavailableReason(deps.env);
  if (reason) return { ok: false, message: reason, retryable: false };
  if (input.references.length > MAX_REFERENCE_IMAGES) return { ok: false, message: `Máximo ${MAX_REFERENCE_IMAGES} imágenes de referencia.`, retryable: false };
  const form = new FormData();
  form.append("prompt", input.prompt.slice(0, 4000));
  form.append("width", String(input.width));
  form.append("height", String(input.height));
  if (input.seed !== undefined) form.append("seed", String(input.seed));
  input.references.forEach((r, i) => form.append(`input_image_${i}`, new Blob([r.bytes as BlobPart], { type: r.type }), `ref-${i}.${r.type === "image/png" ? "png" : "jpg"}`));
  let res: Response;
  try {
    res = await deps.fetch(`${apiBase(deps.env)}/accounts/${deps.env.CLOUDFLARE_ACCOUNT_ID!.trim()}/ai/run/${CF_IMAGE_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.env.CLOUDFLARE_AI_TOKEN!.trim()}` },
      body: form,
      signal: AbortSignal.timeout(deps.timeoutMs ?? 24_000),
    });
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError";
    return { ok: false, message: timeout ? "Cloudflare no respondió a tiempo (24 s). Vuelve a intentarlo." : `No se pudo contactar a Cloudflare: ${(e as Error).message}`, retryable: true };
  }
  const text = await res.text();
  let body: { success?: boolean; result?: { image?: string }; image?: string; errors?: { code?: number; message?: string }[] } = {};
  try {
    body = JSON.parse(text);
  } catch {
    // respuesta no JSON
  }
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).filter(Boolean).join("; ") || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) return { ok: false, message: `Cloudflare rechazó el token (${msg}). Revisa que tenga permiso «Workers AI».`, retryable: false };
    if (res.status === 429 || /neuron|limit|quota/i.test(msg)) return { ok: false, message: `Se agotó la cuota gratuita de hoy en Cloudflare (${msg}). Se renueva a las 00:00 UTC.`, retryable: false };
    return { ok: false, message: `Cloudflare devolvió un error: ${msg}`.slice(0, 300), retryable: res.status >= 500 };
  }
  const b64 = body.result?.image ?? body.image;
  if (!b64 || typeof b64 !== "string") return { ok: false, message: "Cloudflare respondió sin imagen.", retryable: true };
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? "image/png" : bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : bytes[0] === 0x52 && bytes[8] === 0x57 ? "image/webp" : "";
  if (!mime || bytes.length < 1000) return { ok: false, message: "La imagen recibida no es válida.", retryable: true };
  return { ok: true, bytes, mime, neurons: estimateNeurons(input.width, input.height, []) };
}
