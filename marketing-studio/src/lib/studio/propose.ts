// Propuestas del chat creativo. Sin IA de pago: combina la identidad del
// negocio, su memoria guardada, el estilo elegido y los ajustes pedidos para
// redactar cada propuesta y el prompt exacto para generar la imagen en ChatGPT
// (u otra herramienta). Nunca inventa precios ni promociones: usa solo los
// registrados. Una propuesta NO es una imagen hasta que se importa el resultado.
import { composeAds, unknownPrices, type AdFormat, type AdGoal, type AdOffer } from "@/lib/ads/compose";
import type { BusinessContext } from "@/lib/director/template";
import { detectSector, photoDirection, serviceSubject } from "@/lib/creative/photo-direction";
import { formatCents } from "@/lib/money";
import { MODIFIERS, type ChatFormat, type ModifierKey, type ParsedMessage } from "./intent";
import { describeStyle, MEMORY_LABELS, type MemoryItem, type Style } from "./styles";

export const CHAT_FORMATS: Record<ChatFormat, { label: string; width: number; height: number; ratio: string }> = {
  post: { label: "Publicación 4:5", width: 1080, height: 1350, ratio: "4 / 5" },
  story: { label: "Historia 9:16", width: 1080, height: 1920, ratio: "9 / 16" },
  reel: { label: "Portada vertical 9:16", width: 1080, height: 1920, ratio: "9 / 16" },
  carousel: { label: "Carrusel 4:5", width: 1080, height: 1350, ratio: "4 / 5" },
};

export interface Proposal {
  key: string;
  title: string;
  angle: string;
  headline: string;
  price: string;
  text: string;
  cta: string;
  hashtags: string[];
  format: ChatFormat;
  concept: string;
  layout: string;
  offer: { kind: AdOffer["kind"]; name: string; priceCents: number | null };
  styleId: string | null;
  styleName: string | null;
  modifiers: ModifierKey[];
  includeText: boolean;
  prompt: string;
  /** Avisos verificables (precios no registrados, datos faltantes). */
  warnings: string[];
  /** Propuesta de la que sale (ajustes y adaptaciones). */
  parentKey: string | null;
}

interface Direction {
  name: string;
  concept: (subject: string) => string;
  layout: (f: ChatFormat) => string;
}

const DIRECTIONS: Direction[] = [
  {
    name: "Resultado protagonista",
    concept: (s) => `Retrato de 3/4 que muestra el resultado terminado: ${s}. Fondo sobrio y desenfocado.`,
    layout: (f) => (f === "post" || f === "carousel" ? "Sujeto en los dos tercios superiores; franja inferior con titular, precio y llamada a la acción." : "Sujeto al centro; titular arriba dentro de la zona segura y llamada a la acción abajo, lejos de los botones de la app."),
  },
  {
    name: "El oficio en acción",
    concept: (s) => `Primer plano de las manos del profesional trabajando con herramientas reales; se adivina el resultado: ${s}. Sensación de precisión y cuidado.`,
    layout: () => "Acción en diagonal de izquierda a derecha; titular en bloque arriba a la izquierda; precio en una etiqueta discreta.",
  },
  {
    name: "Oferta clara",
    concept: (s) => `Composición tipográfica con una foto recortada del servicio (${s}) y mucho espacio libre para que la oferta se lea en un segundo.`,
    layout: () => "Precio y servicio como elemento principal (grande, centrado); foto como apoyo; llamada a la acción en botón al pie.",
  },
  {
    name: "Ambiente del lugar",
    concept: () => "Vista del local real con luz cálida: sillón, espejo y herramientas ordenadas, sin personas reconocibles. Invita a visitar.",
    layout: () => "Imagen a sangre completa con degradado oscuro abajo para el texto.",
  },
];

const MODIFIER_PROMPTS: Record<ModifierKey, string> = {
  premium: "Estética premium: iluminación de estudio con contraste suave, paleta reducida (2 o 3 colores), espacio negativo generoso, tipografía elegante y materiales nobles (madera, piel, metal cepillado). Evita brillos exagerados, destellos y efectos baratos.",
  natural: "Aspecto natural, que no parezca hecho con IA: textura real de piel y cabello, luz creíble, imperfecciones sutiles, proporciones anatómicas correctas. Sin piel plástica, sin HDR, sin brillo exagerado ni simetría irreal.",
  minimal: "Composición limpia: un solo sujeto, pocos elementos, fondo simple y mucho aire alrededor del texto.",
  bold: "Más impacto visual: contraste alto entre sujeto y fondo, titular grande y un color de acento fuerte de la marca.",
  warm: "Tonos cálidos (ámbar, madera, luz de tungsteno suave).",
  cool: "Tonos fríos (azules y grises neutros) sin perder el tono natural de la piel.",
  bright: "Imagen más luminosa: exposición alta, sombras suaves, fondo claro.",
  dark: "Imagen más oscura y dramática: fondo profundo, luz lateral recortada sobre el sujeto.",
  keep_composition: "Conserva EXACTAMENTE la composición de la imagen anterior que adjunto: mismo encuadre, posición del sujeto, del texto y del logotipo. Cambia solo lo que se indica abajo.",
  change_colors: "Cambia la paleta de color como se indica en «Identidad», manteniendo la legibilidad del texto.",
  change_offer: "La oferta cambia: usa solo el nuevo texto exacto indicado abajo.",
  bigger_text: "El titular y el precio deben ser más grandes y legibles en el teléfono (ocupan al menos el 15% del alto).",
  no_text: "NO incluyas texto, precios ni letras en la imagen: se agregan después con el editor.",
};

function offersOf(ctx: BusinessContext): AdOffer[] {
  return [
    ...ctx.promotions.map((p) => ({ kind: "promotion" as const, name: p.title, priceCents: null, details: p.details, restrictions: p.restrictions })),
    ...ctx.offerings.map((o) => ({ kind: "offering" as const, name: o.name, priceCents: o.price_cents, details: o.description })),
  ];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function brandBlock(ctx: BusinessContext, rotateColors: number) {
  const b = ctx.brand;
  if (!b) return "Identidad: el negocio aún no tiene colores ni tipografías guardados; usa una paleta sobria y coherente con el giro.";
  const colors = [b.color_primary, b.color_secondary, b.color_accent];
  const r = rotateColors % 3;
  const [main, second, accent] = [colors[r], colors[(r + 1) % 3], colors[(r + 2) % 3]];
  return [
    `Identidad de ${ctx.business.name}: color dominante ${main}, secundario ${second}, acento ${accent}, fondo ${rotateColors ? second : b.color_background}.`,
    b.font_heading || b.font_body ? `Tipografía de la marca: ${[b.font_heading, b.font_body].filter(Boolean).join(" / ")}.` : "",
    b.tone_of_voice ? `Tono: ${b.tone_of_voice}.` : "",
    b.visual_rules ? `Reglas visuales: ${b.visual_rules}` : "",
    b.dos.length ? `Siempre: ${b.dos.join("; ")}.` : "",
    b.donts.length ? `Nunca: ${b.donts.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ProposeInput {
  ctx: BusinessContext;
  parsed: ParsedMessage;
  memory: MemoryItem[];
  style: Style | null;
  previous: Proposal[];
  /** Ronda (para variar enfoques al pedir más). */
  round: number;
  hasLogo: boolean;
  referenceCount: number;
}

export function buildPrompt(p: Omit<Proposal, "prompt" | "warnings">, input: Pick<ProposeInput, "ctx" | "memory" | "style" | "hasLogo" | "referenceCount"> & { rotateColors: number }) {
  const { ctx, memory, style } = input;
  const b = ctx.business;
  const sector = detectSector(b.sector, b.name);
  const dir = photoDirection(sector);
  const fmt = CHAT_FORMATS[p.format];
  const rules = memory.filter((m) => m.active && ["preference", "restriction", "correction", "audience", "fact"].includes(m.kind));
  const lines = [
    `Crea una imagen publicitaria para «${b.name}» (${b.sector}${b.city ? `, ${b.city.split(",")[0]}` : ""}).`,
    `Formato: ${fmt.width}×${fmt.height} px (${fmt.label}).`,
    `Concepto «${p.angle} · ${p.title}»: ${p.concept}`,
    `Composición: ${p.layout}`,
    dir.look,
    brandBlock(ctx, input.rotateColors),
    style ? `Estilo guardado «${style.name}» (aplícalo sin copiar la imagen original):\n${describeStyle(style).join("\n")}` : "",
    rules.length ? `Memoria del negocio (respétala):\n${rules.map((m) => `- ${MEMORY_LABELS[m.kind]}: ${m.text}`).join("\n")}` : "",
    p.modifiers.length ? `Ajustes pedidos:\n${p.modifiers.map((m) => `- ${MODIFIER_PROMPTS[m]}`).join("\n")}` : "",
    p.includeText
      ? [
          "Texto EXACTO dentro de la imagen (respeta ortografía, acentos y signos; no agregues otras palabras, precios ni descuentos):",
          `- Titular: «${p.headline}»`,
          p.price ? `- Precio: «${p.price}»` : "- Sin precio (no hay uno registrado para esta oferta).",
          `- Llamada a la acción: «${p.cta}»`,
        ].join("\n")
      : "",
    input.hasLogo
      ? `Logotipo: usa SOLO el logotipo de ${b.name} que adjunto, sin redibujarlo ni alterarlo, pequeño y en una esquina con buen contraste.`
      : `Logotipo: no dibujes ni inventes un logotipo; deja libre la esquina superior para agregar el de ${b.name} después.`,
    input.referenceCount
      ? `Referencias adjuntas (${input.referenceCount}): toma solo su composición, paleta, iluminación y ritmo visual. No copies sus logotipos, textos, personas, marcas ni la obra exacta.`
      : "",
    "No incluyas logotipos, marcas ni personajes de terceros.",
    dir.avoid.replace(/, texto y logotipos\.$/, ".").replace(/texto y logotipos/, "marcas ajenas"),
  ];
  return lines.filter(Boolean).join("\n\n");
}

/** Arma las propuestas de una respuesta del chat. */
export function propose(input: ProposeInput): Proposal[] {
  const { ctx, parsed, previous } = input;
  const offers = offersOf(ctx);
  const known = ctx.offerings.flatMap((o) => (o.price_cents === null ? [] : [o.price_cents]));
  const sector = detectSector(ctx.business.sector, ctx.business.name);
  const goal: AdGoal = /cita/.test(norm(ctx.business.description ?? "")) ? "appointments" : "customers";

  const finish = (p: Omit<Proposal, "prompt" | "warnings">, rotateColors: number): Proposal => {
    const warnings: string[] = [];
    const bad = unknownPrices(`${p.headline} ${p.price} ${p.text}`, known);
    if (bad.length) warnings.push(`Precio no registrado: ${bad.join(", ")}. Corrígelo en «Negocios» o quítalo antes de aprobar.`);
    if (!offers.length) warnings.push("Este negocio no tiene servicios ni promociones registrados: la propuesta no menciona precios.");
    if (!input.hasLogo) warnings.push("No hay logotipo guardado: súbelo en Estilos y memoria para que salga exacto.");
    return { ...p, prompt: buildPrompt(p, { ...input, rotateColors }), warnings };
  };

  // Ajuste o adaptación de una propuesta anterior.
  if (parsed.kind === "modify" && previous.length) {
    const src = previous[Math.min(previous.length, Math.max(1, parsed.target ?? previous.length)) - 1];
    let offer = src.offer;
    if (parsed.modifiers.includes("change_offer") || (parsed.offerName && norm(parsed.offerName) !== norm(src.offer.name))) {
      const pool = offers.filter((o) => norm(o.name) !== norm(src.offer.name));
      const pick = (parsed.offerName && offers.find((o) => norm(o.name) === norm(parsed.offerName!))) || pool[0];
      if (pick) offer = { kind: pick.kind, name: pick.name, priceCents: pick.priceCents };
    }
    const format = parsed.format ?? src.format;
    const ad = offerChanged(offer, src)
      ? composeAds({ business: ctx.business, goal, offer: offers.find((o) => o.name === offer.name)!, format: format as AdFormat })[0]
      : null;
    const mods = [...new Set([...src.modifiers.filter((m) => m !== "keep_composition" && m !== "change_offer" && m !== "change_colors"), ...parsed.modifiers])];
    const p = {
      ...src,
      key: `${src.key.split("~")[0]}~${Date.now().toString(36)}`,
      parentKey: src.key,
      format,
      offer,
      headline: ad ? ad.headline.replace(/\s*\$[\d,.]+$/, "") : src.headline,
      price: ad ? (offer.priceCents !== null ? formatCents(offer.priceCents) : "") : src.price,
      text: ad ? ad.text : src.text,
      cta: ad ? ad.cta : src.cta,
      styleId: parsed.styleId ?? src.styleId,
      styleName: input.style?.name ?? src.styleName,
      modifiers: mods,
      includeText: !mods.includes("no_text"),
      layout: format !== src.format ? DIRECTIONS.find((d) => d.name === src.title)?.layout(format) ?? src.layout : src.layout,
    };
    return [finish(p, parsed.modifiers.includes("change_colors") ? 1 + (previous.length % 2) : 0)];
  }

  // Nueva tanda.
  const chosen = parsed.offerName ? offers.find((o) => norm(o.name) === norm(parsed.offerName!)) : null;
  const format = parsed.format ?? "post";
  const count = Math.min(4, Math.max(1, parsed.count));
  const out: Proposal[] = [];
  for (let i = 0; i < count; i++) {
    const offer: AdOffer = chosen ?? offers[(input.round + i) % Math.max(1, offers.length)] ?? { kind: "custom", name: ctx.business.sector || "Nuestro servicio", priceCents: null };
    const ad = composeAds({ business: ctx.business, goal, offer, format: format as AdFormat, round: input.round + i })[i % 3] ?? composeAds({ business: ctx.business, goal, offer, format: format as AdFormat })[0];
    const dir = DIRECTIONS[(input.round * count + i) % DIRECTIONS.length];
    const subject = serviceSubject(sector, offer.name) ?? (offer.kind === "custom" ? ctx.business.sector : offer.name.toLowerCase());
    out.push(
      finish(
        {
          key: `p${input.round}-${i + 1}-${Date.now().toString(36)}`,
          parentKey: null,
          title: dir.name,
          angle: ad.angle,
          headline: ad.headline.replace(/\s*\$[\d,.]+$/, ""),
          price: offer.priceCents !== null ? formatCents(offer.priceCents) : "",
          text: ad.text,
          cta: ad.cta,
          hashtags: ad.hashtags,
          format,
          concept: dir.concept(subject),
          layout: dir.layout(format),
          offer: { kind: offer.kind, name: offer.name, priceCents: offer.priceCents },
          styleId: input.style?.id ?? null,
          styleName: input.style?.name ?? null,
          modifiers: parsed.modifiers.filter((m) => m !== "keep_composition"),
          includeText: !parsed.modifiers.includes("no_text"),
        },
        parsed.modifiers.includes("change_colors") ? 1 : 0,
      ),
    );
  }
  return out;
}

function offerChanged(offer: Proposal["offer"], src: Proposal) {
  return norm(offer.name) !== norm(src.offer.name);
}

/** Texto de la respuesta del asistente: qué hizo y con qué datos, sin exagerar. */
export function replyText(input: { parsed: ParsedMessage; proposals: Proposal[]; style: Style | null; memoryCount: number; businessName: string; canGenerate?: boolean }): string {
  const { parsed, proposals, style } = input;
  const parts: string[] = [];
  if (parsed.kind === "modify") {
    const mods = parsed.modifiers.map((m) => MODIFIERS[m].label.toLowerCase());
    parts.push(`Preparé una nueva versión${mods.length ? ` (${mods.join(", ")})` : ""}${parsed.format ? ` en formato ${CHAT_FORMATS[parsed.format].label}` : ""}.`);
    if (parsed.modifiers.includes("keep_composition")) parts.push("Para conservar la composición, adjunta en ChatGPT la imagen anterior junto con el prompt.");
  } else {
    parts.push(`Preparé ${proposals.length} propuesta${proposals.length === 1 ? "" : "s"} para ${input.businessName}.`);
  }
  if (style) parts.push(`Usé el estilo guardado «${style.name}»${parsed.styleReason ? ` (${parsed.styleReason})` : ""}.`);
  if (parsed.styleMissing) parts.push(parsed.styleMissing);
  parts.push(input.memoryCount ? `Incluí ${input.memoryCount} dato${input.memoryCount === 1 ? "" : "s"} de la memoria de este negocio.` : "Este negocio aún no tiene memoria guardada.");
  parts.push(
    input.canGenerate
      ? "Todavía son textos y prompts, no imágenes: usa «Generar imagen» (Cloudflare, gratis) o copia el prompt en ChatGPT y pega aquí el resultado."
      : "Son textos y prompts, todavía no imágenes: copia el prompt en ChatGPT, genera la imagen y súbela aquí para compararla y aprobarla.",
  );
  return parts.join(" ");
}

export type ReferenceRole = "previous" | "style" | "reference";

const ROLE_TEXT: Record<ReferenceRole, string> = {
  previous: "es la versión anterior: conserva su composición, encuadre y sujeto, y aplica solo los cambios pedidos",
  style: "es la referencia del estilo guardado: toma solo su paleta, iluminación y ambiente; no copies su contenido, personas, textos ni logotipos",
  reference: "es una referencia que adjuntó el negocio: úsala como guía visual (lugar, producto o trabajo real), sin copiar logotipos ni textos de terceros",
};

/**
 * Prompt para la generación directa (Cloudflare FLUX.2). Parte del prompt de la
 * propuesta, quita lo que solo aplica a ChatGPT (adjuntar archivos) y, salvo que
 * se pida, genera SIN texto: los textos exactos y el logotipo se ponen después
 * con el editor para que nunca salgan deformes ni con precios inventados.
 */
export function generationPrompt(p: Pick<Proposal, "prompt">, roles: ReferenceRole[], includeText: boolean): string {
  const blocks = p.prompt
    .split("\n\n")
    .filter((b) => !/^(Logotipo:|Referencias adjuntas)/.test(b))
    .filter((b) => includeText || !b.startsWith("Texto EXACTO"));
  const refs = roles.map((r, i) => `La imagen de referencia ${i} ${ROLE_TEXT[r]}.`);
  return [
    ...blocks,
    ...(refs.length ? [refs.join("\n")] : []),
    includeText
      ? "Escribe solo el texto exacto indicado, con letras claras; no dibujes ningún logotipo."
      : "NO incluyas texto, letras, números, precios ni logotipos en la imagen: se agregan después con el editor. Deja libre el espacio donde irá el titular según la composición.",
  ]
    .join("\n\n")
    .slice(0, 3900);
}
