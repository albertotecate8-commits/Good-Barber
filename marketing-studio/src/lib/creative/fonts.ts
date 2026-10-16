// Tipografías disponibles en el editor. Son fuentes libres (licencia OFL,
// archivos en public/fonts con su licencia) incluidas en la app: no dependen
// de servicios externos y se ven igual en el iPhone y en la computadora.

export interface BrandFont {
  key: string;
  label: string;
  /** Nombre interno con prefijo para no chocar con fuentes del sistema. */
  family: string;
  files: { weight: number; file: string }[];
  /** Nombres con los que suele escribirse en la identidad de marca. */
  aliases: string[];
}

const f = (slug: string, weights: number[]) => weights.map((weight) => ({ weight, file: `/fonts/${slug}-latin-${weight}-normal.woff2` }));

export const APP_FONT_KEY = "app";

export const BRAND_FONTS: BrandFont[] = [
  { key: APP_FONT_KEY, label: "Inter (la de la app)", family: "", files: [], aliases: ["inter", "sistema", "system", ""] },
  { key: "montserrat", label: "Montserrat", family: "MAS Montserrat", files: f("montserrat", [500, 700, 800, 900]), aliases: ["montserrat"] },
  { key: "poppins", label: "Poppins", family: "MAS Poppins", files: f("poppins", [500, 700, 800, 900]), aliases: ["poppins"] },
  { key: "oswald", label: "Oswald (condensada)", family: "MAS Oswald", files: f("oswald", [500, 700]), aliases: ["oswald"] },
  { key: "bebas-neue", label: "Bebas Neue (títulos)", family: "MAS Bebas Neue", files: f("bebas-neue", [400]), aliases: ["bebas", "bebas neue", "bebasneue"] },
  { key: "anton", label: "Anton (títulos)", family: "MAS Anton", files: f("anton", [400]), aliases: ["anton"] },
  { key: "playfair-display", label: "Playfair Display (elegante)", family: "MAS Playfair Display", files: f("playfair-display", [500, 700, 900]), aliases: ["playfair", "playfair display"] },
  { key: "lato", label: "Lato", family: "MAS Lato", files: f("lato", [400, 700, 900]), aliases: ["lato"] },
];

export const FONT_KEYS = BRAND_FONTS.map((x) => x.key) as [string, ...string[]];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

/** Busca la tipografía de la identidad de marca en el catálogo (null si no está). */
export function matchBrandFont(name: string | null | undefined): BrandFont | null {
  const n = norm(name ?? "");
  return BRAND_FONTS.find((x) => x.aliases.includes(n) || norm(x.label) === n) ?? null;
}

export function fontByKey(key: string): BrandFont {
  return BRAND_FONTS.find((x) => x.key === key) ?? BRAND_FONTS[0];
}

/** Pila CSS para el lienzo: la fuente elegida y, de respaldo, la de la app. */
export function canvasFontStack(key: string, appFamily: string) {
  const font = fontByKey(key);
  return font.family ? `"${font.family}", ${appFamily}` : appFamily;
}

/** Peso disponible más cercano (las fuentes de un solo peso no se «engordan» artificialmente). */
export function effectiveWeight(key: string, wanted: number) {
  const font = fontByKey(key);
  if (!font.files.length) return wanted;
  return font.files.reduce((best, x) => (Math.abs(x.weight - wanted) < Math.abs(best - wanted) ? x.weight : best), font.files[0].weight);
}
