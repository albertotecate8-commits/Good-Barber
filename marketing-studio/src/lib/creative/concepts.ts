// Conceptos creativos y prompts para las herramientas que ya pagas. Parten de
// los anuncios del plan de campaña (o del motor de plantillas) para usar solo
// precios y promociones reales. Un concepto NO es una imagen: es la idea y las
// instrucciones para producirla.
import { formatCents } from "@/lib/money";
import type { CampaignPlan } from "@/lib/director/plan";
import { parseInstruction } from "@/lib/director/intent";
import { buildTemplatePlan, businessFacts, type BusinessContext } from "@/lib/director/template";
import type { CreativeFormat, MaterialType } from "./formats";
import { MATERIAL_LABELS } from "./formats";
import type { Template } from "./design";
import { detectSector, photoDirection, serviceSubject } from "./photo-direction";

export interface Concept {
  angle: string;
  headline: string;
  price: string;
  cta: string;
  body: string;
  visual_direction: string;
  template: Template;
  basis: "recommendation" | "hypothesis";
  prompts: { image: string; copy: string; video: string };
}

export interface ReferenceInfo {
  title: string;
  description: string;
  origin: string;
}

const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d{1,2})?/;

function priceFor(text: string, ctx: BusinessContext) {
  const m = PRICE_RE.exec(text);
  if (m) return m[0].replace(/\s/g, "");
  const first = ctx.offerings.find((o) => o.price_cents !== null);
  return first ? `${first.name} ${formatCents(first.price_cents)}` : "";
}

function imagePrompt(ctx: BusinessContext, material: MaterialType, format: CreativeFormat, scene: string, refs: ReferenceInfo[], adText = "") {
  const b = ctx.business;
  const brand = ctx.brand;
  const sector = detectSector(b.sector, b.name);
  const dir = photoDirection(sector);
  const subject = serviceSubject(sector, adText);
  return [
    `Crea una ${material === "product_photo" ? "fotografía de producto/servicio" : "imagen publicitaria"} para «${b.name}», ${b.sector}${b.city ? ` en ${b.city.split(",")[0]}` : ""}.`,
    `Formato: ${format.width}×${format.height} px (proporción ${format.width}:${format.height}), para ${format.label}.`,
    `Escena: ${scene}.`,
    subject ? `Sujeto principal (debe reconocerse el servicio anunciado): ${subject}.` : "",
    dir.look,
    dir.setting,
    brand ? `Paleta: fondo ${brand.color_background}, acentos ${brand.color_primary} y ${brand.color_accent}. ${brand.visual_rules}` : "",
    format.safe.top || format.safe.bottom ? `Deja libre de elementos importantes la franja superior (${format.safe.top}px) e inferior (${format.safe.bottom}px).` : "",
    "NO incluyas texto, precios, letras ni logotipos en la imagen: se agregan después con el editor para que salgan exactos.",
    dir.avoid,
    refs.length ? `Usa como referencia visual las imágenes que adjunto (${refs.map((r) => `«${r.title}»`).join(", ")}): respeta el estilo del lugar real.` : "",
    dir.note,
  ]
    .filter(Boolean)
    .join("\n");
}

function videoPrompt(ctx: BusinessContext, scene: string) {
  return [
    `Toma de ambiente de 4 a 8 segundos, vertical 9:16, para ${ctx.business.name} (${ctx.business.sector}).`,
    `Escena: ${scene}. Movimiento de cámara lento y estable, luz cálida${ctx.brand ? `, acentos de color ${ctx.brand.color_primary}` : ""}.`,
    "Sin texto, sin logotipos, sin rostros reconocibles. Solo ambientación: los resultados reales de clientes se graban, no se generan.",
  ].join("\n");
}

export function generateConcepts(input: {
  ctx: BusinessContext;
  material: MaterialType;
  format: CreativeFormat;
  instruction: string;
  plan: CampaignPlan | null;
  references: ReferenceInfo[];
  today: string;
}): Concept[] {
  const { ctx, material, format, references, today } = input;
  const plan =
    input.plan ??
    buildTemplatePlan({
      ctx,
      intent: parseInstruction(input.instruction || "tres anuncios", today),
      goal: "customers",
      instruction: input.instruction,
      findings: businessFacts(ctx, new Date()).map((f, i) => ({ ...f, id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` })),
      today,
    });
  const templates: Template[] = material === "story" || format.height > format.width * 1.5 ? ["centered", "headline_top", "band_bottom"] : ["band_bottom", "price_badge", "headline_top"];
  const scenes = plan.ads.map((a) => (a.visual_prompt.match(/Escena: ([^.]+)\./)?.[1] ?? `${ctx.business.sector} con clientes reales`));

  return plan.ads.slice(0, 3).map((ad, i) => {
    const scene = scenes[i] ?? scenes[0];
    const price = priceFor(`${ad.headline} ${ad.primary_text}`, ctx);
    const headline = ad.headline.replace(PRICE_RE, "").replace(/[:\s-]+$/, "").trim() || ad.headline;
    return {
      angle: ad.angle,
      headline,
      price,
      cta: ad.cta,
      body: "",
      visual_direction: `${scene}. ${ad.asset_hint}`.trim(),
      template: templates[i % templates.length],
      basis: ad.basis === "hypothesis" ? "hypothesis" : "recommendation",
      prompts: {
        image: imagePrompt(ctx, material, format, scene, references, `${ad.headline} ${ad.primary_text}`),
        copy: [
          `Escribe 3 variantes de texto para ${MATERIAL_LABELS[material].toLowerCase()} de «${ctx.business.name}» con el enfoque «${ad.angle}».`,
          `Texto base: «${ad.primary_text}». Llamada a la acción: «${ad.cta}».`,
          `Precios reales (no inventes otros): ${ctx.offerings.filter((o) => o.price_cents !== null).map((o) => `${o.name} ${formatCents(o.price_cents)}`).join(", ") || "ninguno registrado"}.`,
          "No prometas resultados, no uses escasez falsa ni superlativos sin respaldo. Español de México.",
        ].join("\n"),
        video: videoPrompt(ctx, scene),
      },
    };
  });
}
