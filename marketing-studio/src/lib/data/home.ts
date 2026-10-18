import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import type { ContentItem } from "./types";

// Panel del negocio activo. Solo cifras contadas en la base; si no hay datos
// se devuelve 0 o null y la interfaz muestra un estado vacío, nunca una estimación.

export interface HomeData {
  published: number;
  activeCampaigns: number;
  inReview: number;
  upcoming: ContentItem[];
  drafts: ContentItem[];
  leads: { total: number; customers: number; revenueCents: number } | null;
  offeringsWithPrice: number;
  pendingDistribution: number;
}

export async function getHomeData(businessId: string): Promise<HomeData> {
  await requireUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const count = { count: "exact" as const, head: true };
  const [published, campaigns, review, upcoming, drafts, leads, priced, dist] = await Promise.all([
    supabase.from("mkt_content_items").select("id", count).eq("business_id", businessId).eq("status", "published"),
    supabase.from("mkt_campaigns").select("id", count).eq("business_id", businessId).eq("status", "active"),
    supabase.from("mkt_content_items").select("id", count).eq("business_id", businessId).eq("status", "review"),
    supabase
      .from("mkt_content_items")
      .select("*")
      .eq("business_id", businessId)
      .gte("scheduled_at", nowIso)
      .neq("status", "published")
      .order("scheduled_at")
      .limit(5),
    supabase.from("mkt_content_items").select("*").eq("business_id", businessId).eq("status", "draft").order("updated_at", { ascending: false }).limit(4),
    supabase.from("mkt_leads").select("status,value_cents").eq("business_id", businessId).limit(5000),
    supabase.from("mkt_offerings").select("id", count).eq("business_id", businessId).eq("active", true).not("price_cents", "is", null),
    supabase.from("mkt_distribution_tasks").select("id", count).eq("business_id", businessId).in("status", ["pending", "opened"]),
  ]);
  const leadRows = leads.data ?? [];
  return {
    published: published.count ?? 0,
    activeCampaigns: campaigns.count ?? 0,
    inReview: review.count ?? 0,
    upcoming: (upcoming.data ?? []) as ContentItem[],
    drafts: (drafts.data ?? []) as ContentItem[],
    leads: leadRows.length
      ? {
          total: leadRows.length,
          customers: leadRows.filter((l) => l.status === "customer").length,
          revenueCents: leadRows.reduce((a, l) => a + (l.status === "customer" ? (l.value_cents ?? 0) : 0), 0),
        }
      : null,
    offeringsWithPrice: priced.count ?? 0,
    pendingDistribution: dist.count ?? 0,
  };
}
