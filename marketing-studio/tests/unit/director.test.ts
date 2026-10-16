import { describe, expect, it } from "vitest";
import { parseInstruction } from "@/lib/director/intent";
import { buildTemplatePlan, businessFacts, type BusinessContext, type SavedFinding } from "@/lib/director/template";
import { extractJsonObject, findUnknownPrices, parsePlan } from "@/lib/director/plan";
import { strategyPrompt } from "@/lib/director/prompts";
import { generatePlanWithGemini, geminiUnavailableReason } from "@/lib/director/gemini";
import { recommendations, totals, type ExperimentRow } from "@/lib/director/experiments";
import { calendarFindings } from "@/lib/research/calendar";

const TODAY = "2026-10-15"; // jueves
const NOW = new Date("2026-10-15T18:00:00Z");

const goodBarber: BusinessContext = {
  business: { id: "b1", name: "Good Barber", sector: "Barbería", city: "Durango, Durango", address: "", service_area: "", target_audience: "", description: "" },
  brand: {
    color_primary: "#D6A73A", color_secondary: "#10130F", color_accent: "#F2D07A", color_background: "#05070B",
    font_heading: "Inter", font_body: "Inter", tone_of_voice: "", visual_rules: "Fondo negro, acentos dorados.", dos: [], donts: [],
  },
  offerings: [
    { name: "Corte", price_cents: 12000, kind: "service", description: "" },
    { name: "Barba", price_cents: 5000, kind: "service", description: "" },
    { name: "Corte, barba y cejas", price_cents: 19900, kind: "package", description: "" },
  ],
  promotions: [],
  socials: [],
  assets: [],
};
const withIds = (f: ReturnType<typeof businessFacts>): SavedFinding[] => f.map((x, i) => ({ ...x, id: `00000000-0000-4000-8000-00000000000${i}` }));

describe("intérprete de instrucciones", () => {
  it("entiende el ejemplo de Good Barber", () => {
    const i = parseInstruction(
      "Prepara una campaña para Good Barber que consiga más citas esta semana. Investiga la competencia de Durango, propón cinco anuncios distintos y crea un Reel",
      TODAY,
    );
    expect(i).toMatchObject({ wantsResearch: true, wantsCompetitors: true, adsCount: 5, wantsReel: true, suggestedGoal: "appointments", start: TODAY, end: "2026-10-18" });
    expect(i.tasks.map((t) => t.kind)).toEqual(["context", "research", "strategy", "ads", "reel", "schedule", "prompts", "measurement"]);
  });
  it("cuenta anuncios en número o palabra y limita a 10", () => {
    expect(parseInstruction("haz 3 anuncios", TODAY).adsCount).toBe(3);
    expect(parseInstruction("dos publicaciones para el fin de semana", TODAY).adsCount).toBe(2);
    expect(parseInstruction("haz 40 anuncios", TODAY).adsCount).toBe(10);
  });
  it("interpreta periodos", () => {
    expect(parseInstruction("este fin de semana", TODAY)).toMatchObject({ start: "2026-10-16", end: "2026-10-18" });
    expect(parseInstruction("este mes", TODAY)).toMatchObject({ start: TODAY, end: "2026-10-31" });
    expect(parseInstruction("los próximos 10 días", TODAY)).toMatchObject({ start: "2026-10-16", end: "2026-10-25" });
    expect(parseInstruction("algo", TODAY)).toMatchObject({ start: "2026-10-16", end: "2026-10-22" });
  });
  it("sugiere el objetivo", () => {
    expect(parseInstruction("quiero más mensajes por WhatsApp", TODAY).suggestedGoal).toBe("messages");
    expect(parseInstruction("recuperar clientes inactivos", TODAY).suggestedGoal).toBe("reactivation");
  });
});

describe("motor de estrategia por plantillas", () => {
  const intent = parseInstruction("Prepara una campaña que consiga más citas esta semana, cinco anuncios y un Reel", TODAY);
  const facts = withIds(businessFacts(goodBarber, NOW));
  const plan = buildTemplatePlan({ ctx: goodBarber, intent, goal: "appointments", instruction: "", findings: facts, today: TODAY });

  it("produce un plan válido con cinco anuncios distintos, Reel y calendario", () => {
    expect(parsePlan(plan).ok).toBe(true);
    expect(plan.ads).toHaveLength(5);
    expect(new Set(plan.ads.map((a) => a.angle)).size).toBe(5);
    expect(plan.reel?.scenes.length).toBeGreaterThan(2);
    expect(plan.schedule).toHaveLength(6);
    expect(plan.schedule.every((s) => s.date >= TODAY && s.date <= "2026-10-18")).toBe(true);
  });
  it("cada alternativa explica por qué probarla y qué medir (como hipótesis)", () => {
    for (const ad of plan.ads) expect(ad.test_rationale).toMatch(/^Hipótesis: .+(Mide|Compara)/);
  });
  it("solo usa precios registrados", () => {
    expect(findUnknownPrices(plan, [12000, 5000, 19900])).toEqual([]);
    expect(plan.ads[0].headline).toBe("Corte $120");
  });
  it("cita los hechos de precios y avisa que falta evidencia de competencia", () => {
    expect(plan.offer.basis).toBe("fact");
    expect(plan.offer.finding_ids).toContain(facts[0].id);
    expect(plan.warnings.join(" ")).toMatch(/competencia/);
  });
  it("marca el público como hipótesis si el dueño no lo definió", () => {
    expect(plan.audience.basis).toBe("hypothesis");
  });
  it("no promete resultados ni usa escasez falsa", () => {
    const all = JSON.stringify(plan).toLowerCase();
    expect(all).not.toMatch(/garantiza|últimos lugares|ultimos lugares|100%/);
  });
  it("no pide generar con IA resultados de clientes", () => {
    const real = plan.ads.find((a) => a.angle === "Trabajo real");
    expect(real?.visual_prompt).toMatch(/No generar con IA/);
  });
  it("sin precios no menciona ninguno y lo advierte", () => {
    const noPrices = { ...goodBarber, offerings: [] };
    const p = buildTemplatePlan({ ctx: noPrices, intent, goal: "appointments", instruction: "", findings: [], today: TODAY });
    expect(JSON.stringify(p.ads)).not.toMatch(/\$\d/);
    expect(p.warnings.join(" ")).toMatch(/No hay precios/);
  });
  it("usa la promoción vigente cuando existe", () => {
    const promo = { ...goodBarber, promotions: [{ title: "Martes de corte + cejas", details: "", restrictions: "Solo martes", starts_on: null, ends_on: null }] };
    const f = withIds(businessFacts(promo, NOW));
    const p = buildTemplatePlan({ ctx: promo, intent, goal: "appointments", instruction: "", findings: f, today: TODAY });
    expect(p.ads.some((a) => a.angle === "Promoción vigente" && a.primary_text.includes("Solo martes"))).toBe(true);
  });
  it("incluye fechas del calendario con su id como evidencia", () => {
    const cal = calendarFindings(intent.start, intent.end, NOW).map((x, i) => ({ ...x, id: `10000000-0000-4000-8000-00000000000${i}` }));
    const p = buildTemplatePlan({ ctx: goodBarber, intent, goal: "appointments", instruction: "", findings: [...facts, ...cal], today: TODAY });
    expect(p.opportunity.text).toMatch(/Día de Muertos/);
    expect(p.opportunity.finding_ids.length).toBeGreaterThan(0);
  });
});

describe("calendario comercial", () => {
  it("contiene fechas verificadas y la quincena", () => {
    const f = calendarFindings("2026-11-01", "2026-11-30", NOW, 0);
    const s = f.map((x) => x.summary).join(" | ");
    expect(s).toMatch(/Día de la Revolución.*2026-11-16/);
    expect(s).toMatch(/El Buen Fin 2026: 2026-11-13 al 2026-11-17/);
    expect(s).toMatch(/quincena.*2026-11-15, 2026-11-30/);
  });
  it("no extrapola eventos sin fecha confirmada a otros años", () => {
    const f = calendarFindings("2027-11-01", "2027-11-30", NOW, 0);
    expect(f.some((x) => x.summary.includes("Buen Fin"))).toBe(false);
  });
  it("Día del Padre es el tercer domingo de junio", () => {
    expect(calendarFindings("2026-06-01", "2026-06-30", NOW, 0).some((x) => x.summary.includes("Día del Padre: 2026-06-21"))).toBe(true);
  });
});

describe("importación y validación de planes externos", () => {
  it("extrae JSON rodeado de texto y bloques de código", () => {
    expect(extractJsonObject('Aquí está:\n```json\n{"a": 1}\n```\nSaludos')).toEqual({ a: 1 });
    expect(() => extractJsonObject("sin json")).toThrow(/No se encontró/);
  });
  it("detecta precios inventados", () => {
    const plan = parsePlan({
      opportunity: { text: "x" }, audience: { text: "x" }, offer: { text: "Corte a $99" }, visual_concept: { text: "x" },
      ads: [{ angle: "a", headline: "Corte $120", primary_text: "Barba $45 hoy", cta: "Ven" }],
    });
    expect(plan.ok && findUnknownPrices(plan.plan, [12000, 5000])).toEqual(["$99", "$45"]);
  });
  it("rechaza planes incompletos con errores comprensibles", () => {
    const r = parsePlan({ ads: [] });
    expect(r.ok).toBe(false);
  });
  it("el prompt asistido incluye precios reales y prohíbe inventar", () => {
    const p = strategyPrompt(goodBarber, withIds(businessFacts(goodBarber, NOW)), "appointments", "Más citas", 5, { start: "2026-10-15", end: "2026-10-18" });
    expect(p).toMatch(/Corte \$120/);
    expect(p).toMatch(/No inventes precios/);
  });
});

describe("Gemini (gasto cero)", () => {
  const planJson = JSON.stringify({
    opportunity: { text: "o" }, audience: { text: "a" }, offer: { text: "f" }, visual_concept: { text: "v" },
    ads: [{ angle: "a", headline: "h", primary_text: "t", cta: "c" }],
  });
  const okFetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: planJson }] } }] }), { status: 200 })) as typeof fetch;
  const neverFetch = (async () => {
    throw new Error("no debía llamarse");
  }) as typeof fetch;

  it("no llama sin clave ni sin confirmación de nivel gratuito", async () => {
    expect(geminiUnavailableReason({})).toMatch(/GEMINI_API_KEY/);
    const r = await generatePlanWithGemini("p", { fetch: neverFetch, env: { GEMINI_API_KEY: "k" }, usedToday: 0, spentThisMonthMXN: 0 });
    expect(r).toMatchObject({ ok: false, blocked: true });
  });
  it("respeta el tope diario sin llamar a la API", async () => {
    const r = await generatePlanWithGemini("p", { fetch: neverFetch, env: { GEMINI_API_KEY: "k", GEMINI_FREE_TIER_CONFIRMED: "1" }, usedToday: 200, spentThisMonthMXN: 0 });
    expect(r).toMatchObject({ ok: false, blocked: true });
  });
  it("valida la respuesta con el esquema", async () => {
    const r = await generatePlanWithGemini("p", { fetch: okFetch, env: { GEMINI_API_KEY: "k", GEMINI_FREE_TIER_CONFIRMED: "1" }, usedToday: 0, spentThisMonthMXN: 0 });
    expect(r.ok).toBe(true);
  });
  it("informa el límite 429 del nivel gratuito", async () => {
    const f = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    const r = await generatePlanWithGemini("p", { fetch: f, env: { GEMINI_API_KEY: "k", GEMINI_FREE_TIER_CONFIRMED: "1" }, usedToday: 0, spentThisMonthMXN: 0 });
    expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/429/) });
  });
});

describe("experimentos", () => {
  const row = (variant: string, appointments: number, extra: Partial<ExperimentRow> = {}): ExperimentRow => ({
    id: variant, campaign_id: "c", variant, hypothesis: "h", messages: 0, appointments, customers: 0, sales_count: 0,
    revenue_cents: 0, ad_spend_cents: 0, published_on: null, period_end: null, ...extra,
  });
  it("calcula totales y costos sin dividir entre cero", () => {
    expect(totals([row("A", 4, { ad_spend_cents: 20000, messages: 8 })])).toMatchObject({ costPerAppointmentCents: 5000, messageToAppointment: 0.5 });
    expect(totals([row("A", 0)])).toMatchObject({ costPerAppointmentCents: null, messageToAppointment: null });
  });
  it("no compara con pocos datos", () => {
    const r = recommendations([{ label: "A", rows: [row("A", 3)] }, { label: "B", rows: [row("B", 1)] }]);
    expect(r[0]).toMatch(/todavía no alcanza/);
  });
  it("con datos suficientes sugiere repetir sin afirmar causalidad", () => {
    const r = recommendations([{ label: "Precio claro", rows: [row("A", 9)] }, { label: "Agenda fácil", rows: [row("B", 3)] }]);
    expect(r[0]).toMatch(/Precio claro.*Recomendación por probar/);
    expect(r.at(-1)).toMatch(/correlaciones/);
  });
});
