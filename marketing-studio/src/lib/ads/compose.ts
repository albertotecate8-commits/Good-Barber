// Redacción de anuncios para el asistente «Crear anuncio». Sin IA y sin costo:
// combina SOLO los datos registrados del negocio (nombre, ciudad, giro,
// servicios, precios y promociones). Nunca inventa precios, descuentos,
// resultados ni testimonios. Cada «Volver a generar» cambia el enfoque.
import { formatCents, parsePriceToCents } from "@/lib/money";
import { slugify } from "@/lib/slug";

export const AD_GOALS = [
  { key: "customers", label: "Atraer clientes nuevos", description: "Que te conozca gente que aún no te visita" },
  { key: "promote", label: "Promocionar un servicio", description: "Destacar un servicio o paquete concreto" },
  { key: "appointments", label: "Conseguir citas", description: "Que agenden por mensaje o llamada" },
  { key: "reactivation", label: "Recuperar clientes", description: "Invitar a volver a quien ya te visitó" },
  { key: "news", label: "Anunciar una novedad", description: "Un servicio nuevo, horario o cambio" },
] as const;
export type AdGoal = (typeof AD_GOALS)[number]["key"];

export const AD_FORMATS = [
  { key: "post", label: "Publicación", description: "Imagen 4:5 para el feed", ratio: "4 / 5" },
  { key: "story", label: "Historia", description: "Vertical 9:16, dura 24 h", ratio: "9 / 16" },
  { key: "reel", label: "Anuncio vertical", description: "Video o imagen 9:16", ratio: "9 / 16" },
  { key: "carousel", label: "Carrusel", description: "Varias imágenes 4:5", ratio: "4 / 5" },
] as const;
export type AdFormat = (typeof AD_FORMATS)[number]["key"];

export interface AdBusiness {
  name: string;
  city: string;
  sector: string;
}

export interface AdOffer {
  kind: "offering" | "promotion" | "custom";
  name: string;
  /** Solo si el precio está registrado (o lo escribiste tú). */
  priceCents: number | null;
  details?: string;
  restrictions?: string;
}

export interface AdVariant {
  angle: string;
  headline: string;
  text: string;
  cta: string;
  hashtags: string[];
}

const CTA: Record<AdGoal, string> = {
  customers: "Escríbenos por mensaje",
  promote: "Pregunta por mensaje",
  appointments: "Agenda tu cita por mensaje",
  reactivation: "Agenda tu próxima visita",
  news: "Ven a conocerlo",
};

const cityOf = (b: AdBusiness) => b.city.split(",")[0].trim();
const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);

type Template = { angle: string; usable: (o: AdOffer, g: AdGoal) => boolean; make: (b: AdBusiness, o: AdOffer, g: AdGoal) => { headline: string; body: string } };

const TEMPLATES: Template[] = [
  {
    angle: "Precio claro",
    usable: (o) => o.priceCents !== null,
    make: (b, o) => ({
      headline: `${o.name} ${formatCents(o.priceCents)}`,
      body: `En ${b.name}${cityOf(b) ? `, ${cityOf(b)},` : ""} tu ${lower(o.name)} cuesta ${formatCents(o.priceCents)}. Sin sorpresas.`,
    }),
  },
  {
    angle: "Promoción vigente",
    usable: (o) => o.kind === "promotion",
    make: (b, o) => ({
      headline: o.name,
      body: `${o.name}${o.details ? `: ${o.details}` : ""} en ${b.name}.${o.restrictions ? ` ${o.restrictions}.` : ""}`,
    }),
  },
  {
    angle: "Beneficio",
    usable: () => true,
    make: (b, o, g) => ({
      headline: g === "reactivation" ? `Te extrañamos en ${b.name}` : g === "news" ? `Nuevo en ${b.name}: ${lower(o.name)}` : `${o.name} en ${b.name}`,
      body:
        g === "reactivation"
          ? `Hace tiempo que no te vemos. Vuelve por tu ${lower(o.name)}${o.priceCents !== null ? ` (${formatCents(o.priceCents)})` : ""}, te atendemos como siempre.`
          : g === "news"
            ? `Ya puedes pedir ${lower(o.name)} en ${b.name}${cityOf(b) ? ` (${cityOf(b)})` : ""}.${o.details ? ` ${o.details}.` : ""}`
            : `Date el gusto de un ${lower(o.name)} bien hecho en ${b.name}${cityOf(b) ? `, ${cityOf(b)}` : ""}.${o.details ? ` ${o.details}.` : ""}`,
    }),
  },
  {
    angle: "Cercanía",
    usable: (_o, _g) => true,
    make: (b, o) => ({
      headline: cityOf(b) ? `${o.name} en ${cityOf(b)}` : `${o.name} cerca de ti`,
      body: `¿Buscas ${lower(o.name)}${cityOf(b) ? ` en ${cityOf(b)}` : ""}? En ${b.name} te atendemos con cita y sin complicaciones.${o.priceCents !== null ? ` Precio: ${formatCents(o.priceCents)}.` : ""}`,
    }),
  },
  {
    angle: "Pregunta directa",
    usable: () => true,
    make: (b, o, g) => ({
      headline: g === "appointments" ? `¿Ya agendaste tu ${lower(o.name)}?` : `¿Te toca ${lower(o.name)}?`,
      body: `${b.name} tiene espacio para ti.${o.priceCents !== null ? ` ${o.name}: ${formatCents(o.priceCents)}.` : ""}${o.restrictions ? ` ${o.restrictions}.` : ""}`,
    }),
  },
];

function hashtagsFor(b: AdBusiness, o: AdOffer): string[] {
  const tags = [slugify(b.sector), slugify(cityOf(b)), slugify(b.name), slugify(o.name)]
    .map((t) => t.replace(/-/g, ""))
    .filter((t) => t.length >= 3 && t.length <= 30);
  return [...new Set(tags)].slice(0, 4);
}

/**
 * Tres propuestas para el objetivo, oferta y formato elegidos. `round`
 * (0, 1, 2…) rota los enfoques para «Volver a generar».
 */
export function composeAds(input: { business: AdBusiness; goal: AdGoal; offer: AdOffer; format: AdFormat; round?: number }): AdVariant[] {
  const { business, goal, offer, format } = input;
  const usable = TEMPLATES.filter((t) => t.usable(offer, goal));
  const start = ((input.round ?? 0) * 3) % usable.length;
  const picked = Array.from({ length: Math.min(3, usable.length) }, (_, i) => usable[(start + i) % usable.length]);
  const cta = CTA[goal];
  const short = format === "story" || format === "reel";
  return picked.map((t) => {
    const { headline, body } = t.make(business, offer, goal);
    const text = short ? `${body.split(/(?<=\.)\s/)[0]} ${cta}.` : `${body} ${cta}.`;
    return { angle: t.angle, headline: clip(headline, 70), text: text.replace(/\s+/g, " ").trim(), cta, hashtags: hashtagsFor(business, offer) };
  });
}

/**
 * Montos escritos en el texto que no coinciden con ningún precio registrado
 * (para avisar antes de guardar; nunca se corrigen solos).
 */
export function unknownPrices(text: string, knownCents: number[]): string[] {
  const known = new Set(knownCents);
  const found = text.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g) ?? [];
  return [...new Set(found.filter((m) => {
    try {
      const c = parsePriceToCents(m.replace(/\s/g, ""));
      return c === null || !known.has(c);
    } catch {
      return true;
    }
  }))];
}
