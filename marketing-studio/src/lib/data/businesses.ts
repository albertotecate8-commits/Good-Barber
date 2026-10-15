import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import type {
  AuditEntry,
  BrandProfile,
  Business,
  Campaign,
  ContentItem,
  Offering,
  Promotion,
  SocialAccount,
} from "./types";

// Todas las lecturas pasan por la sesión del usuario: RLS decide qué negocios
// ve. Nunca se filtra "a mano" por seguridad; los filtros aquí son de
// presentación.

export class DataError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DataError";
  }
}

function fail(what: string, error: { message: string } | null): never {
  throw new DataError(`No se pudo cargar ${what}. ${error?.message ?? ""}`.trim(), error);
}

export const listBusinesses = cache(async (): Promise<Business[]> => {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_businesses")
    .select("*")
    .eq("status", "active")
    .order("name");
  if (error) fail("los negocios", error);
  return data as Business[];
});

export const getBusinessBySlug = cache(async (slug: string) => {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_businesses").select("*").eq("slug", slug).maybeSingle();
  if (error) fail("el negocio", error);
  if (!data) notFound();
  return data as Business;
});

export async function getBusinessDetail(slug: string) {
  const business = await getBusinessBySlug(slug);
  const supabase = await createClient();
  const [brand, offerings, promotions, socials, audit] = await Promise.all([
    supabase.from("mkt_brand_profiles").select("*").eq("business_id", business.id).maybeSingle(),
    supabase.from("mkt_offerings").select("*").eq("business_id", business.id).order("sort_order").order("name"),
    supabase.from("mkt_promotions").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
    supabase.from("mkt_social_accounts").select("*").eq("business_id", business.id).order("platform"),
    supabase
      .from("mkt_audit_log")
      .select("*")
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  for (const [name, r] of [
    ["la identidad de marca", brand],
    ["los servicios", offerings],
    ["las promociones", promotions],
    ["los perfiles sociales", socials],
    ["el historial", audit],
  ] as const) {
    if (r.error) fail(name, r.error);
  }
  return {
    business,
    brand: brand.data as BrandProfile | null,
    offerings: offerings.data as Offering[],
    promotions: promotions.data as Promotion[],
    socials: socials.data as SocialAccount[],
    audit: audit.data as AuditEntry[],
  };
}

export interface DashboardData {
  businesses: (Business & { brand: Pick<BrandProfile, "color_primary" | "logo_url"> | null })[];
  counts: Record<string, { offerings: number; socials: number; campaigns: number; upcoming: number }>;
  upcoming: (ContentItem & { business_name: string })[];
  campaignsInProgress: (Campaign & { business_name: string })[];
  socials: (SocialAccount & { business_name: string })[];
  failedContent: number;
}

export async function getDashboard(): Promise<DashboardData> {
  await requireUser();
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [biz, brands, offerings, socials, campaigns, content, failed] = await Promise.all([
    supabase.from("mkt_businesses").select("*").eq("status", "active").order("name"),
    supabase.from("mkt_brand_profiles").select("business_id,color_primary,logo_url"),
    supabase.from("mkt_offerings").select("business_id").eq("active", true),
    supabase.from("mkt_social_accounts").select("*"),
    supabase
      .from("mkt_campaigns")
      .select("*")
      .in("status", ["idea", "research", "draft", "review", "approved", "active"])
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("mkt_content_items")
      .select("*")
      .gte("scheduled_at", nowIso)
      .neq("status", "published")
      .order("scheduled_at")
      .limit(8),
    supabase.from("mkt_content_items").select("id", { count: "exact", head: true }).eq("status", "error"),
  ]);
  for (const r of [biz, brands, offerings, socials, campaigns, content, failed]) if (r.error) fail("el panel", r.error);

  const businesses = biz.data as Business[];
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));
  const brandOf = new Map((brands.data ?? []).map((b) => [b.business_id as string, b]));
  const counts: DashboardData["counts"] = {};
  for (const b of businesses) counts[b.id] = { offerings: 0, socials: 0, campaigns: 0, upcoming: 0 };
  for (const o of offerings.data ?? []) if (counts[o.business_id]) counts[o.business_id].offerings++;
  for (const s of socials.data ?? []) if (counts[s.business_id]) counts[s.business_id].socials++;
  for (const c of campaigns.data ?? []) if (counts[c.business_id]) counts[c.business_id].campaigns++;
  for (const c of content.data ?? []) if (counts[c.business_id]) counts[c.business_id].upcoming++;

  const withName = <T extends { business_id: string }>(rows: T[]) =>
    rows.filter((r) => nameOf.has(r.business_id)).map((r) => ({ ...r, business_name: nameOf.get(r.business_id)! }));

  return {
    businesses: businesses.map((b) => ({
      ...b,
      brand: (brandOf.get(b.id) as DashboardData["businesses"][number]["brand"]) ?? null,
    })),
    counts,
    upcoming: withName(content.data as ContentItem[]),
    campaignsInProgress: withName(campaigns.data as Campaign[]),
    socials: withName(socials.data as SocialAccount[]),
    failedContent: failed.count ?? 0,
  };
}

/** Negocios activos con su color principal (para distinguirlos en calendario y biblioteca). */
export const listBusinessesWithColor = cache(async () => {
  const businesses = await listBusinesses();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_brand_profiles").select("business_id,color_primary");
  if (error) fail("los colores de marca", error);
  const color = new Map((data ?? []).map((b) => [b.business_id as string, b.color_primary as string]));
  return businesses.map((b) => ({ ...b, color: color.get(b.id) ?? "#C9A227" }));
});
export type BusinessWithColor = Awaited<ReturnType<typeof listBusinessesWithColor>>[number];
