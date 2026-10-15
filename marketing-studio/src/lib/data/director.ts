import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import { DataError } from "./businesses";
import type { CampaignStatus, ContentItem } from "./types";
import { planSchema, type CampaignPlan, type Goal, type PlanSource } from "@/lib/director/plan";
import type { ExperimentRow } from "@/lib/director/experiments";
import type { FindingDraft, ProviderRun } from "@/lib/research/types";

export interface CampaignRow {
  id: string;
  business_id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  goal: Goal | null;
  instruction: string;
  plan: unknown;
  plan_source: PlanSource;
  plan_version: number;
  starts_on: string | null;
  ends_on: string | null;
  notes: string;
  research_report_id: string | null;
  request_group: string | null;
  created_at: string;
  updated_at: string;
}

export type Finding = FindingDraft & { id: string; business_id: string; report_id: string; created_at: string };
export type Experiment = ExperimentRow & {
  business_id: string;
  content_id: string | null;
  notes: string;
  created_at: string;
};

const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** El plan guardado se valida al leerlo: si algo no cumple el esquema se informa, no se rompe la página. */
export function readPlan(raw: unknown): { plan: CampaignPlan | null; error: string | null } {
  if (!raw || (typeof raw === "object" && Object.keys(raw as object).length === 0)) return { plan: null, error: null };
  const r = planSchema.safeParse(raw);
  return r.success ? { plan: r.data, error: null } : { plan: null, error: r.error.issues[0]?.message ?? "Plan inválido" };
}

export async function listCampaigns(f: { businessId?: string; status?: string; group?: string } = {}) {
  await requireUser();
  const supabase = await createClient();
  let q = supabase
    .from("mkt_campaigns")
    .select("id,business_id,name,objective,status,goal,plan_source,starts_on,ends_on,request_group,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  if (f.status) q = q.eq("status", f.status);
  if (f.group && isId(f.group)) q = q.eq("request_group", f.group);
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudieron cargar las campañas. ${error.message}`, error);
  return data as Omit<CampaignRow, "plan" | "instruction" | "notes" | "plan_version" | "research_report_id">[];
}

export async function getCampaignDetail(id: string) {
  await requireUser();
  if (!isId(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_campaigns").select("*").eq("id", id).maybeSingle();
  if (error) throw new DataError(`No se pudo cargar la campaña. ${error.message}`, error);
  if (!data) notFound();
  const campaign = data as CampaignRow;
  const [links, experiments, content, report] = await Promise.all([
    supabase.from("mkt_campaign_findings").select("finding_id").eq("campaign_id", id),
    supabase.from("mkt_experiments").select("*").eq("campaign_id", id).order("published_on", { ascending: true, nullsFirst: false }),
    supabase
      .from("mkt_content_items")
      .select("id,title,status,platform,format,scheduled_at,asset_id,manual_posted_at")
      .eq("campaign_id", id)
      .order("scheduled_at"),
    campaign.research_report_id
      ? supabase.from("mkt_research_reports").select("id,title,provider_runs,created_at").eq("id", campaign.research_report_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [links, experiments, content, report]) if (r.error) throw new DataError(r.error.message, r.error);
  const ids = (links.data ?? []).map((l) => l.finding_id as string);
  let findings: Finding[] = [];
  if (campaign.research_report_id || ids.length) {
    const fq = supabase.from("mkt_research_findings").select("*").order("evidence_level").limit(300);
    const { data: fr, error: fe } = campaign.research_report_id
      ? await fq.eq("report_id", campaign.research_report_id)
      : await fq.in("id", ids);
    if (fe) throw new DataError(fe.message, fe);
    findings = (fr ?? []) as Finding[];
  }
  return {
    campaign,
    ...readPlan(campaign.plan),
    linkedFindingIds: new Set(ids),
    findings,
    experiments: (experiments.data ?? []) as Experiment[],
    content: (content.data ?? []) as Pick<ContentItem, "id" | "title" | "status" | "platform" | "format" | "scheduled_at" | "asset_id" | "manual_posted_at">[],
    report: report.data as { id: string; title: string; provider_runs: ProviderRun[]; created_at: string } | null,
  };
}

export async function listReports(f: { businessId?: string } = {}) {
  await requireUser();
  const supabase = await createClient();
  let q = supabase.from("mkt_research_reports").select("id,business_id,title,keywords,provider_runs,created_at").order("created_at", { ascending: false }).limit(100);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudieron cargar las investigaciones. ${error.message}`, error);
  return data as { id: string; business_id: string; title: string; keywords: string[]; provider_runs: ProviderRun[]; created_at: string }[];
}

export async function getReportDetail(id: string) {
  await requireUser();
  if (!isId(id)) notFound();
  const supabase = await createClient();
  const { data: report, error } = await supabase.from("mkt_research_reports").select("*").eq("id", id).maybeSingle();
  if (error) throw new DataError(error.message, error);
  if (!report) notFound();
  const [{ data: findings, error: fe }, { data: campaigns }] = await Promise.all([
    supabase.from("mkt_research_findings").select("*").eq("report_id", id).order("consulted_at", { ascending: false }),
    supabase.from("mkt_campaigns").select("id,name").eq("research_report_id", id),
  ]);
  if (fe) throw new DataError(fe.message, fe);
  return {
    report: report as { id: string; business_id: string; title: string; keywords: string[]; city: string; provider_runs: ProviderRun[]; created_at: string },
    findings: (findings ?? []) as Finding[],
    campaigns: (campaigns ?? []) as { id: string; name: string }[],
  };
}

export async function listExperimentsForComparison(businessId?: string) {
  await requireUser();
  const supabase = await createClient();
  let q = supabase.from("mkt_experiments").select("*").limit(1000);
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (error) throw new DataError(error.message, error);
  return (data ?? []) as Experiment[];
}
