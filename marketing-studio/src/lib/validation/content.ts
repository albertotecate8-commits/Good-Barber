import { z } from "zod";
import { CONTENT_FORMATS, EDITABLE_STATUSES } from "@/lib/content-labels";
import { BUSINESS_TZ, isValidDateString, isValidTimeString, zonedToUtc } from "@/lib/tz";
import { SOCIAL_PLATFORMS } from "./business";

// Límites oficiales de Instagram para el texto de una publicación.
export const INSTAGRAM_CAPTION_MAX = 2200;
export const INSTAGRAM_HASHTAGS_MAX = 30;
export const FACEBOOK_TEXT_MAX = 63206;

const HASHTAG_RE = /^[\p{L}\p{N}_]{1,100}$/u;

/** "#Barberia, corte  #fade" -> ["Barberia", "corte", "fade"] (sin #, sin duplicados). */
export function parseHashtags(input: string): { tags: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const tags: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, "").trim();
    if (!tag) continue;
    if (!HASHTAG_RE.test(tag)) {
      invalid.push(raw);
      continue;
    }
    const key = tag.toLocaleLowerCase("es-MX");
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return { tags, invalid };
}

/** Texto final listo para copiar y pegar en la red social. */
export function composePostText(caption: string, hashtags: string[]): string {
  const tags = hashtags.map((t) => `#${t}`).join(" ");
  return [caption.trim(), tags].filter(Boolean).join("\n\n");
}

const uuidOrEmpty = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), "Identificador inválido")
  .transform((v) => v || null);

const contentFormSchema = z.object({
  business_id: z.string().trim().regex(/^[0-9a-f-]{36}$/i, "Elige un negocio"),
  platform: z.enum(SOCIAL_PLATFORMS, { message: "Elige una plataforma" }),
  format: z.enum(CONTENT_FORMATS, { message: "Elige un formato" }),
  title: z.string().trim().max(200, "Máximo 200 caracteres"),
  caption: z.string().trim().max(5000, "Máximo 5000 caracteres"),
  hashtags: z.string().max(3000),
  date: z.string().trim(),
  time: z.string().trim(),
  status: z.enum(EDITABLE_STATUSES, { message: "Estado no permitido" }),
  asset_id: uuidOrEmpty,
});

export interface ContentData {
  business_id: string;
  platform: (typeof SOCIAL_PLATFORMS)[number];
  format: (typeof CONTENT_FORMATS)[number];
  title: string;
  caption: string;
  hashtags: string[];
  scheduled_at: string | null;
  status: (typeof EDITABLE_STATUSES)[number];
  asset_id: string | null;
}

export type ContentValidation = { ok: true; data: ContentData } | { ok: false; errors: Record<string, string> };

/**
 * Valida el formulario de una publicación. `now` se inyecta para poder probar
 * la regla «no se puede programar en el pasado».
 */
export function validateContent(input: Record<string, unknown>, now = new Date(), tz = BUSINESS_TZ): ContentValidation {
  const parsed = contentFormSchema.safeParse(input);
  const errors: Record<string, string> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      errors[k] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const v = parsed.data;

  const { tags, invalid } = parseHashtags(v.hashtags);
  if (invalid.length) errors.hashtags = `Hashtags no válidos: ${invalid.slice(0, 3).join(", ")} (solo letras, números y _).`;

  let scheduled_at: string | null = null;
  if (v.date && !isValidDateString(v.date)) errors.date = "Fecha no válida.";
  if (v.time && !isValidTimeString(v.time)) errors.time = "Hora no válida (HH:MM).";
  if (v.time && !v.date) errors.date = "Indica la fecha de esa hora.";
  if (v.date && !v.time && !errors.date) errors.time = "Indica la hora (zona Ciudad de México).";
  if (!errors.date && !errors.time && v.date && v.time) {
    try {
      scheduled_at = zonedToUtc(v.date, v.time, tz);
    } catch (e) {
      errors.time = (e as Error).message;
    }
  }

  if (v.status === "scheduled") {
    if (!v.date || !v.time) errors.date ??= "Para programar necesitas fecha y hora.";
    else if (scheduled_at && new Date(scheduled_at).getTime() <= now.getTime() + 60_000)
      errors.date = "La fecha y hora programadas deben ser futuras.";
    if (v.platform === "instagram" && !v.asset_id)
      errors.asset_id = "Instagram exige una imagen o un video: elige un recurso de la biblioteca.";
  }

  if (!v.caption && !v.title && !v.asset_id) errors.caption = "Escribe un título o texto, o elige un recurso.";

  const finalText = composePostText(v.caption, tags);
  if (v.platform === "instagram") {
    if (finalText.length > INSTAGRAM_CAPTION_MAX)
      errors.caption = `Instagram admite ${INSTAGRAM_CAPTION_MAX} caracteres (texto + hashtags); llevas ${finalText.length}.`;
    if (tags.length > INSTAGRAM_HASHTAGS_MAX)
      errors.hashtags = `Instagram admite máximo ${INSTAGRAM_HASHTAGS_MAX} hashtags; llevas ${tags.length}.`;
  } else if (tags.length > 30) {
    errors.hashtags = "Máximo 30 hashtags.";
  }
  if (v.platform === "facebook_page" && finalText.length > FACEBOOK_TEXT_MAX)
    errors.caption = `Facebook admite ${FACEBOOK_TEXT_MAX} caracteres.`;

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      business_id: v.business_id,
      platform: v.platform,
      format: v.format,
      title: v.title,
      caption: v.caption,
      hashtags: tags,
      scheduled_at,
      status: v.status,
      asset_id: v.asset_id,
    },
  };
}

export const manualPostSchema = z.object({
  manual_post_url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "El enlace debe empezar con https://")
    .transform((v) => v || null),
});
