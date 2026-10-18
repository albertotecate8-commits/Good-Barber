import { describe, expect, it, vi } from "vitest";
import { CF_DAILY_NEURON_CAP, CF_IMAGE_MODEL, cloudflareImageUnavailableReason, estimateNeurons, generateWithCloudflare, outputSize } from "@/lib/studio/cloudflare-image";
import { generationPrompt } from "@/lib/studio/propose";
import { findStyle, parseMessage } from "@/lib/studio/intent";

const env = { CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", CLOUDFLARE_AI_TOKEN: "tok_abcdefghijklmnopqrstuvwxyz", CLOUDFLARE_FREE_PLAN_CONFIRMED: "1" };
// PNG válido mínimo (cabecera + relleno) codificado en base64.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000, 1)]).toString("base64");

describe("Cloudflare Workers AI (FLUX.2 klein)", () => {
  it("exige cuenta, token y confirmar el plan gratuito", () => {
    expect(cloudflareImageUnavailableReason({})).toMatch(/CLOUDFLARE_ACCOUNT_ID/);
    expect(cloudflareImageUnavailableReason({ ...env, CLOUDFLARE_AI_TOKEN: "" })).toMatch(/CLOUDFLARE_AI_TOKEN/);
    expect(cloudflareImageUnavailableReason({ ...env, CLOUDFLARE_FREE_PLAN_CONFIRMED: "" })).toMatch(/plan gratuito/);
    expect(cloudflareImageUnavailableReason(env)).toBeNull();
  });

  it("estima neuronas por mosaico de 512 px y el tope diario deja margen", () => {
    const { width, height } = outputSize("post");
    expect(estimateNeurons(width, height, [])).toBe(Math.ceil(2 * 3 * 26.05));
    expect(estimateNeurons(width, height, [{ width: 511, height: 400 }])).toBe(Math.ceil(6 * 26.05 + 5.37));
    expect(CF_DAILY_NEURON_CAP).toBeLessThan(10000);
    expect(outputSize("story").height).toBeGreaterThan(outputSize("story").width);
  });

  it("envía multipart con prompt, tamaño y referencias input_image_N y decodifica la imagen", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get("prompt")).toBe("hola");
      expect(form.get("width")).toBe("1024");
      expect(form.get("input_image_0")).toBeInstanceOf(Blob);
      expect(form.get("input_image_1")).toBeInstanceOf(Blob);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${env.CLOUDFLARE_AI_TOKEN}`);
      return new Response(JSON.stringify({ success: true, result: { image: png } }), { status: 200 });
    });
    const r = await generateWithCloudflare(
      { prompt: "hola", width: 1024, height: 1280, references: [{ bytes: new Uint8Array([1]), type: "image/jpeg" }, { bytes: new Uint8Array([2]), type: "image/jpeg" }] },
      { fetch: fetchMock as unknown as typeof fetch, env },
    );
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${CF_IMAGE_MODEL}`);
    expect(r.ok && r.mime).toBe("image/png");
  });

  it("errores claros: token rechazado, cuota agotada, sin imagen", async () => {
    const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const base = { prompt: "x", width: 1024, height: 1280, references: [] };
    const denied = await generateWithCloudflare(base, { fetch: respond(403, { success: false, errors: [{ message: "Authentication error" }] }), env });
    expect(denied.ok || denied.message).toMatch(/token/);
    const quota = await generateWithCloudflare(base, { fetch: respond(429, { success: false, errors: [{ message: "you have used up your daily free allocation of 10,000 neurons" }] }), env });
    expect(quota.ok || quota.message).toMatch(/cuota gratuita/);
    const empty = await generateWithCloudflare(base, { fetch: respond(200, { success: true, result: {} }), env });
    expect(empty.ok || empty.message).toMatch(/sin imagen/);
  });
});

describe("prompt de generación directa", () => {
  const prompt = ["Crea una imagen publicitaria para «GB».", "Texto EXACTO dentro de la imagen:\n- Titular: «Corte $120»", "Logotipo: usa SOLO el logotipo de GB que adjunto", "Referencias adjuntas (1): toma solo su composición", "No incluyas logotipos, marcas ni personajes de terceros."].join("\n\n");
  it("sin texto por defecto, quita instrucciones de ChatGPT y explica cada referencia", () => {
    const g = generationPrompt({ prompt }, ["previous", "style"], false);
    expect(g).not.toMatch(/Texto EXACTO|Logotipo: usa|Referencias adjuntas/);
    expect(g).toMatch(/La imagen de referencia 0 es la versión anterior/);
    expect(g).toMatch(/La imagen de referencia 1 es la referencia del estilo guardado/);
    expect(g).toMatch(/NO incluyas texto/);
    expect(g).toContain("personajes de terceros");
  });
  it("con texto conserva el texto exacto", () => {
    expect(generationPrompt({ prompt }, [], true)).toContain("Corte $120");
  });
});

describe("«usa esta referencia»", () => {
  const now = new Date("2026-10-18T12:00:00Z");
  const styles = [
    { id: "old", name: "Noir", created_at: "2026-10-01T00:00:00Z" },
    { id: "new", name: "Referencia Investigar", created_at: "2026-10-17T00:00:00Z" },
  ];
  it("sin adjuntos usa la última referencia guardada; con adjuntos no cambia el estilo", () => {
    expect(findStyle("Usa esta referencia y adapta el estilo a Good Barber", styles, now).id).toBe("new");
    expect(findStyle("Usa esta referencia y adapta el estilo a Good Barber", styles, now, true).id).toBeNull();
    expect(findStyle("Usa esta referencia y adapta el estilo a Good Barber", styles, now, true).missing).toBeNull();
    expect(findStyle("usa esta referencia", [], now).missing).toMatch(/No hay referencias guardadas/);
  });
  it("crea propuestas con ese estilo sin repetir la información", () => {
    const p = parseMessage("Usa esta referencia y adapta el estilo a Good Barber", { styles, offerNames: [], hasProposals: false, now });
    expect(p.kind).toBe("create");
    expect(p.styleId).toBe("new");
  });
});
