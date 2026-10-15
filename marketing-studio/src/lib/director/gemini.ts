// Proveedor Gemini API (nivel gratuito). Solo se usa si:
//   1. existe GEMINI_API_KEY (creada en Google AI Studio), y
//   2. GEMINI_FREE_TIER_CONFIRMED=1: confirmas que el proyecto de Google Cloud
//      de esa clave NO tiene facturación activa (si la tuviera, Google podría
//      cobrar el uso). La app no puede verificarlo por sí sola.
// Además pasa por assertCallAllowed (gasto $0 y tope diario propio).
import { assertCallAllowed, BudgetError } from "@/lib/providers/budget";
import { extractJsonObject, parsePlan, type CampaignPlan } from "./plan";

export function geminiUnavailableReason(env: Record<string, string | undefined>): string | null {
  if (!env.GEMINI_API_KEY) return "Falta GEMINI_API_KEY.";
  if (env.GEMINI_FREE_TIER_CONFIRMED !== "1")
    return "Falta GEMINI_FREE_TIER_CONFIRMED=1 (confirma que el proyecto de la clave no tiene facturación activa).";
  return null;
}

export async function generatePlanWithGemini(
  prompt: string,
  deps: { fetch: typeof fetch; env: Record<string, string | undefined>; usedToday: number; spentThisMonthMXN: number },
): Promise<{ ok: true; plan: CampaignPlan } | { ok: false; message: string; blocked?: boolean }> {
  const reason = geminiUnavailableReason(deps.env);
  if (reason) return { ok: false, message: reason, blocked: true };
  try {
    assertCallAllowed({ providerId: "gemini-text", estimatedCostMXN: 0, usedToday: deps.usedToday, spentThisMonthMXN: deps.spentThisMonthMXN });
  } catch (e) {
    if (e instanceof BudgetError) return { ok: false, message: e.message, blocked: true };
    throw e;
  }
  const model = (deps.env.GEMINI_MODEL || "gemini-2.5-flash").replace(/[^a-zA-Z0-9.\-]/g, "");
  let res: Response;
  try {
    res = await deps.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": deps.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    return { ok: false, message: `No se pudo contactar a Gemini: ${(e as Error).message}` };
  }
  if (res.status === 429) return { ok: false, message: "Gemini rechazó la petición por límite del nivel gratuito (429). Inténtalo más tarde." };
  if (!res.ok) return { ok: false, message: `Gemini respondió con error HTTP ${res.status}.` };
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const textOut = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let json: unknown;
  try {
    json = extractJsonObject(textOut);
  } catch (e) {
    return { ok: false, message: `Gemini no devolvió un JSON válido: ${(e as Error).message}` };
  }
  const parsed = parsePlan(json);
  if (!parsed.ok) return { ok: false, message: `La respuesta de Gemini no cumple el formato: ${parsed.errors.join("; ")}` };
  return { ok: true, plan: parsed.plan };
}
