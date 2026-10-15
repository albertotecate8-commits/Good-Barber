import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runAutomaticResearch } from "@/lib/research";
import type { FindingDraft, ProviderRun } from "@/lib/research/types";
import { defaultKeywords } from "@/lib/research/keywords";
import { businessFacts, type BusinessContext, type SavedFinding } from "./template";

// Funciones de servidor compartidas por el Director y la Investigación. Usan
// el cliente con la sesión del usuario: RLS decide a qué negocio tiene acceso.

export async function loadBusinessContext(supabase: SupabaseClient, businessId: string, today: string): Promise<BusinessContext | null> {
  const { data: business } = await supabase
    .from("mkt_businesses")
    .select("id,name,sector,city,address,service_area,target_audience,description")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return null;
  const [brand, offerings, promotions, socials, assets] = await Promise.all([
    supabase.from("mkt_brand_profiles").select("*").eq("business_id", businessId).maybeSingle(),
    supabase.from("mkt_offerings").select("name,price_cents,kind,description").eq("business_id", businessId).eq("active", true).order("sort_order"),
    supabase.from("mkt_promotions").select("title,details,restrictions,starts_on,ends_on").eq("business_id", businessId).eq("active", true),
    supabase.from("mkt_social_accounts").select("platform,handle").eq("business_id", businessId),
    supabase.from("mkt_assets").select("id,title,kind,origin,tags").eq("business_id", businessId).eq("upload_status", "ready").limit(100),
  ]);
  // Vigentes o próximas: todas las que no han terminado.
  const current = (promotions.data ?? []).filter((p) => !p.ends_on || p.ends_on >= today);
  return {
    business,
    brand: brand.data ?? null,
    offerings: offerings.data ?? [],
    promotions: current,
    socials: socials.data ?? [],
    assets: assets.data ?? [],
  } as BusinessContext;
}

export async function countUsageToday(supabase: SupabaseClient, provider: string) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { count } = await supabase.from("mkt_ai_usage").select("id", { count: "exact", head: true }).eq("provider", provider).gte("created_at", since);
  return count ?? 0;
}

export async function logUsage(supabase: SupabaseClient, businessId: string, provider: string, purpose: string, outcome: "ok" | "error" | "blocked", times = 1) {
  const rows = Array.from({ length: times }, () => ({ business_id: businessId, provider, purpose, outcome, estimated_cost_mxn: 0 }));
  await supabase.from("mkt_ai_usage").insert(rows);
}

export async function saveFindings(supabase: SupabaseClient, businessId: string, reportId: string, drafts: FindingDraft[]): Promise<SavedFinding[]> {
  if (!drafts.length) return [];
  const rows = drafts.map((d) => ({
    business_id: businessId,
    report_id: reportId,
    source_type: d.source_type,
    source_name: d.source_name.slice(0, 160),
    url: d.url && d.url.startsWith("https://") ? d.url.slice(0, 2000) : null,
    consulted_at: d.consulted_at,
    summary: d.summary.slice(0, 2000),
    evidence: d.evidence.slice(0, 4000),
    evidence_level: d.evidence_level,
    confidence: d.confidence,
    capture_method: d.capture_method,
    raw: d.raw ?? null,
  }));
  const { data, error } = await supabase.from("mkt_research_findings").insert(rows).select("id");
  if (error) throw new Error(`No se pudieron guardar los hallazgos: ${error.message}`);
  return drafts.map((d, i) => ({ ...d, id: data![i].id as string }));
}

/**
 * Crea un informe: hechos del negocio + calendario + proveedores automáticos
 * (si se piden). Los resultados de cada fuente, incluidos errores, quedan
 * registrados en provider_runs.
 */
export async function performResearch(
  supabase: SupabaseClient,
  ctx: BusinessContext,
  opts: { title: string; start: string; end: string; keywords?: string[]; automatic: boolean; reportId: string },
): Promise<{ findings: SavedFinding[]; runs: ProviderRun[] }> {
  const keywords = (opts.keywords?.length ? opts.keywords : defaultKeywords(ctx.business.sector)).slice(0, 15);
  const now = new Date();
  const { error } = await supabase.from("mkt_research_reports").insert({
    id: opts.reportId,
    business_id: ctx.business.id,
    title: opts.title.slice(0, 160),
    keywords,
    city: ctx.business.city,
  });
  if (error) throw new Error(`No se pudo crear la investigación: ${error.message}`);

  const query = { businessName: ctx.business.name, sector: ctx.business.sector, city: ctx.business.city, keywords, start: opts.start, end: opts.end };
  let drafts: FindingDraft[] = businessFacts(ctx, now);
  let runs: ProviderRun[] = [{ provider: "business_data", status: drafts.length ? "ok" : "empty", message: "Precios, promociones y público registrados.", count: drafts.length, at: now.toISOString() }];
  if (opts.automatic) {
    const usedToday = { tavily: await countUsageToday(supabase, "tavily") };
    const auto = await runAutomaticResearch(query, { fetch, env: process.env, now, usedToday });
    drafts = [...drafts, ...auto.findings];
    runs = [...runs, ...auto.runs];
    const tavily = auto.runs.find((r) => r.provider === "tavily");
    if (tavily && (tavily.status === "ok" || tavily.status === "empty" || tavily.status === "error"))
      await logUsage(supabase, ctx.business.id, "tavily", "búsqueda web", tavily.status === "error" ? "error" : "ok", 2);
  } else {
    runs.push({ provider: "automatic", status: "skipped", message: "Investigación automática no solicitada.", count: 0, at: now.toISOString() });
  }
  const findings = await saveFindings(supabase, ctx.business.id, opts.reportId, drafts);
  await supabase.from("mkt_research_reports").update({ provider_runs: runs }).eq("id", opts.reportId);
  return { findings, runs };
}
