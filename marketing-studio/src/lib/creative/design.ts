import { z } from "zod";
import { APP_FONT_KEY, FONT_KEYS, matchBrandFont } from "./fonts";

// Especificación de un diseño hecho con el editor (edición por código, no IA).
// Se guarda en cada versión para poder reabrirlo, adaptarlo a otro formato y
// volver a exportarlo exactamente igual.

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const uuidOrNull = z.string().uuid().nullable().default(null);

export const TEMPLATES = ["band_bottom", "centered", "headline_top", "price_badge", "minimal"] as const;
export type Template = (typeof TEMPLATES)[number];
export const TEMPLATE_LABELS: Record<Template, string> = {
  band_bottom: "Franja inferior",
  centered: "Centrado",
  headline_top: "Título arriba, precio abajo",
  price_badge: "Insignia de precio",
  minimal: "Mínimo",
};

export const LOGO_POSITIONS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-right"] as const;

export const designSchema = z.object({
  format_key: z.string().regex(/^[a-z0-9_]{2,40}$/),
  width: z.number().int().min(100).max(8000),
  height: z.number().int().min(100).max(8000),
  template: z.enum(TEMPLATES).default("band_bottom"),
  background: z
    .object({
      color: hex.default("#0B0B0D"),
      asset_id: uuidOrNull,
      fit: z.enum(["cover", "contain"]).default("cover"),
      focus_x: z.number().min(0).max(1).default(0.5),
      focus_y: z.number().min(0).max(1).default(0.5),
      zoom: z.number().min(1).max(3).default(1),
    })
    .default({ color: "#0B0B0D", asset_id: null, fit: "cover", focus_x: 0.5, focus_y: 0.5, zoom: 1 }),
  overlay: z.object({ color: hex.default("#000000"), opacity: z.number().min(0).max(0.9).default(0.35) }).default({ color: "#000000", opacity: 0.35 }),
  logo: z
    .object({ asset_id: uuidOrNull, position: z.enum(LOGO_POSITIONS).default("top-left"), size_pct: z.number().min(5).max(40).default(18) })
    .default({ asset_id: null, position: "top-left", size_pct: 18 }),
  texts: z
    .object({
      headline: z.string().max(140).default(""),
      price: z.string().max(60).default(""),
      cta: z.string().max(60).default(""),
      body: z.string().max(280).default(""),
    })
    .default({ headline: "", price: "", cta: "", body: "" }),
  colors: z
    .object({ text: hex.default("#FFFFFF"), accent: hex.default("#C9A227"), accent_text: hex.default("#0B0B0D") })
    .default({ text: "#FFFFFF", accent: "#C9A227", accent_text: "#0B0B0D" }),
  text_scale: z.number().min(0.6).max(1.6).default(1),
  /** Tipografías del catálogo (títulos/precio/botón y texto secundario). */
  fonts: z
    .object({ heading: z.enum(FONT_KEYS).default(APP_FONT_KEY), body: z.enum(FONT_KEYS).default(APP_FONT_KEY) })
    .default({ heading: APP_FONT_KEY, body: APP_FONT_KEY }),
});
export type Design = z.infer<typeof designSchema>;

/** Diseño inicial a partir de un concepto y de la identidad de marca. */
export function defaultDesign(input: {
  format: { key: string; width: number; height: number };
  brand: { color_primary: string; color_background: string; font_heading?: string; font_body?: string } | null;
  concept?: { headline?: string; price?: string; cta?: string; body?: string; template?: Template } | null;
  backgroundAssetId?: string | null;
  logoAssetId?: string | null;
}): Design {
  const c = input.concept ?? {};
  return designSchema.parse({
    format_key: input.format.key,
    width: input.format.width,
    height: input.format.height,
    template: c.template ?? "band_bottom",
    background: { color: input.brand?.color_background ?? "#0B0B0D", asset_id: input.backgroundAssetId ?? null },
    logo: { asset_id: input.logoAssetId ?? null },
    texts: { headline: c.headline ?? "", price: c.price ?? "", cta: c.cta ?? "", body: c.body ?? "" },
    colors: { text: "#FFFFFF", accent: input.brand?.color_primary ?? "#C9A227", accent_text: input.brand?.color_background ?? "#0B0B0D" },
    fonts: {
      heading: matchBrandFont(input.brand?.font_heading)?.key ?? APP_FONT_KEY,
      body: matchBrandFont(input.brand?.font_body)?.key ?? APP_FONT_KEY,
    },
  });
}
