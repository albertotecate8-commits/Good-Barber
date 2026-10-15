import { z } from "zod";

// Contrato único del plan de campaña. Lo producen el motor de plantillas, la
// API de Gemini o un resultado pegado desde ChatGPT/Claude/Gemini, y siempre
// se valida con este esquema antes de guardarse.

export const GOALS = ["customers", "appointments", "messages", "sales", "awareness", "reactivation"] as const;
export type Goal = (typeof GOALS)[number];
export const GOAL_LABELS: Record<Goal, string> = {
  customers: "Conseguir clientes nuevos",
  appointments: "Conseguir citas",
  messages: "Recibir mensajes",
  sales: "Aumentar ventas",
  awareness: "Reconocimiento de marca",
  reactivation: "Reactivar clientes",
};

/**
 * Nivel de evidencia de cada afirmación:
 *  - fact: hecho comprobado (datos del negocio o fuente verificable).
 *  - observation: algo observado en una fuente, sin medición propia.
 *  - hypothesis: supuesto de marketing razonable, sin evidencia directa.
 *  - recommendation: acción propuesta que aún debe probarse.
 */
export const BASES = ["fact", "observation", "hypothesis", "recommendation"] as const;
export type Basis = (typeof BASES)[number];
export const BASIS_LABELS: Record<Basis, string> = {
  fact: "Hecho comprobado",
  observation: "Observación",
  hypothesis: "Hipótesis",
  recommendation: "Recomendación por probar",
};

export const PLAN_SOURCES = ["template", "gemini_api", "assisted_import", "manual"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];
export const PLAN_SOURCE_LABELS: Record<PlanSource, string> = {
  template: "Motor de plantillas de la app (sin IA)",
  gemini_api: "Gemini API (nivel gratuito)",
  assisted_import: "Resultado importado de una IA externa (asistido)",
  manual: "Escrito a mano",
};

const text = (max: number) => z.string().trim().max(max);
const ids = z.array(z.string().uuid()).max(30).default([]);

const section = z.object({
  text: text(3000).min(1),
  basis: z.enum(BASES).default("hypothesis"),
  finding_ids: ids,
});

export const adSchema = z.object({
  angle: text(120).min(1),
  headline: text(150).min(1),
  primary_text: text(2200).min(1),
  cta: text(80).min(1),
  format: z.enum(["post", "story", "reel", "carousel", "video", "flyer", "other"]).default("post"),
  platform: z.enum(["instagram", "facebook_page", "tiktok", "whatsapp", "google_business", "youtube", "other"]).default("instagram"),
  visual_prompt: text(3000).default(""),
  asset_hint: text(500).default(""),
  basis: z.enum(BASES).default("recommendation"),
  finding_ids: ids,
});
export type Ad = z.infer<typeof adSchema>;

export const reelSchema = z.object({
  duration_seconds: z.number().int().min(5).max(180).default(20),
  hook: text(300).min(1),
  scenes: z
    .array(
      z.object({
        seconds: text(20).default(""),
        shot: text(500).min(1),
        on_screen_text: text(200).default(""),
        voiceover: text(500).default(""),
      }),
    )
    .min(1)
    .max(15),
  caption: text(2200).default(""),
  cta: text(120).default(""),
  footage_note: text(800).default(""),
  flow_prompt: text(3000).default(""),
});
export type Reel = z.infer<typeof reelSchema>;

export const scheduleItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  platform: adSchema.shape.platform,
  format: adSchema.shape.format,
  ad_index: z.number().int().min(0).max(9).nullable().default(null),
  is_reel: z.boolean().default(false),
  note: text(300).default(""),
  /** Se llena al crear el borrador en el calendario: evita duplicarlo. */
  content_id: z.string().uuid().nullable().default(null),
});
export type ScheduleItem = z.infer<typeof scheduleItemSchema>;

export const taskSchema = z.object({
  kind: z.enum(["context", "research", "strategy", "ads", "reel", "schedule", "prompts", "measurement"]),
  label: text(200).min(1),
  status: z.enum(["done", "manual_pending", "skipped"]),
  note: text(400).default(""),
});

export const planSchema = z.object({
  version: z.literal(1).default(1),
  opportunity: section,
  audience: section,
  offer: section.extend({ offering_names: z.array(text(120)).max(20).default([]) }),
  visual_concept: section,
  ads: z.array(adSchema).min(1).max(10),
  reel: reelSchema.nullable().default(null),
  schedule: z.array(scheduleItemSchema).max(40).default([]),
  kpis: z
    .array(z.object({ name: text(120).min(1), target_note: text(300).default(""), how_to_measure: text(500).default("") }))
    .max(12)
    .default([]),
  measurement: text(3000).default(""),
  tasks: z.array(taskSchema).max(20).default([]),
  warnings: z.array(text(500)).max(30).default([]),
});
export type CampaignPlan = z.infer<typeof planSchema>;

/** Extrae el primer objeto JSON de un texto (las IA suelen rodearlo de explicaciones o ```json). */
export function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No se encontró un objeto JSON en el texto pegado.");
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error("El JSON no es válido (revisa comas y comillas).");
  }
}

export function parsePlan(input: unknown): { ok: true; plan: CampaignPlan } | { ok: false; errors: string[] } {
  const r = planSchema.safeParse(input);
  if (r.success) return { ok: true, plan: r.data };
  return {
    ok: false,
    errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "plan"}: ${i.message}`),
  };
}

/**
 * Detecta montos en pesos dentro de los textos que no correspondan a ningún
 * precio o promoción registrada. Protege contra precios inventados por una IA.
 */
export function findUnknownPrices(plan: CampaignPlan, knownCents: number[]): string[] {
  const known = new Set(knownCents.map((c) => Math.round(c)));
  const texts: string[] = [
    plan.offer.text,
    ...plan.ads.flatMap((a) => [a.headline, a.primary_text, a.cta]),
    ...(plan.reel ? [plan.reel.hook, plan.reel.caption, ...plan.reel.scenes.map((s) => s.on_screen_text + " " + s.voiceover)] : []),
  ];
  const unknown = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g)) {
      const cents = Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
      if (!known.has(cents)) unknown.add(m[0].replace(/\s/g, ""));
    }
  }
  return [...unknown];
}

/** Guion de Reel editable como texto: «0–3 | toma | texto en pantalla | voz» por línea. */
export function parseReelScript(script: string): Reel["scenes"] {
  return script
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 15)
    .map((l) => {
      const [seconds = "", shot = "", on_screen_text = "", voiceover = ""] = l.split("|").map((x) => x.trim());
      return { seconds: seconds.slice(0, 20), shot: (shot || seconds).slice(0, 500), on_screen_text: on_screen_text.slice(0, 200), voiceover: voiceover.slice(0, 500) };
    });
}

export function reelScriptText(reel: Reel): string {
  return reel.scenes.map((s) => [s.seconds, s.shot, s.on_screen_text, s.voiceover].join(" | ")).join("\n");
}
