import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publishReadiness, type PublishReadiness } from "@/lib/meta/service";
import type { Proposal } from "@/lib/studio/propose";
import { parseAttributes, type MemoryItem, type Style } from "@/lib/studio/styles";

// Datos del chat creativo (Crear) y de Estilos y memoria. Todo filtrado por el
// negocio activo; RLS sigue decidiendo qué puede ver cada persona.

export interface StudioMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload: { proposals?: (Proposal & { versionId: string })[]; memory?: { id: string; kind: string; text: string }; links?: { href: string; label: string }[]; imported?: { versionId: string; parentVersionId: string | null } };
  asset_ids: string[];
  version_id: string | null;
  created_at: string;
}

export interface StudioVersion {
  id: string;
  kind: string;
  asset_id: string | null;
  parent_version_id: string | null;
  style_id: string | null;
  qa_status: string;
  is_final: boolean;
  version_no: number;
  created_at: string;
}

export interface StudioPublication {
  id: string;
  creative_version_id: string;
  platform: string;
  status: string;
  publish_mode: string;
  scheduled_at: string | null;
  external_post_id: string | null;
  external_post_url: string | null;
  last_error: string | null;
  approved_at: string | null;
}

export async function listStyles(businessId: string): Promise<Style[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mkt_styles")
    .select("id,name,description,attributes,reference_asset_ids,source,active,created_at,updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });
  return (data ?? []).map((s) => ({ ...s, attributes: parseAttributes(s.attributes) })) as Style[];
}

export async function listMemory(businessId: string): Promise<MemoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mkt_memory")
    .select("id,kind,text,source,source_url,active,created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  return (data ?? []) as MemoryItem[];
}

export async function getStudio(businessId: string, threadId: string | null) {
  const supabase = await createClient();
  const [threads, styles, memory, images, brand, logos] = await Promise.all([
    supabase.from("mkt_creative_threads").select("id,title,style_id,project_id,updated_at").eq("business_id", businessId).order("updated_at", { ascending: false }).limit(20),
    listStyles(businessId),
    listMemory(businessId),
    supabase
      .from("mkt_assets")
      .select("id,title,origin,created_at")
      .eq("business_id", businessId)
      .eq("kind", "image")
      .eq("upload_status", "ready")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("mkt_brand_profiles").select("logo_url").eq("business_id", businessId).maybeSingle(),
    supabase.from("mkt_assets").select("id,title").eq("business_id", businessId).eq("kind", "logo").eq("upload_status", "ready").order("created_at", { ascending: false }).limit(3),
  ]);
  const thread = (threadId ? threads.data?.find((t) => t.id === threadId) : threads.data?.[0]) ?? null;
  let messages: StudioMessage[] = [];
  let versions: StudioVersion[] = [];
  let publications: StudioPublication[] = [];
  if (thread) {
    const [m, v] = await Promise.all([
      supabase.from("mkt_creative_messages").select("id,role,content,payload,asset_ids,version_id,created_at").eq("thread_id", thread.id).order("created_at").limit(200),
      thread.project_id
        ? supabase
            .from("mkt_creative_versions")
            .select("id,kind,asset_id,parent_version_id,style_id,qa_status,is_final,version_no,created_at")
            .eq("project_id", thread.project_id)
            .order("version_no")
        : Promise.resolve({ data: [] }),
    ]);
    messages = (m.data ?? []) as StudioMessage[];
    versions = (v.data ?? []) as StudioVersion[];
    const ids = versions.filter((x) => x.asset_id).map((x) => x.id);
    if (ids.length) {
      const { data } = await supabase
        .from("mkt_content_items")
        .select("id,creative_version_id,platform,status,publish_mode,scheduled_at,external_post_id,external_post_url,last_error,approved_at")
        .in("creative_version_id", ids);
      publications = (data ?? []) as StudioPublication[];
    }
  }
  return {
    threads: threads.data ?? [],
    thread,
    messages,
    versions,
    publications,
    styles,
    memory,
    recentImages: images.data ?? [],
    logo: logos.data?.[0] ?? null,
    hasLogo: Boolean(brand.data?.logo_url || logos.data?.length),
  };
}

/** Estado de cada destino por separado (página de Facebook e Instagram profesional). */
export async function destinationsReadiness(businessId: string): Promise<Record<"facebook_page" | "instagram", PublishReadiness>> {
  const safe = async (p: "facebook_page" | "instagram"): Promise<PublishReadiness> => {
    try {
      return await publishReadiness(businessId, p);
    } catch {
      return { ready: false, reason: "No se pudo verificar la conexión con Meta.", accountId: null, accountName: null, missingScopes: [], publishingOn: false };
    }
  };
  const [facebook_page, instagram] = await Promise.all([safe("facebook_page"), safe("instagram")]);
  return { facebook_page, instagram };
}
