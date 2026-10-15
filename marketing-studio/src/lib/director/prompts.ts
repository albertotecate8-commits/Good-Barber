// Prompts listos para copiar en las herramientas que ya pagas (ChatGPT,
// Claude, Gemini, Flow). La app NO los ejecuta: solo los prepara con todo el
// contexto del negocio, y después puedes importar el resultado.
import { formatCents } from "@/lib/money";
import { EVIDENCE_LABELS } from "@/lib/research/types";
import type { BusinessContext, SavedFinding } from "./template";
import { GOAL_LABELS, type CampaignPlan, type Goal } from "./plan";

export const ASSISTED_TOOLS = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", for: ["strategy", "image"] },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", for: ["strategy"] },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app", for: ["strategy", "image"] },
  { id: "flow", name: "Google Flow", url: "https://labs.google/fx/tools/flow", for: ["video"] },
] as const;

function contextBlock(ctx: BusinessContext, findings: SavedFinding[]) {
  const b = ctx.business;
  const lines = [
    `NEGOCIO: ${b.name} — ${b.sector}${b.city ? `, ${b.city}` : ""}.`,
    b.description && `Descripción: ${b.description}`,
    b.address && `Dirección: ${b.address}`,
    b.target_audience && `Público definido por el dueño: ${b.target_audience}`,
    ctx.offerings.length
      ? `Servicios y precios REALES (no inventes otros): ${ctx.offerings.map((o) => `${o.name} ${o.price_cents === null ? "(sin precio)" : formatCents(o.price_cents)}`).join("; ")}.`
      : "No hay precios registrados: NO menciones precios.",
    ctx.promotions.length
      ? `Promociones vigentes: ${ctx.promotions.map((p) => `${p.title}${p.details ? ` (${p.details})` : ""}${p.restrictions ? ` — restricciones: ${p.restrictions}` : ""}`).join("; ")}.`
      : "No hay promociones vigentes: no inventes descuentos.",
    ctx.brand &&
      `Marca: colores ${ctx.brand.color_primary}/${ctx.brand.color_secondary}/${ctx.brand.color_accent}, fondo ${ctx.brand.color_background}${ctx.brand.font_heading ? `, tipografía ${ctx.brand.font_heading}` : ""}. Tono: ${ctx.brand.tone_of_voice || "no definido"}. Reglas: ${ctx.brand.visual_rules || "no definidas"}.${ctx.brand.dos.length ? ` Siempre: ${ctx.brand.dos.join("; ")}.` : ""}${ctx.brand.donts.length ? ` Nunca: ${ctx.brand.donts.join("; ")}.` : ""}`,
  ].filter(Boolean);
  const ev = findings
    .slice(0, 25)
    .map((f) => `- [${f.id}] (${EVIDENCE_LABELS[f.evidence_level]}, confianza ${f.confidence}) ${f.summary}${f.url ? ` Fuente: ${f.url}` : ` Fuente: ${f.source_name}`}`);
  return `${lines.join("\n")}\n\nHALLAZGOS CON FUENTE (usa sus ids en finding_ids; no agregues datos externos sin fuente):\n${ev.join("\n") || "- (sin hallazgos)"}`;
}

export function strategyPrompt(ctx: BusinessContext, findings: SavedFinding[], goal: Goal, instruction: string, adsCount: number, period: { start: string; end: string }) {
  return `Actúa como director de marketing para un negocio local en México. Responde SOLO con un objeto JSON válido (sin texto antes ni después).

INSTRUCCIÓN DEL DUEÑO: «${instruction}»
OBJETIVO: ${GOAL_LABELS[goal]}. PERIODO: ${period.start} a ${period.end} (zona America/Mexico_City).

${contextBlock(ctx, findings)}

REGLAS:
- No inventes precios, descuentos, estadísticas, competidores ni resultados. Usa solo los datos de arriba.
- Etiqueta cada sección con "basis": "fact" (dato comprobado de arriba), "observation", "hypothesis" o "recommendation" (por probar).
- No prometas ventas ni digas que algo «funciona» sin evidencia.
- No uses escasez falsa («últimos lugares») ni testimonios inventados.
- Español de México, tono de la marca.

ESQUEMA EXACTO:
{
  "opportunity": {"text": string, "basis": string, "finding_ids": [ids]},
  "audience": {"text": string, "basis": string, "finding_ids": []},
  "offer": {"text": string, "basis": string, "finding_ids": [], "offering_names": [string]},
  "visual_concept": {"text": string, "basis": string, "finding_ids": []},
  "ads": [${adsCount} objetos {"angle", "headline" (máx. 150), "primary_text" (máx. 2200), "cta", "format": "post"|"story"|"reel"|"carousel", "platform": "instagram"|"facebook_page"|"tiktok"|"whatsapp", "visual_prompt", "asset_hint", "basis": "recommendation", "finding_ids": []}],
  "reel": {"duration_seconds": number, "hook": string, "scenes": [{"seconds": string, "shot": string, "on_screen_text": string, "voiceover": string}], "caption": string, "cta": string, "footage_note": string, "flow_prompt": string},
  "schedule": [{"date": "AAAA-MM-DD", "time": "HH:MM", "platform": string, "format": string, "ad_index": número o null, "is_reel": boolean, "note": string}],
  "kpis": [{"name": string, "target_note": string, "how_to_measure": string}],
  "measurement": string,
  "warnings": [string]
}`;
}

export function imagePrompt(ctx: BusinessContext, plan: CampaignPlan, adIndex: number) {
  const ad = plan.ads[adIndex];
  return `${ad.visual_prompt}

Contexto del anuncio: «${ad.headline}» — ${ad.primary_text}
Marca: ${ctx.business.name}. Reglas de marca: ${ctx.brand?.visual_rules || "no definidas"}.
Importante: si el diseño incluye precios o textos, deben ser EXACTAMENTE: «${ad.headline}». No inventes ofertas.`;
}

export function reelPrompt(ctx: BusinessContext, plan: CampaignPlan) {
  if (!plan.reel) return "";
  return `${plan.reel.flow_prompt}

Contexto: Reel de ${plan.reel.duration_seconds} s para ${ctx.business.name}. Este clip es SOLO una toma de ambiente; las escenas con clientes y resultados se graban de forma real.`;
}
