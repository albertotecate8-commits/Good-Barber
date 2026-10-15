// Director + Investigación contra el stack local real. Requiere npm run local:up.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";
import { buildTemplatePlan } from "@/lib/director/template";
import { parseInstruction } from "@/lib/director/intent";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const password = "Prueba12345!";

function sql(query: string) {
  return execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", query], { encoding: "utf8" }).trim();
}

async function makeUser(name: string, admin: boolean) {
  const email = `${name}-${run}@test.local`;
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(user));
  if (admin) sql(`insert into mkt_admins (user_id) values ('${user.id}')`);
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id as string, client };
}

async function createBusiness(c: SupabaseClient, userId: string, name: string) {
  const id = randomUUID();
  const { error } = await c.from("mkt_businesses").insert({ id, name, sector: "Barbería", city: "Durango, Durango", slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, created_by: userId });
  if (error) throw error;
  return id;
}

async function createReport(c: SupabaseClient, businessId: string) {
  const id = randomUUID();
  const { error } = await c.from("mkt_research_reports").insert({ id, business_id: businessId, title: "Competencia" });
  if (error) throw error;
  return id;
}

async function addFinding(c: SupabaseClient, businessId: string, reportId: string, over: Record<string, unknown> = {}) {
  const id = randomUUID();
  const { error } = await c.from("mkt_research_findings").insert({
    id,
    business_id: businessId,
    report_id: reportId,
    source_type: "manual",
    source_name: "Biblioteca de anuncios",
    url: "https://www.facebook.com/ads/library/",
    summary: "Competidor anuncia corte con promoción",
    evidence_level: "observation",
    confidence: "medium",
    capture_method: "manual",
    ...over,
  });
  return { id, error };
}

const validPlan = () =>
  buildTemplatePlan({
    ctx: {
      business: { id: "x", name: "Negocio", sector: "Barbería", city: "Durango", address: "", service_area: "", target_audience: "", description: "" },
      brand: null,
      offerings: [{ name: "Corte", price_cents: 12000, kind: "service", description: "" }],
      promotions: [],
      socials: [],
      assets: [],
    },
    intent: parseInstruction("cinco anuncios y un reel esta semana", "2026-10-15"),
    goal: "appointments",
    instruction: "",
    findings: [],
    today: "2026-10-15",
  });

describe.skipIf(!reachable)("Director e Investigación: permisos y aislamiento", () => {
  let ana: Awaited<ReturnType<typeof makeUser>>;
  let beto: Awaited<ReturnType<typeof makeUser>>;
  let caro: Awaited<ReturnType<typeof makeUser>>; // lectora del negocio de Ana
  let bizA: string;
  let bizA2: string;
  let bizB: string;
  let reportA: string;
  let reportB: string;

  beforeAll(async () => {
    [ana, beto, caro] = await Promise.all([makeUser("ana", true), makeUser("beto", true), makeUser("caro", false)]);
    [bizA, bizA2, bizB] = await Promise.all([
      createBusiness(ana.client, ana.id, "Barberia A"),
      createBusiness(ana.client, ana.id, "Otra A2"),
      createBusiness(beto.client, beto.id, "Barberia B"),
    ]);
    await ana.client.from("mkt_business_members").insert({ business_id: bizA, user_id: caro.id, role: "viewer" });
    [reportA, reportB] = await Promise.all([createReport(ana.client, bizA), createReport(beto.client, bizB)]);
  });

  afterAll(() => {
    if (!reachable) return;
    sql(`delete from mkt_businesses where slug like '%-${run}'`);
    sql(`delete from auth.users where email like '%-${run}@test.local'`);
  });

  describe("investigación", () => {
    it("crear y leer hallazgos con fuente, fecha y confianza", async () => {
      const { id, error } = await addFinding(ana.client, bizA, reportA);
      expect(error).toBeNull();
      const { data } = await ana.client.from("mkt_research_findings").select("source_name,url,consulted_at,confidence,evidence_level").eq("id", id).single();
      expect(data).toMatchObject({ url: "https://www.facebook.com/ads/library/", confidence: "medium", evidence_level: "observation" });
      expect(data?.consulted_at).toBeTruthy();
    });
    it("otro negocio no ve ni modifica informes ni hallazgos", async () => {
      const { id } = await addFinding(ana.client, bizA, reportA);
      expect((await beto.client.from("mkt_research_reports").select("id").eq("id", reportA)).data).toEqual([]);
      expect((await beto.client.from("mkt_research_findings").select("id").eq("id", id)).data).toEqual([]);
      expect((await beto.client.from("mkt_research_findings").update({ summary: "falso" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await beto.client.from("mkt_research_findings").delete().eq("id", id).select("id")).data).toEqual([]);
    });
    it("no se puede agregar un hallazgo a un informe ajeno ni mezclar negocios", async () => {
      expect((await addFinding(beto.client, bizA, reportA)).error?.code).toBe("42501");
      expect((await addFinding(ana.client, bizA2, reportA)).error?.code).toBe("42501");
      expect((await addFinding(beto.client, bizB, reportA)).error?.code).toBe("42501");
    });
    it("una lectora ve los hallazgos pero no puede crearlos ni borrarlos", async () => {
      const { id } = await addFinding(ana.client, bizA, reportA);
      expect((await caro.client.from("mkt_research_findings").select("id").eq("id", id)).data).toHaveLength(1);
      expect((await addFinding(caro.client, bizA, reportA)).error?.code).toBe("42501");
      expect((await caro.client.from("mkt_research_findings").delete().eq("id", id).select("id")).data).toEqual([]);
    });
    it("valida nivel de evidencia, confianza y enlaces https", async () => {
      expect((await addFinding(ana.client, bizA, reportA, { evidence_level: "rumor" })).error?.code).toBe("23514");
      expect((await addFinding(ana.client, bizA, reportA, { confidence: "total" })).error?.code).toBe("23514");
      expect((await addFinding(ana.client, bizA, reportA, { url: "http://inseguro.mx" })).error?.code).toBe("23514");
      expect((await addFinding(ana.client, bizA, reportA, { url: "javascript:alert(1)" })).error?.code).toBe("23514");
    });
  });

  describe("campañas del Director", () => {
    it("guarda el plan, el objetivo y la instrucción; edita y elimina", async () => {
      const id = randomUUID();
      const plan = validPlan();
      const { error } = await ana.client.from("mkt_campaigns").insert({
        id, business_id: bizA, name: "Más citas", goal: "appointments", instruction: "Más citas esta semana", plan, plan_source: "template", research_report_id: reportA, status: "draft",
      });
      expect(error).toBeNull();
      const { data } = await ana.client.from("mkt_campaigns").select("plan,goal,plan_source").eq("id", id).single();
      expect(data?.plan.ads).toHaveLength(5);
      expect(data?.goal).toBe("appointments");
      const { data: upd } = await ana.client.from("mkt_campaigns").update({ status: "review" }).eq("id", id).select("status");
      expect(upd).toEqual([{ status: "review" }]);
      expect((await ana.client.from("mkt_campaigns").delete().eq("id", id).select("id")).data).toEqual([{ id }]);
    });
    it("rechaza objetivos, fuentes de plan y planes no válidos", async () => {
      const base = { business_id: bizA, name: "Campaña X" };
      expect((await ana.client.from("mkt_campaigns").insert({ ...base, goal: "viral" })).error?.code).toBe("23514");
      expect((await ana.client.from("mkt_campaigns").insert({ ...base, plan_source: "magia" })).error?.code).toBe("23514");
      expect((await ana.client.from("mkt_campaigns").insert({ ...base, plan: [1, 2] })).error?.code).toBe("23514");
    });
    it("no se puede usar la investigación de otro negocio", async () => {
      const { error } = await beto.client.from("mkt_campaigns").insert({ business_id: bizB, name: "Copia", research_report_id: reportA });
      expect(error?.code).toBe("42501");
      const { error: e2 } = await ana.client.from("mkt_campaigns").insert({ business_id: bizA2, name: "Mezcla", research_report_id: reportA });
      expect(e2?.code).toBe("42501");
    });
    it("los hallazgos citados deben ser del mismo negocio", async () => {
      const campaignA = randomUUID();
      expect((await ana.client.from("mkt_campaigns").insert({ id: campaignA, business_id: bizA, name: "Campaña A" })).error).toBeNull();
      const { id: findingA } = await addFinding(ana.client, bizA, reportA);
      const { id: findingB } = await addFinding(beto.client, bizB, reportB);
      expect((await ana.client.from("mkt_campaign_findings").insert({ campaign_id: campaignA, finding_id: findingA, business_id: bizA })).error).toBeNull();
      // Hallazgo de otro negocio, aunque se declare el negocio propio.
      expect((await ana.client.from("mkt_campaign_findings").insert({ campaign_id: campaignA, finding_id: findingB, business_id: bizA })).error?.code).toBe("42501");
      expect((await beto.client.from("mkt_campaign_findings").select("finding_id").eq("campaign_id", campaignA)).data).toEqual([]);
    });
    it("otro negocio no ve ni edita la campaña", async () => {
      const id = randomUUID();
      expect((await ana.client.from("mkt_campaigns").insert({ id, business_id: bizA, name: "Privada", plan: validPlan() })).error).toBeNull();
      expect((await beto.client.from("mkt_campaigns").select("id").eq("id", id)).data).toEqual([]);
      expect((await beto.client.from("mkt_campaigns").update({ name: "x" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await caro.client.from("mkt_campaigns").update({ name: "x" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await caro.client.from("mkt_campaigns").select("id").eq("id", id)).data).toHaveLength(1);
    });
    it("los borradores de una campaña deben ser de su mismo negocio y nunca publicados", async () => {
      const campaignA = randomUUID();
      expect((await ana.client.from("mkt_campaigns").insert({ id: campaignA, business_id: bizA, name: "Campaña A" })).error).toBeNull();
      const { error } = await ana.client.from("mkt_content_items").insert({ business_id: bizA2, campaign_id: campaignA, caption: "x" });
      expect(error?.code).toBe("42501");
      const { error: e2 } = await ana.client.from("mkt_content_items").insert({ business_id: bizA, campaign_id: campaignA, caption: "x", status: "published" });
      expect(e2?.code).toBe("42501");
      const { error: e3 } = await ana.client.from("mkt_content_items").insert({ business_id: bizA, campaign_id: campaignA, caption: "x", status: "draft" });
      expect(e3).toBeNull();
    });
  });

  describe("experimentos", () => {
    let campaignA: string;
    beforeAll(async () => {
      campaignA = randomUUID();
      const { error } = await ana.client.from("mkt_campaigns").insert({ id: campaignA, business_id: bizA, name: "Experimento" });
      if (error) throw error;
    });
    it("registra resultados comerciales", async () => {
      const { data, error } = await ana.client
        .from("mkt_experiments")
        .insert({ business_id: bizA, campaign_id: campaignA, hypothesis: "Precio visible genera más citas", variant: "Precio claro", messages: 12, appointments: 5, customers: 3, sales_count: 5, revenue_cents: 60000, ad_spend_cents: 0 })
        .select("appointments,revenue_cents");
      expect(error).toBeNull();
      expect(data).toEqual([{ appointments: 5, revenue_cents: 60000 }]);
    });
    it("rechaza números negativos y periodos invertidos", async () => {
      const base = { business_id: bizA, campaign_id: campaignA, hypothesis: "h válida" };
      expect((await ana.client.from("mkt_experiments").insert({ ...base, appointments: -1 })).error?.code).toBe("23514");
      expect((await ana.client.from("mkt_experiments").insert({ ...base, published_on: "2026-10-10", period_end: "2026-10-01" })).error?.code).toBe("23514");
    });
    it("no se pueden registrar ni ver resultados de otro negocio", async () => {
      const { error } = await beto.client.from("mkt_experiments").insert({ business_id: bizB, campaign_id: campaignA, hypothesis: "intruso" });
      expect(error?.code).toBe("42501");
      expect((await beto.client.from("mkt_experiments").select("id").eq("campaign_id", campaignA)).data).toEqual([]);
      const { error: e2 } = await caro.client.from("mkt_experiments").insert({ business_id: bizA, campaign_id: campaignA, hypothesis: "lectora" });
      expect(e2?.code).toBe("42501");
    });
    it("la publicación ligada debe ser del mismo negocio", async () => {
      const contentB = randomUUID();
      await beto.client.from("mkt_content_items").insert({ id: contentB, business_id: bizB, caption: "B" });
      // Ana no puede ni ver esa publicación; el trigger también lo impide.
      const { error } = await ana.client.from("mkt_experiments").insert({ business_id: bizA, campaign_id: campaignA, hypothesis: "h", content_id: contentB });
      expect(error?.code).toBe("42501");
    });
  });

  describe("registro de uso de IA (gasto $0 y topes)", () => {
    it("se registra a nombre propio y no se puede editar ni borrar", async () => {
      const { error } = await ana.client.from("mkt_ai_usage").insert({ business_id: bizA, provider: "gemini-text", purpose: "prueba" });
      expect(error).toBeNull();
      const { error: forged } = await ana.client.from("mkt_ai_usage").insert({ business_id: bizA, user_id: beto.id, provider: "gemini-text" });
      expect(forged?.code).toBe("42501");
      const { data: del } = await ana.client.from("mkt_ai_usage").delete().eq("business_id", bizA).select("id");
      expect(del ?? []).toEqual([]);
      expect(sql(`select count(*) from mkt_ai_usage where business_id = '${bizA}'`)).toBe("1");
    });
    it("no admite costos negativos ni uso en negocios ajenos", async () => {
      expect((await ana.client.from("mkt_ai_usage").insert({ business_id: bizA, provider: "x", estimated_cost_mxn: -5 })).error?.code).toBe("23514");
      expect((await beto.client.from("mkt_ai_usage").insert({ business_id: bizA, provider: "x" })).error?.code).toBe("42501");
      expect((await beto.client.from("mkt_ai_usage").select("id").eq("business_id", bizA)).data).toEqual([]);
    });
  });

  describe("origen de recursos", () => {
    it("acepta orígenes válidos y rechaza otros", async () => {
      const base = { business_id: bizA, kind: "image", title: "x", storage_backend: "local_dev", original_name: "x.jpg", mime_type: "image/jpeg" };
      expect((await ana.client.from("mkt_assets").insert({ ...base, storage_path: `${bizA}/${randomUUID()}/x.jpg`, origin: "ai_generated" })).error).toBeNull();
      expect((await ana.client.from("mkt_assets").insert({ ...base, storage_path: `${bizA}/${randomUUID()}/y.jpg`, origin: "foto-de-internet" })).error?.code).toBe("23514");
    });
  });
});
