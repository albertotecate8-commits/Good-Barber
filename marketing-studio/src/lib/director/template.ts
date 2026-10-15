// Motor de estrategia por plantillas (sin IA). Usa SOLO datos registrados del
// negocio y hallazgos con fuente: nunca inventa precios, competidores ni
// estadísticas. Todo lo que no está comprobado se etiqueta como hipótesis o
// recomendación por probar.
import { formatCents } from "@/lib/money";
import { addDays, weekdayIndex } from "@/lib/tz";
import type { FindingDraft } from "@/lib/research/types";
import { slugify } from "@/lib/slug";
import type { Intent } from "./intent";
import { GOAL_LABELS, type Ad, type CampaignPlan, type Goal, type ScheduleItem } from "./plan";

export interface BusinessContext {
  business: {
    id: string;
    name: string;
    sector: string;
    city: string;
    address: string;
    service_area: string;
    target_audience: string;
    description: string;
  };
  brand: {
    color_primary: string;
    color_secondary: string;
    color_accent: string;
    color_background: string;
    font_heading: string;
    font_body: string;
    tone_of_voice: string;
    visual_rules: string;
    dos: string[];
    donts: string[];
  } | null;
  offerings: { name: string; price_cents: number | null; kind: string; description: string }[];
  promotions: { title: string; details: string; restrictions: string; starts_on: string | null; ends_on: string | null }[];
  socials: { platform: string; handle: string }[];
  assets: { id: string; title: string; kind: string; origin: string; tags: string[] }[];
}

/** Hallazgo ya guardado (con id) que el motor puede citar. */
export type SavedFinding = FindingDraft & { id: string };

type Sector = "barber" | "nails" | "afore" | "generic";
function sectorOf(s: string): Sector {
  const k = slugify(s);
  if (/barber|peluquer/.test(k)) return "barber";
  if (/una|nail|manicur/.test(k)) return "nails";
  if (/afore|retiro|pension/.test(k)) return "afore";
  return "generic";
}

/** Hechos que salen de los datos del propio negocio (fuente: la app). */
export function businessFacts(ctx: BusinessContext, now: Date): FindingDraft[] {
  const at = now.toISOString();
  const base = { source_type: "business_data" as const, source_name: "Datos del negocio en Marketing AI Studio", url: null, consulted_at: at, capture_method: "automatic" as const };
  const out: FindingDraft[] = [];
  const priced = ctx.offerings.filter((o) => o.price_cents !== null);
  if (priced.length) {
    out.push({
      ...base,
      summary: `Precios vigentes registrados: ${priced.map((o) => `${o.name} ${formatCents(o.price_cents)}`).join("; ")}.`,
      evidence: "Capturados por el dueño en la ficha del negocio.",
      evidence_level: "fact",
      confidence: "high",
    });
  }
  for (const p of ctx.promotions) {
    out.push({
      ...base,
      summary: `Promoción activa: ${p.title}${p.details ? ` — ${p.details}` : ""}.`,
      evidence: [p.restrictions && `Restricciones: ${p.restrictions}`, (p.starts_on || p.ends_on) && `Vigencia: ${p.starts_on ?? "—"} a ${p.ends_on ?? "—"}`].filter(Boolean).join(". ") || "Sin restricciones registradas.",
      evidence_level: "fact",
      confidence: "high",
    });
  }
  if (ctx.business.target_audience.trim()) {
    out.push({ ...base, summary: `Público objetivo definido por el dueño: ${ctx.business.target_audience.trim()}`, evidence: "Dato capturado en la ficha del negocio (no medido).", evidence_level: "fact", confidence: "medium" });
  }
  return out;
}

const CTA: Record<Goal, string> = {
  appointments: "Agenda tu cita por mensaje",
  messages: "Envíanos un mensaje",
  customers: "Agenda tu primera visita",
  sales: "Pide el tuyo hoy",
  awareness: "Síguenos para conocer más",
  reactivation: "Agenda tu regreso",
};

const SECTOR_WORDS: Record<Sector, { service: string; result: string; scene: string; audience: string }> = {
  barber: {
    service: "corte",
    result: "un corte limpio y bien definido",
    scene: "barbero trabajando con máquina y navaja en la silla de barbería, cliente real de perfil",
    audience: "Hombres jóvenes y adultos de la ciudad que cuidan su imagen (hipótesis: confírmalo con tus clientes actuales).",
  },
  nails: {
    service: "servicio de uñas",
    result: "uñas impecables y con diseño",
    scene: "manos con uñas recién terminadas sobre la mesa de trabajo, iluminación suave",
    audience: "Mujeres de la ciudad que se arreglan las uñas de forma periódica (hipótesis: confírmalo con tus clientas actuales).",
  },
  afore: {
    service: "asesoría",
    result: "claridad sobre tu trámite de AFORE",
    scene: "asesor explicando documentos a una persona adulta en una oficina ordenada",
    audience: "Personas cercanas al retiro o con dudas sobre su AFORE, y sus familiares (hipótesis: confírmalo con tus clientes actuales).",
  },
  generic: {
    service: "servicio",
    result: "un buen resultado",
    scene: "el negocio atendiendo a un cliente real",
    audience: "Personas de la ciudad interesadas en el servicio (hipótesis por definir).",
  },
};

export interface TemplateInput {
  ctx: BusinessContext;
  intent: Intent;
  goal: Goal;
  instruction: string;
  findings: SavedFinding[];
  today: string;
}

export function buildTemplatePlan({ ctx, intent, goal, findings, today }: TemplateInput): CampaignPlan {
  const b = ctx.business;
  const sector = sectorOf(b.sector);
  const words = SECTOR_WORDS[sector];
  const cityShort = b.city.split(",")[0].trim();
  const warnings: string[] = [];

  const priceFacts = findings.filter((f) => f.source_type === "business_data" && f.summary.startsWith("Precios"));
  const promoFacts = findings.filter((f) => f.source_type === "business_data" && f.summary.startsWith("Promoción"));
  const audienceFact = findings.find((f) => f.source_type === "business_data" && f.summary.startsWith("Público"));
  const competitorSummary = findings.find((f) => f.source_type === "osm" && /mapeados/.test(f.summary));
  const calendarInPeriod = findings.filter((f) => f.source_type === "calendar" && !f.summary.startsWith("Días de quincena"));
  const payday = findings.find((f) => f.source_type === "calendar" && f.summary.startsWith("Días de quincena"));
  const webObs = findings.filter((f) => f.source_type === "web_search" || f.source_type === "meta_ad_library" || f.capture_method === "manual");

  const priced = ctx.offerings.filter((o) => o.price_cents !== null);
  const services = priced.filter((o) => o.kind === "service");
  const packages = priced.filter((o) => o.kind === "package").sort((a, b2) => (b2.price_cents ?? 0) - (a.price_cents ?? 0));
  const main = services[0] ?? priced[0] ?? null;
  const pkg = packages[0] ?? null;
  const promo = ctx.promotions[0] ?? null;
  const cta = CTA[goal];
  const priceIds = priceFacts.map((f) => f.id);

  if (!priced.length) warnings.push("No hay precios registrados: los anuncios no mencionan precios. Agrégalos en Negocios → Servicios y precios.");
  if (!competitorSummary && !webObs.length)
    warnings.push("No hay datos de competencia con fuente. Registra hallazgos de la Biblioteca de anuncios de Meta o Google Maps antes de decidir la oferta.");

  // ---------- Estrategia ----------
  const periodTxt = `${intent.periodLabel} (${intent.start} a ${intent.end})`;
  const opportunityParts = [
    `Objetivo: ${GOAL_LABELS[goal].toLowerCase()} durante ${periodTxt}.`,
    competitorSummary ? `Según OpenStreetMap, ${competitorSummary.summary.charAt(0).toLowerCase()}${competitorSummary.summary.slice(1)} (observación, listado incompleto).` : "",
    calendarInPeriod.length ? `Fechas cercanas: ${calendarInPeriod.slice(0, 3).map((f) => f.summary.replace(/\.$/, "")).join("; ")}.` : "",
    payday ? `${payday.summary}` : "",
    promo ? `Ya existe una promoción activa («${promo.title}») que puede ser el eje.` : "",
    `Oportunidad (hipótesis): comunicar con claridad ${promo ? "la promoción vigente" : main ? "precios exactos" : "el servicio"} y facilitar ${goal === "appointments" ? "agendar por mensaje" : "el contacto"} puede ${goal === "awareness" ? "aumentar el reconocimiento" : "convertir más interesados"}; hay que medirlo.`,
  ].filter(Boolean);
  const opportunityIds = [competitorSummary?.id, ...calendarInPeriod.slice(0, 3).map((f) => f.id), payday?.id, ...promoFacts.map((f) => f.id)].filter(Boolean) as string[];

  const offerText = promo
    ? `Promoción vigente: ${promo.title}${promo.details ? ` — ${promo.details}` : ""}.${promo.restrictions ? ` Aclarar en los anuncios: ${promo.restrictions}.` : ""}`
    : main
      ? `Comunicar precios reales: ${priced.slice(0, 4).map((o) => `${o.name} ${formatCents(o.price_cents)}`).join(", ")}.${pkg ? ` Destacar el paquete «${pkg.name}» (${formatCents(pkg.price_cents)}) como opción completa.` : ""} Recomendación por probar: no crear descuentos nuevos hasta medir la respuesta con precios normales.`
      : "Definir una oferta con precio real antes de publicar (la app no inventa precios).";

  const brand = ctx.brand;
  const visualText = brand
    ? [
        `Colores de marca: principal ${brand.color_primary}, secundario ${brand.color_secondary}, acento ${brand.color_accent}, fondo ${brand.color_background}.`,
        brand.font_heading && `Tipografía de títulos: ${brand.font_heading}.`,
        brand.visual_rules && `Reglas visuales: ${brand.visual_rules}`,
        brand.dos.length ? `Siempre: ${brand.dos.join("; ")}.` : "",
        brand.donts.length ? `Nunca: ${brand.donts.join("; ")}.` : "",
        "Recomendación: priorizar fotos y videos reales del negocio; la IA solo para fondos o ambientación, nunca para simular resultados de clientes.",
      ]
        .filter(Boolean)
        .join(" ")
    : "Sin identidad de marca registrada: defínela en Negocios → Identidad de marca.";

  // ---------- Anuncios ----------
  const realPhoto = ctx.assets.find((a) => a.kind === "image" && a.origin === "real_photo") ?? ctx.assets.find((a) => a.kind === "image");
  const logo = ctx.assets.find((a) => a.kind === "logo");
  const visualBase = (scene: string, headline: string) =>
    [
      `Imagen publicitaria vertical 4:5 para «${b.name}» (${b.sector}${cityShort ? ` en ${cityShort}` : ""}).`,
      `Escena: ${scene}.`,
      brand && `Paleta: ${brand.color_background} de fondo con acentos ${brand.color_primary}.`,
      brand?.visual_rules && `Estilo: ${brand.visual_rules}`,
      `Texto exacto en la imagen: «${headline}»${brand?.font_heading ? `, tipografía ${brand.font_heading}` : ""}. No agregues otro texto, precios ni logotipos de otras marcas.`,
      "Fotografía realista, iluminación natural, sin deformaciones en manos ni rostros.",
      "Al terminar, revisa que el texto y los precios salgan exactos; si no, agrégalos con un editor.",
    ]
      .filter(Boolean)
      .join(" ");

  type Candidate = { key: string; goals: Goal[]; make: () => Ad | null };
  const candidates: Candidate[] = [
    {
      key: "price",
      goals: ["appointments", "customers", "sales", "messages"],
      make: () =>
        main && {
          angle: "Precio claro",
          headline: `${main.name} ${formatCents(main.price_cents)}`,
          primary_text: `En ${b.name}${cityShort ? `, ${cityShort},` : ""} tu ${main.name.toLowerCase()} cuesta ${formatCents(main.price_cents)}. Sin sorpresas. ${cta}.`,
          cta,
          format: "post",
          platform: "instagram",
          visual_prompt: visualBase(words.scene, `${main.name} ${formatCents(main.price_cents)}`),
          asset_hint: realPhoto ? `Usar foto real de la biblioteca: «${realPhoto.title}».` : "Tomar una foto real del servicio (con permiso del cliente).",
          basis: "recommendation",
          finding_ids: priceIds,
        },
    },
    {
      key: "package",
      goals: ["sales", "customers", "appointments"],
      make: () =>
        pkg && {
          angle: "Paquete completo",
          headline: `${pkg.name}: ${formatCents(pkg.price_cents)}`,
          primary_text: `Todo en una sola visita: ${pkg.name.toLowerCase()} por ${formatCents(pkg.price_cents)} en ${b.name}. ${cta}.`,
          cta,
          format: "carousel",
          platform: "instagram",
          visual_prompt: visualBase(`${words.scene}; composición en carrusel mostrando cada parte del paquete`, `${pkg.name} ${formatCents(pkg.price_cents)}`),
          asset_hint: "Carrusel con fotos reales de cada servicio del paquete.",
          basis: "recommendation",
          finding_ids: priceIds,
        },
    },
    {
      key: "promo",
      goals: ["sales", "customers", "appointments", "messages", "reactivation"],
      make: () =>
        promo && {
          angle: "Promoción vigente",
          headline: promo.title,
          primary_text: `${promo.title}${promo.details ? `: ${promo.details}` : ""}.${promo.restrictions ? ` ${promo.restrictions}.` : ""} ${cta}.`,
          cta,
          format: "story",
          platform: "instagram",
          visual_prompt: visualBase(words.scene, promo.title),
          asset_hint: "Historia con texto grande y la vigencia visible.",
          basis: "recommendation",
          finding_ids: promoFacts.map((f) => f.id),
        },
    },
    {
      key: "booking",
      goals: ["appointments", "messages", "customers"],
      make: () => ({
        angle: "Agenda fácil",
        headline: goal === "messages" ? "Escríbenos y te atendemos" : "Aparta tu horario por mensaje",
        primary_text: `¿Quieres ${words.result}? Escríbenos por mensaje, elige tu horario y llega directo a tu ${words.service}. ${cta}.`,
        cta,
        format: "story",
        platform: "instagram",
        visual_prompt: visualBase(`${words.scene}; un teléfono mostrando una conversación de mensajes en primer plano`, "Agenda por mensaje"),
        asset_hint: "Historia con sticker de enlace o botón de mensaje.",
        basis: "recommendation",
        finding_ids: [],
      }),
    },
    {
      key: "real-work",
      goals: ["customers", "awareness", "appointments", "sales", "reactivation", "messages"],
      make: () => ({
        angle: "Trabajo real",
        headline: `Así queda un ${words.service} en ${b.name}`,
        primary_text: `Resultados reales de nuestros clientes en ${b.name}. ${main ? `${main.name} ${formatCents(main.price_cents)}. ` : ""}${cta}.`,
        cta,
        format: "carousel",
        platform: "instagram",
        visual_prompt: "No generar con IA: este anuncio debe usar fotos reales (antes y después) de clientes que den su permiso. Mostrar resultados creados por IA sería engañoso.",
        asset_hint: realPhoto ? `Fotos reales de la biblioteca (p. ej. «${realPhoto.title}»).` : "Tomar fotos reales antes/después con permiso del cliente.",
        basis: "recommendation",
        finding_ids: [],
      }),
    },
    {
      key: "occasion",
      goals: ["customers", "appointments", "sales", "awareness", "messages", "reactivation"],
      make: () => {
        const ev = calendarInPeriod[0];
        if (!ev) return null;
        const name = ev.summary.split(":")[0];
        return {
          angle: "Fecha especial",
          headline: `Prepárate para ${name}`,
          primary_text: `${name} se acerca. Llega listo con ${words.result} en ${b.name}. ${cta}.`,
          cta,
          format: "post",
          platform: "facebook_page",
          visual_prompt: visualBase(`${words.scene}, con detalles sutiles alusivos a ${name}`, `Prepárate para ${name}`),
          asset_hint: logo ? `Incluir el logotipo «${logo.title}».` : "",
          basis: "hypothesis",
          finding_ids: [ev.id],
        };
      },
    },
    {
      key: "location",
      goals: ["customers", "awareness", "appointments"],
      make: () =>
        b.address || b.service_area
          ? {
              angle: "Cerca de ti",
              headline: `${b.name}${cityShort ? ` en ${cityShort}` : ""}`,
              primary_text: `Encuéntranos en ${b.address || b.service_area}. ${cta}.`,
              cta,
              format: "post",
              platform: "facebook_page",
              visual_prompt: visualBase(`fachada o interior real del negocio`, b.name),
              asset_hint: "Foto real de la fachada o del interior.",
              basis: "recommendation",
              finding_ids: [],
            }
          : null,
    },
    {
      key: "reactivation",
      goals: ["reactivation"],
      make: () => ({
        angle: "Te esperamos de vuelta",
        headline: "¿Hace cuánto no vienes?",
        primary_text: `Si hace tiempo no te damos tu ${words.service}, esta semana es buen momento para volver a ${b.name}. ${cta}.`,
        cta,
        format: "story",
        platform: "whatsapp",
        visual_prompt: visualBase(words.scene, "¿Hace cuánto no vienes?"),
        asset_hint: "Mensaje directo a clientes que ya te dieron su número (solo con su consentimiento).",
        basis: "recommendation",
        finding_ids: [],
      }),
    },
    {
      key: "review",
      goals: ["customers", "awareness", "appointments", "sales"],
      make: () => ({
        angle: "Opinión de un cliente real",
        headline: "Lo que dicen nuestros clientes",
        primary_text: `[Pega aquí una reseña real, con permiso del cliente] — ${cta}.`,
        cta,
        format: "post",
        platform: "facebook_page",
        visual_prompt: visualBase(words.scene, "Lo que dicen nuestros clientes"),
        asset_hint: "Captura de una reseña real (con permiso).",
        basis: "recommendation",
        finding_ids: [],
      }),
    },
  ];

  const ordered = [...candidates.filter((c) => c.goals.includes(goal)), ...candidates.filter((c) => !c.goals.includes(goal))];
  const ads: Ad[] = [];
  for (const c of ordered) {
    if (ads.length >= intent.adsCount) break;
    const ad = c.make();
    if (ad) ads.push(ad);
  }
  if (ads.length < intent.adsCount)
    warnings.push(`Solo se pudieron proponer ${ads.length} anuncios con los datos disponibles (se pidieron ${intent.adsCount}). Agrega precios, promociones o dirección para más variantes.`);
  if (ads.some((a) => a.primary_text.includes("[Pega aquí")))
    warnings.push("Un anuncio tiene un espacio para una reseña real: no lo publiques hasta reemplazarlo.");
  if (intent.wantsStories && !ads.some((a) => a.format === "story")) ads[ads.length - 1] = { ...ads[ads.length - 1], format: "story" };

  // ---------- Reel ----------
  const priceLine = promo ? promo.title : main ? `${main.name} ${formatCents(main.price_cents)}` : b.name;
  const reel = {
    duration_seconds: 20,
    hook: sector === "afore" ? "¿Sabes cuánto tienes en tu AFORE?" : `¿Listo para ${words.result}?`,
    scenes: [
      { seconds: "0–3", shot: sector === "afore" ? "Primer plano de una persona revisando su estado de cuenta, gesto de duda" : "Primer plano del cliente antes del servicio", on_screen_text: sector === "afore" ? "¿Dudas con tu AFORE?" : "Antes", voiceover: "" },
      { seconds: "3–9", shot: `Proceso real: ${words.scene}; tomas cortas de detalle`, on_screen_text: "", voiceover: "" },
      { seconds: "9–14", shot: "Resultado final real, giro lento o reacción del cliente", on_screen_text: sector === "afore" ? "Te explicamos paso a paso" : "Después", voiceover: "" },
      { seconds: "14–17", shot: "Texto grande sobre fondo de marca", on_screen_text: priceLine, voiceover: "" },
      { seconds: "17–20", shot: `Logotipo y forma de contacto`, on_screen_text: cta, voiceover: "" },
    ],
    caption: `${priceLine}. ${cta}.`,
    cta,
    footage_note:
      "Graba en vertical 9:16 con tu teléfono, con luz natural y permiso del cliente. Edita en la app de tu preferencia o con FFmpeg. Un montaje de fotos no se presenta como video generado con IA.",
    flow_prompt: `Video vertical 9:16, 4 segundos, toma de ambiente para ${b.sector}${cityShort ? ` en ${cityShort}` : ""}: ${words.scene}, movimiento de cámara lento, iluminación cálida${brand ? `, acentos de color ${brand.color_primary}` : ""}. Sin texto, sin logotipos, sin rostros reconocibles. Usar SOLO como toma de ambiente; los resultados mostrados deben ser reales.`,
  };

  // ---------- Calendario sugerido ----------
  const days: string[] = [];
  for (let d = intent.start < today ? today : intent.start; d <= intent.end && days.length < 31; d = addDays(d, 1)) days.push(d);
  if (!days.length) days.push(addDays(today, 1));
  const items = [...ads.map((_, i) => ({ ad: i, reel: false })), { ad: null as number | null, reel: true }];
  const schedule: ScheduleItem[] = items.map((it, i) => {
    const date = days[Math.min(days.length - 1, Math.floor((i * days.length) / items.length))];
    const weekend = weekdayIndex(date) >= 5;
    const ad = it.ad !== null ? ads[it.ad] : null;
    return {
      date,
      time: weekend ? "11:00" : "18:30",
      platform: ad ? ad.platform : "instagram",
      format: ad ? ad.format : "reel",
      ad_index: it.ad,
      is_reel: it.reel,
      note: "Horario sugerido a probar (hipótesis); ajústalo con tus estadísticas.",
      content_id: null,
    };
  });

  // ---------- Medición ----------
  const kpiByGoal: Record<Goal, { name: string; how_to_measure: string }[]> = {
    appointments: [
      { name: "Citas atribuidas a la campaña", how_to_measure: "Pregunta «¿cómo nos conociste?» y usa una palabra clave distinta por anuncio." },
      { name: "Mensajes recibidos", how_to_measure: "Cuenta los mensajes nuevos que mencionan el anuncio." },
      { name: "Costo por cita", how_to_measure: "Inversión en anuncios ÷ citas atribuidas (si hubo inversión)." },
    ],
    messages: [
      { name: "Mensajes recibidos", how_to_measure: "Mensajes nuevos con la palabra clave del anuncio." },
      { name: "Mensajes que terminan en cita o venta", how_to_measure: "Marca cada conversación con su resultado." },
    ],
    customers: [
      { name: "Clientes nuevos", how_to_measure: "Pregunta si es su primera visita y cómo se enteró." },
      { name: "Costo por cliente nuevo", how_to_measure: "Inversión ÷ clientes nuevos atribuidos." },
    ],
    sales: [
      { name: "Ventas atribuidas", how_to_measure: "Registra cada venta que mencione el anuncio o la promoción." },
      { name: "Ingresos atribuidos", how_to_measure: "Suma de esas ventas (MXN)." },
    ],
    awareness: [
      { name: "Alcance e interacciones", how_to_measure: "Estadísticas de Instagram/Facebook (anótalas a mano hasta conectar Meta)." },
      { name: "Seguidores nuevos", how_to_measure: "Diferencia de seguidores al inicio y al final." },
    ],
    reactivation: [
      { name: "Clientes que regresan", how_to_measure: "Clientes anteriores que agendan durante la campaña." },
      { name: "Respuestas al mensaje", how_to_measure: "Respuestas ÷ mensajes enviados." },
    ],
  };
  const kpis = kpiByGoal[goal].map((k) => ({
    ...k,
    target_note: "Sin línea base en la app: compara contra una semana normal antes de fijar una meta.",
  }));

  const measurement = [
    "1. Antes de publicar, anota cuántas citas/mensajes/ventas tienes en una semana normal (línea base).",
    `2. Asigna una palabra clave a cada anuncio (${ads.map((_, i) => `${slugify(b.name).slice(0, 2).toUpperCase()}${i + 1}`).join(", ")}) y pide al cliente que la mencione.`,
    "3. Registra cada resultado en la pestaña Experimentos de esta campaña (mensajes, citas, clientes, ventas, ingresos e inversión).",
    "4. Compara variantes solo con datos suficientes (como mínimo una semana y varias citas por variante).",
    "5. Una diferencia entre anuncios es correlación, no prueba de causa: el clima, la quincena o la temporada también influyen.",
  ].join("\n");

  return {
    version: 1,
    opportunity: { text: opportunityParts.join(" "), basis: "hypothesis", finding_ids: opportunityIds },
    audience: audienceFact
      ? { text: audienceFact.summary.replace("Público objetivo definido por el dueño: ", ""), basis: "fact", finding_ids: [audienceFact.id] }
      : { text: words.audience, basis: "hypothesis", finding_ids: [] },
    offer: {
      text: offerText,
      basis: promo || main ? "fact" : "recommendation",
      finding_ids: [...priceIds, ...promoFacts.map((f) => f.id)],
      offering_names: priced.slice(0, 6).map((o) => o.name),
    },
    visual_concept: { text: visualText, basis: brand ? "fact" : "recommendation", finding_ids: [] },
    ads,
    reel,
    schedule,
    kpis,
    measurement,
    tasks: [],
    warnings,
  };
}
