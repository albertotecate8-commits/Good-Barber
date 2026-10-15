import { z } from "zod";
import { parsePriceToCents } from "@/lib/money";
import { slugify } from "@/lib/slug";

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Usa un color hexadecimal como #C9A227");
const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "Debe empezar con https://");

export const businessSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe el nombre del negocio").max(80),
    slug: text(60).optional().default(""),
    sector: text(80),
    description: text(2000),
    city: text(120),
    service_area: text(500),
    address: text(300),
    target_audience: text(2000),
  })
  .transform((v) => ({ ...v, slug: slugify(v.slug || v.name) }))
  .refine((v) => v.slug.length >= 2, { message: "El nombre debe tener letras o números", path: ["name"] });
export type BusinessInput = z.infer<typeof businessSchema>;

const list = z
  .string()
  .max(3000)
  .transform((v) =>
    v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

export const brandSchema = z.object({
  color_primary: hex,
  color_secondary: hex,
  color_accent: hex,
  color_background: hex,
  font_heading: text(80),
  font_body: text(80),
  tone_of_voice: text(1000),
  visual_rules: text(3000),
  dos: list,
  donts: list,
  logo_url: httpsUrl.transform((v) => v || null),
});
export type BrandInput = z.infer<typeof brandSchema>;

export const offeringSchema = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(120),
  description: text(1000),
  kind: z.enum(["service", "product", "package"]),
  price: z
    .string()
    .max(30)
    .transform((v, ctx) => {
      try {
        return parsePriceToCents(v);
      } catch (e) {
        ctx.addIssue({ code: "custom", message: (e as Error).message });
        return z.NEVER;
      }
    }),
  active: z.boolean(),
});
export type OfferingInput = z.infer<typeof offeringSchema>;

export const promotionSchema = z
  .object({
    title: z.string().trim().min(2, "Escribe un título").max(120),
    details: text(2000),
    restrictions: text(2000),
    starts_on: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha no válida"),
    ends_on: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Fecha no válida"),
    active: z.boolean(),
  })
  .transform((v) => ({ ...v, starts_on: v.starts_on || null, ends_on: v.ends_on || null }))
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, {
    message: "La fecha final no puede ser anterior a la inicial",
    path: ["ends_on"],
  });
export type PromotionInput = z.infer<typeof promotionSchema>;

export const SOCIAL_PLATFORMS = [
  "facebook_page",
  "instagram",
  "tiktok",
  "whatsapp",
  "google_business",
  "youtube",
  "website",
  "other",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook_page: "Página de Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  google_business: "Perfil de Google",
  youtube: "YouTube",
  website: "Sitio web",
  other: "Otro",
};

// Registrar un perfil NO es conectarlo: solo se guarda el usuario/enlace. La
// conexión oficial (OAuth) es otro flujo y la marca el servidor.
export const socialSchema = z
  .object({
    platform: z.enum(SOCIAL_PLATFORMS),
    handle: text(120).transform((v) => v.replace(/^@+/, "")),
    url: httpsUrl.transform((v) => v || null),
    notes: text(1000),
  })
  .refine((v) => v.handle.length > 0 || v.url, { message: "Escribe el usuario o el enlace", path: ["handle"] });
export type SocialInput = z.infer<typeof socialSchema>;

/** Convierte FormData en objeto plano (los checkbox ausentes = false). */
export function formToObject(form: FormData, booleans: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  for (const b of booleans) out[b] = form.get(b) === "on" || form.get(b) === "true";
  return out;
}

export function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
