import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import { DataError } from "./businesses";
import type { Asset, ContentItem, PublishAttempt, SocialAccount } from "./types";

export interface ContentFilters {
  businessId?: string;
  platform?: string;
  status?: string;
  /** Rango UTC [from, to). */
  from?: string;
  to?: string;
}

const COLUMNS =
  "id,business_id,campaign_id,platform,format,title,caption,hashtags,scheduled_at,status,asset_id,publish_mode,manual_posted_at,manual_post_url,external_post_id,published_at,last_error,approved_at,publish_attempts,created_at,updated_at";

/** Publicaciones con fecha dentro del rango (RLS limita a los negocios del usuario). */
export async function listScheduledContent(f: ContentFilters): Promise<ContentItem[]> {
  await requireUser();
  const supabase = await createClient();
  let q = supabase.from("mkt_content_items").select(COLUMNS).not("scheduled_at", "is", null).order("scheduled_at").limit(500);
  if (f.from) q = q.gte("scheduled_at", f.from);
  if (f.to) q = q.lt("scheduled_at", f.to);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  if (f.platform) q = q.eq("platform", f.platform);
  if (f.status) q = q.eq("status", f.status);
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudo cargar el calendario. ${error.message}`, error);
  return data as ContentItem[];
}

/** Borradores sin fecha asignada. */
export async function listUnscheduledContent(f: Omit<ContentFilters, "from" | "to">): Promise<ContentItem[]> {
  await requireUser();
  const supabase = await createClient();
  let q = supabase
    .from("mkt_content_items")
    .select(COLUMNS)
    .is("scheduled_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  if (f.platform) q = q.eq("platform", f.platform);
  if (f.status) q = q.eq("status", f.status);
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudieron cargar los borradores. ${error.message}`, error);
  return data as ContentItem[];
}

export async function getContentDetail(id: string) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_content_items").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new DataError(`No se pudo cargar la publicación. ${error.message}`, error);
  if (!data) notFound();
  const item = data as ContentItem;
  const [asset, socials, attempts] = await Promise.all([
    item.asset_id
      ? supabase.from("mkt_assets").select("*").eq("id", item.asset_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("mkt_social_accounts").select("*").eq("business_id", item.business_id),
    supabase
      .from("mkt_publish_attempts")
      .select("id,content_id,platform,attempted_at,outcome,external_post_id,error")
      .eq("content_id", id)
      .order("attempted_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [asset, socials, attempts]) if (r.error) throw new DataError(r.error.message, r.error);
  return {
    item,
    asset: asset.data as Asset | null,
    socials: (socials.data ?? []) as SocialAccount[],
    attempts: (attempts.data ?? []) as PublishAttempt[],
  };
}
