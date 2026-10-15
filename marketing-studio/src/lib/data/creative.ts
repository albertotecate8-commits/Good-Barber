import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import { DataError } from "./businesses";
import type { Asset } from "./types";
import type { MaterialType } from "@/lib/creative/formats";
import type { QaCheck } from "@/lib/creative/qa";

export interface CreativeProject {
  id: string;
  business_id: string;
  campaign_id: string | null;
  title: string;
  material_type: MaterialType;
  format_key: string;
  width: number;
  height: number;
  instruction: string;
  reference_asset_ids: string[];
  video_plan: unknown;
  status: "draft" | "in_review" | "approved" | "archived";
  created_at: string;
  updated_at: string;
}

export interface CreativeVersion {
  id: string;
  business_id: string;
  project_id: string;
  version_no: number;
  kind: "concept" | "imported_result" | "code_edit" | "video_render";
  title: string;
  concept: Record<string, unknown>;
  design: Record<string, unknown>;
  asset_id: string | null;
  parent_version_id: string | null;
  tool: string;
  format_key: string;
  qa: QaCheck[];
  qa_status: "pending" | "passed" | "passed_with_warnings" | "failed";
  qa_reviewed_at: string | null;
  is_final: boolean;
  created_at: string;
}

export async function listCreativeProjects(businessId?: string) {
  await requireUser();
  const supabase = await createClient();
  let q = supabase.from("mkt_creative_projects").select("id,business_id,campaign_id,title,material_type,format_key,status,updated_at").order("updated_at", { ascending: false }).limit(200);
  if (businessId) q = q.eq("business_id", businessId);
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudieron cargar los proyectos. ${error.message}`, error);
  return data as Pick<CreativeProject, "id" | "business_id" | "campaign_id" | "title" | "material_type" | "format_key" | "status" | "updated_at">[];
}

export async function getCreativeProject(id: string) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_creative_projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new DataError(error.message, error);
  if (!data) notFound();
  const project = data as CreativeProject;
  const [versions, assets, campaign, content] = await Promise.all([
    supabase.from("mkt_creative_versions").select("*").eq("project_id", id).order("version_no", { ascending: false }),
    supabase.from("mkt_assets").select("*").eq("business_id", project.business_id).eq("upload_status", "ready").order("created_at", { ascending: false }).limit(300),
    project.campaign_id ? supabase.from("mkt_campaigns").select("id,name,plan").eq("id", project.campaign_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from("mkt_content_items").select("id,title,status,scheduled_at,asset_id,campaign_id").eq("business_id", project.business_id).neq("status", "published").order("scheduled_at", { ascending: true, nullsFirst: false }).limit(100),
  ]);
  for (const r of [versions, assets, campaign, content]) if (r.error) throw new DataError(r.error.message, r.error);
  return {
    project,
    versions: (versions.data ?? []) as CreativeVersion[],
    assets: (assets.data ?? []) as Asset[],
    campaign: campaign.data as { id: string; name: string; plan: unknown } | null,
    content: (content.data ?? []) as { id: string; title: string; status: string; scheduled_at: string | null; asset_id: string | null; campaign_id: string | null }[],
  };
}
