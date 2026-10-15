import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "./session";
import { DataError } from "./businesses";
import type { Asset, ContentItem } from "./types";

export interface AssetFilters {
  businessId?: string;
  kind?: string;
  tag?: string;
  q?: string;
}

/** Escapa comodines de ILIKE para buscar texto literal. */
function likeLiteral(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listAssets(f: AssetFilters = {}): Promise<Asset[]> {
  await requireUser();
  const supabase = await createClient();
  let q = supabase
    .from("mkt_assets")
    .select("*")
    .eq("upload_status", "ready")
    .order("created_at", { ascending: false })
    .limit(200);
  if (f.businessId) q = q.eq("business_id", f.businessId);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.q) {
    // Se quitan comas y paréntesis: son separadores de la sintaxis de filtros.
    const term = likeLiteral(f.q.replace(/[,()]/g, " ").trim()).slice(0, 80);
    if (term) q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%,original_name.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw new DataError(`No se pudo cargar la biblioteca. ${error.message}`, error);
  return data as Asset[];
}

/** Recursos listos para elegir en el formulario de publicación. */
export async function listAssetOptions() {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_assets")
    .select("id,business_id,title,kind,mime_type")
    .eq("upload_status", "ready")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new DataError(`No se pudieron cargar los recursos. ${error.message}`, error);
  return data as Pick<Asset, "id" | "business_id" | "title" | "kind" | "mime_type">[];
}

export async function getAssetDetail(id: string) {
  await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_assets").select("*").eq("id", id).maybeSingle();
  if (error) throw new DataError(`No se pudo cargar el recurso. ${error.message}`, error);
  if (!data || data.upload_status !== "ready") notFound();
  const { data: usage, error: usageError } = await supabase
    .from("mkt_content_items")
    .select("id,title,caption,platform,status,scheduled_at")
    .eq("asset_id", id)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(50);
  if (usageError) throw new DataError(usageError.message, usageError);
  return {
    asset: data as Asset,
    usage: (usage ?? []) as Pick<ContentItem, "id" | "title" | "caption" | "platform" | "status" | "scheduled_at">[],
  };
}
