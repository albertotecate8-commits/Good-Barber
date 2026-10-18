// Estilos de referencia y memoria por negocio. Un estilo tiene dos partes que
// nunca se mezclan: «medido» (lo calculó la app con los píxeles de la imagen) e
// «interpretado» (lo escribió la persona, o lo pegó de un análisis asistido).
import { z } from "zod";

export const measuredSchema = z.object({
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), share: z.number().min(0).max(1) })).max(8),
  brightness: z.number().min(0).max(100),
  contrast: z.number().min(0).max(100),
  saturation: z.number().min(0).max(100),
  temperature: z.enum(["cálida", "fría", "neutra"]),
  aspect: z.string().max(20),
  focus: z.string().max(60),
  negativeSpace: z.number().min(0).max(100),
  width: z.number().int().min(1).max(20000),
  height: z.number().int().min(1).max(20000),
});
export type Measured = z.infer<typeof measuredSchema>;

export const INTERPRETED_FIELDS = [
  { key: "composition", label: "Composición", hint: "Dónde va el sujeto, el texto y el logotipo" },
  { key: "typography", label: "Tipografía", hint: "Serif, sans, condensada, peso, mayúsculas" },
  { key: "lighting", label: "Iluminación", hint: "Suave, dura, lateral, de estudio, natural" },
  { key: "photography", label: "Fotografía", hint: "Retrato, detalle, producto, ambiente" },
  { key: "mood", label: "Estilo y ambiente", hint: "Premium, urbano, clásico, minimalista" },
  { key: "hierarchy", label: "Jerarquía visual", hint: "Qué se lee primero, segundo y tercero" },
  { key: "commercial", label: "Enfoque comercial", hint: "Oferta, llamada a la acción, precio visible" },
] as const;
export type InterpretedKey = (typeof INTERPRETED_FIELDS)[number]["key"];

const text = z.string().trim().max(600);
export const interpretedSchema = z.object(
  Object.fromEntries(INTERPRETED_FIELDS.map((f) => [f.key, text.optional()])) as Record<InterpretedKey, z.ZodOptional<typeof text>>,
);
export type Interpreted = z.infer<typeof interpretedSchema>;

export const styleAttributesSchema = z.object({
  measured: measuredSchema.optional(),
  interpreted: interpretedSchema.default({}),
});
export type StyleAttributes = z.infer<typeof styleAttributesSchema>;

export interface Style {
  id: string;
  name: string;
  description: string;
  attributes: StyleAttributes;
  reference_asset_ids: string[];
  source: "reference_image" | "manual" | "research" | "approved_design";
  active: boolean;
  created_at: string;
  updated_at: string;
}

export function parseAttributes(raw: unknown): StyleAttributes {
  const r = styleAttributesSchema.safeParse(raw ?? {});
  return r.success ? r.data : { interpreted: {} };
}

export const MEMORY_KINDS = [
  { key: "preference", label: "Preferencia" },
  { key: "restriction", label: "Restricción" },
  { key: "correction", label: "Corrección" },
  { key: "fact", label: "Dato del negocio" },
  { key: "audience", label: "Público" },
  { key: "research_insight", label: "Conclusión de investigación" },
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number]["key"];
export const MEMORY_LABELS = Object.fromEntries(MEMORY_KINDS.map((k) => [k.key, k.label])) as Record<MemoryKind, string>;
export const isMemoryKind = (v: unknown): v is MemoryKind => MEMORY_KINDS.some((k) => k.key === v);

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  text: string;
  source: "chat" | "manual" | "research" | "approval";
  source_url: string | null;
  active: boolean;
  created_at: string;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Clasifica una frase que la persona pidió recordar. */
export function guessMemoryKind(text: string): MemoryKind {
  const t = norm(text);
  if (/^(nunca|no (uses|pongas|incluyas|menciones)|evita|prohibido|jamas)/.test(t)) return "restriction";
  if (/(en realidad|corrige|no es |esta mal|se equivoco|el precio correcto)/.test(t)) return "correction";
  if (/(prefiero|preferimos|preferiria|me gusta|nos gusta|queremos|siempre (usa|pon))/.test(t)) return "preference";
  if (/(clientes|publico|audiencia|jovenes|hombres de|mujeres de)/.test(t)) return "audience";
  return "fact";
}

/** Resumen corto y verificable de un estilo, para mostrar y para los prompts. */
export function describeStyle(s: Pick<Style, "name" | "description" | "attributes">): string[] {
  const out: string[] = [];
  const m = s.attributes.measured;
  if (m) {
    out.push(`Paleta medida: ${m.palette.slice(0, 5).map((p) => `${p.hex} (${Math.round(p.share * 100)}%)`).join(", ")}.`);
    out.push(
      `Medido en la referencia: luminosidad ${m.brightness}/100, contraste ${m.contrast}/100, saturación ${m.saturation}/100, temperatura ${m.temperature}, proporción ${m.aspect}, foco visual ${m.focus}, espacio libre ${m.negativeSpace}%.`,
    );
  }
  for (const f of INTERPRETED_FIELDS) {
    const v = s.attributes.interpreted[f.key];
    if (v) out.push(`${f.label}: ${v}.`.replace(/\.\.$/, "."));
  }
  if (s.description) out.push(s.description);
  return out;
}
