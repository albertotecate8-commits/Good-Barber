"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { readPlan } from "@/lib/data/director";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { parsePriceToCents } from "@/lib/money";
import { formToObject } from "@/lib/validation/business";
import { isValidDateString, todayInTz, zonedToUtc } from "@/lib/tz";
import { extractJsonObject, findUnknownPrices, parsePlan, parseReelScript, type CampaignPlan } from "@/lib/director/plan";
import { generatePlanWithGemini } from "@/lib/director/gemini";
import { strategyPrompt } from "@/lib/director/prompts";
import { countUsageToday, loadBusinessContext, logUsage } from "@/lib/director/server";
import type { SavedFinding } from "@/lib/director/template";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!UUID.test(id)) throw new Error("Identificador inválido");
}
const issuesToErrors = (issues: z.core.$ZodIssue[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
};

async function loadCampaign(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mkt_campaigns")
    .select("id,business_id,name,plan,plan_version,goal,instruction,starts_on,ends_on,research_report_id")
    .eq("id", id)
    .maybeSingle();
  return { supabase, campaign: data };
}

function refresh(id: string) {
  revalidatePath(`/campanas/${id}`);
  revalidatePath("/campanas");
}

// ---------------------------------------------------------------------------
// Datos generales
// ---------------------------------------------------------------------------
const metaSchema = z
  .object({
    name: z.string().trim().min(2, "Escribe un nombre").max(120),
    status: z.enum(["idea", "research", "draft", "review", "approved", "active", "finished", "archived"]),
    starts_on: z.string().trim().refine((v) => v === "" || isValidDateString(v), "Fecha no válida"),
    ends_on: z.string().trim().refine((v) => v === "" || isValidDateString(v), "Fecha no válida"),
    notes: z.string().trim().max(4000),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.ends_on >= v.starts_on, { message: "La fecha final no puede ser anterior", path: ["ends_on"] });

export async function updateCampaignMeta(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const parsed = metaSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_campaigns")
    .update({ name: v.name, status: v.status, starts_on: v.starts_on || null, ends_on: v.ends_on || null, notes: v.notes })
    .eq("id", id)
    .select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar esta campaña." };
  refresh(id);
  return { ok: true, message: "Campaña guardada." };
}

// ---------------------------------------------------------------------------
// Edición del plan
// ---------------------------------------------------------------------------
async function savePlan(supabase: Awaited<ReturnType<typeof createClient>>, id: string, plan: CampaignPlan, version: number, source?: string) {
  const { data, error } = await supabase
    .from("mkt_campaigns")
    .update({ plan, plan_version: version + 1, ...(source ? { plan_source: source } : {}) })
    .eq("id", id)
    .select("id");
  if (error) return friendlyDbError(error);
  if (!data?.length) return "No tienes permiso para editar esta campaña.";
  return null;
}

export async function updatePlanText(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const { supabase, campaign } = await loadCampaign(id);
  if (!campaign) return { message: "La campaña no existe o no tienes acceso." };
  const { plan } = readPlan(campaign.plan);
  if (!plan) return { message: "Esta campaña no tiene un plan válido para editar." };
  const get = (k: string) => String(form.get(k) ?? "");
  const next: CampaignPlan = structuredClone(plan);
  for (const k of ["opportunity", "audience", "offer", "visual_concept"] as const) {
    const t = get(k).trim();
    if (t) next[k].text = t;
  }
  next.measurement = get("measurement").trim() || next.measurement;
  next.ads = next.ads.map((ad, i) => ({
    ...ad,
    headline: get(`ad_${i}_headline`).trim() || ad.headline,
    primary_text: get(`ad_${i}_primary_text`).trim() || ad.primary_text,
    cta: get(`ad_${i}_cta`).trim() || ad.cta,
    visual_prompt: get(`ad_${i}_visual_prompt`).trim(),
  }));
  if (next.reel) {
    next.reel.hook = get("reel_hook").trim() || next.reel.hook;
    next.reel.caption = get("reel_caption").trim();
    const scenes = parseReelScript(get("reel_script"));
    if (scenes.length) next.reel.scenes = scenes;
  }
  const valid = parsePlan(next);
  if (!valid.ok) return { message: `Hay campos fuera de formato: ${valid.errors.join("; ")}` };
  const err = await savePlan(supabase, id, valid.plan, campaign.plan_version);
  if (err) return { message: err };
  refresh(id);
  return { ok: true, message: "Plan actualizado." };
}

/** Importa el JSON que devolvió ChatGPT, Claude o Gemini (flujo asistido). */
export async function importPlan(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const raw = String(form.get("plan_json") ?? "");
  if (raw.length > 150_000) return { errors: { plan_json: "El texto es demasiado largo." } };
  let json: unknown;
  try {
    json = extractJsonObject(raw);
  } catch (e) {
    return { errors: { plan_json: (e as Error).message } };
  }
  const parsed = parsePlan(json);
  if (!parsed.ok) return { errors: { plan_json: `No cumple el formato: ${parsed.errors.join("; ")}` } };
  const { supabase, campaign } = await loadCampaign(id);
  if (!campaign) return { message: "La campaña no existe o no tienes acceso." };

  const plan = parsed.plan;
  // Solo se aceptan ids de hallazgos que existan en la investigación de la campaña.
  const { data: fr } = campaign.research_report_id
    ? await supabase.from("mkt_research_findings").select("id").eq("report_id", campaign.research_report_id)
    : { data: [] };
  const valid = new Set((fr ?? []).map((f) => f.id as string));
  const strip = (ids: string[]) => ids.filter((x) => valid.has(x));
  for (const k of ["opportunity", "audience", "offer", "visual_concept"] as const) plan[k].finding_ids = strip(plan[k].finding_ids);
  plan.ads = plan.ads.map((a) => ({ ...a, finding_ids: strip(a.finding_ids) }));
  plan.schedule = plan.schedule.map((s) => ({ ...s, content_id: null }));
  const { data: offerings } = await supabase.from("mkt_offerings").select("price_cents").eq("business_id", campaign.business_id);
  const unknown = findUnknownPrices(plan, (offerings ?? []).map((o) => o.price_cents).filter((c): c is number => c !== null));
  if (unknown.length) plan.warnings.unshift(`Montos que no coinciden con ningún precio registrado: ${unknown.join(", ")}. Corrígelos antes de publicar.`);
  plan.warnings.unshift("Plan importado de una IA externa: revisa cada afirmación antes de usarla.");

  const err = await savePlan(supabase, id, plan, campaign.plan_version, "assisted_import");
  if (err) return { message: err };
  refresh(id);
  return { ok: true, message: unknown.length ? `Plan importado con ${unknown.length} advertencia(s) de precios.` : "Plan importado y validado." };
}

/** Regenera el plan con Gemini (solo si está configurado y permitido). */
export async function regenerateWithGemini(id: string): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const { supabase, campaign } = await loadCampaign(id);
  if (!campaign) return { message: "La campaña no existe o no tienes acceso." };
  const today = todayInTz();
  const ctx = await loadBusinessContext(supabase, campaign.business_id, today);
  if (!ctx) return { message: "No se pudo cargar el negocio." };
  const { plan: current } = readPlan(campaign.plan);
  const { data: fr } = campaign.research_report_id
    ? await supabase.from("mkt_research_findings").select("*").eq("report_id", campaign.research_report_id)
    : { data: [] };
  const findings = (fr ?? []) as SavedFinding[];
  const prompt = strategyPrompt(ctx, findings, campaign.goal ?? "customers", campaign.instruction, current?.ads.length ?? 5, {
    start: campaign.starts_on ?? today,
    end: campaign.ends_on ?? today,
  });
  const r = await generatePlanWithGemini(prompt, { fetch, env: process.env, usedToday: await countUsageToday(supabase, "gemini-text"), spentThisMonthMXN: 0 });
  await logUsage(supabase, campaign.business_id, "gemini-text", "regenerar campaña", r.ok ? "ok" : r.blocked ? "blocked" : "error");
  if (!r.ok) return { message: r.message };
  const unknown = findUnknownPrices(r.plan, ctx.offerings.map((o) => o.price_cents).filter((c): c is number => c !== null));
  if (unknown.length) r.plan.warnings.unshift(`Montos que no coinciden con ningún precio registrado: ${unknown.join(", ")}.`);
  const err = await savePlan(supabase, id, { ...r.plan, schedule: r.plan.schedule.map((s) => ({ ...s, content_id: null })) }, campaign.plan_version, "gemini_api");
  if (err) return { message: err };
  refresh(id);
  return { ok: true, message: "Plan regenerado con Gemini." };
}

// ---------------------------------------------------------------------------
// Borradores en el calendario
// ---------------------------------------------------------------------------
const PLATFORM_OK = new Set(["instagram", "facebook_page", "tiktok", "whatsapp", "google_business", "youtube", "other"]);

export async function createDraftsFromPlan(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const { supabase, campaign } = await loadCampaign(id);
  if (!campaign) return { message: "La campaña no existe o no tienes acceso." };
  const { plan } = readPlan(campaign.plan);
  if (!plan) return { message: "La campaña no tiene un plan válido." };
  const selected = form.getAll("items").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n < plan.schedule.length);
  if (!selected.length) return { message: "Elige al menos una publicación del calendario sugerido." };

  const next = structuredClone(plan);
  let created = 0;
  for (const i of selected) {
    const item = next.schedule[i];
    if (item.content_id) continue; // ya se creó: no se duplica
    const assetRaw = String(form.get(`asset_${i}`) ?? "");
    const asset_id = UUID.test(assetRaw) ? assetRaw : null;
    const ad = item.ad_index !== null ? next.ads[item.ad_index] : null;
    const caption = ad ? ad.primary_text : next.reel ? `${next.reel.caption}\n\nGuion:\n${next.reel.scenes.map((s) => `${s.seconds} ${s.shot}${s.on_screen_text ? ` — «${s.on_screen_text}»` : ""}`).join("\n")}` : "";
    let scheduled_at: string | null = null;
    try {
      scheduled_at = zonedToUtc(item.date, item.time);
    } catch {
      scheduled_at = null;
    }
    const contentId = randomUUID();
    const { error } = await supabase.from("mkt_content_items").insert({
      id: contentId,
      business_id: campaign.business_id,
      campaign_id: id,
      platform: PLATFORM_OK.has(item.platform) ? item.platform : "other",
      format: item.is_reel ? "reel" : item.format,
      title: `${campaign.name} · ${ad ? ad.angle : "Reel"}`.slice(0, 200),
      caption: caption.slice(0, 5000),
      hashtags: [],
      scheduled_at,
      status: "draft",
      asset_id,
      publish_mode: "manual",
    });
    if (error) return { message: `No se pudo crear el borrador ${i + 1}: ${friendlyDbError(error)}` };
    item.content_id = contentId;
    created++;
  }
  const err = await savePlan(supabase, id, next, campaign.plan_version);
  if (err) return { message: err };
  refresh(id);
  revalidatePath("/calendario", "layout");
  return { ok: true, message: created ? `${created} borrador(es) creados en el calendario (sin publicar).` : "Esas publicaciones ya tenían borrador." };
}

export async function deleteCampaign(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_campaigns").delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar esta campaña.");
  revalidatePath("/campanas");
  revalidatePath("/");
  redirect("/campanas?eliminada=1");
}

// ---------------------------------------------------------------------------
// Experimentos
// ---------------------------------------------------------------------------
const count = z
  .string()
  .trim()
  .transform((v) => (v === "" ? "0" : v))
  .refine((v) => /^\d{1,7}$/.test(v), "Número entero, 0 o mayor")
  .transform(Number);
const money = z
  .string()
  .max(30)
  .transform((v, ctx) => {
    try {
      return parsePriceToCents(v) ?? 0;
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });

const experimentSchema = z
  .object({
    hypothesis: z.string().trim().min(3, "Escribe la hipótesis que estás probando").max(1000),
    variant: z.string().trim().max(300),
    content_id: z.string().trim().refine((v) => v === "" || UUID.test(v), "Publicación inválida"),
    published_on: z.string().trim().refine((v) => v === "" || isValidDateString(v), "Fecha no válida"),
    period_end: z.string().trim().refine((v) => v === "" || isValidDateString(v), "Fecha no válida"),
    messages: count,
    appointments: count,
    customers: count,
    sales_count: count,
    revenue: money,
    ad_spend: money,
    notes: z.string().trim().max(4000),
  })
  .refine((v) => !v.published_on || !v.period_end || v.period_end >= v.published_on, { message: "El fin no puede ser anterior a la publicación", path: ["period_end"] });

export async function addExperiment(campaignId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(campaignId);
  const parsed = experimentSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: issuesToErrors(parsed.error.issues), message: "Revisa los campos marcados." };
  const v = parsed.data;
  const { supabase, campaign } = await loadCampaign(campaignId);
  if (!campaign) return { message: "La campaña no existe o no tienes acceso." };
  const { error } = await supabase.from("mkt_experiments").insert({
    business_id: campaign.business_id,
    campaign_id: campaignId,
    content_id: v.content_id || null,
    hypothesis: v.hypothesis,
    variant: v.variant,
    published_on: v.published_on || null,
    period_end: v.period_end || null,
    messages: v.messages,
    appointments: v.appointments,
    customers: v.customers,
    sales_count: v.sales_count,
    revenue_cents: v.revenue,
    ad_spend_cents: v.ad_spend,
    notes: v.notes,
  });
  if (error) return { message: friendlyDbError(error) };
  refresh(campaignId);
  revalidatePath("/campanas/comparar");
  return { ok: true, message: "Resultado registrado." };
}

export async function deleteExperiment(id: string, campaignId: string): Promise<void> {
  await requireUser();
  assertId(id);
  assertId(campaignId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_experiments").delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar este registro.");
  refresh(campaignId);
}
