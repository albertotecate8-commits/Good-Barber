import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { frequencyCheck, groupText, type PostingMode } from "./core";

// Crea (o amplía) la cola de distribución de una publicación. La usan la
// acción del panel (con la sesión del usuario y RLS) y el proceso de
// publicación (service_role) tras publicar en la página. Solo incluye grupos
// ACTIVOS del MISMO negocio que el usuario eligió, sin repetir grupos y
// respetando la pausa mínima de cada grupo.

export interface CreateDistributionInput {
  businessId: string;
  contentId: string;
  groupIds: string[];
  sourceUrl: string;
  createdBy: string | null;
  now?: Date;
}

export interface CreateDistributionResult {
  distributionId: string;
  added: { groupId: string; name: string }[];
  skipped: { groupId: string; name: string; reason: string }[];
}

export async function createDistribution(db: SupabaseClient, input: CreateDistributionInput): Promise<CreateDistributionResult> {
  const now = input.now ?? new Date();
  const ids = [...new Set(input.groupIds)].slice(0, 50);
  if (!ids.length) throw new Error("Elige al menos un grupo.");
  if (!/^https:\/\//.test(input.sourceUrl)) throw new Error("La publicación no tiene un enlace público.");

  const [{ data: groups, error: gErr }, { data: content }, { data: biz }] = await Promise.all([
    db.from("mkt_fb_groups").select("id, name, posting_mode, active, min_days_between, business_id").in("id", ids).eq("business_id", input.businessId),
    db.from("mkt_content_items").select("id, caption, business_id").eq("id", input.contentId).eq("business_id", input.businessId).maybeSingle(),
    db.from("mkt_businesses").select("name, sector").eq("id", input.businessId).maybeSingle(),
  ]);
  if (gErr) throw new Error("No se pudieron leer los grupos.");
  if (!content) throw new Error("La publicación no existe en este negocio.");

  const skipped: CreateDistributionResult["skipped"] = [];
  const byId = new Map((groups ?? []).map((g) => [g.id as string, g]));
  for (const id of ids) if (!byId.has(id)) skipped.push({ groupId: id, name: "Grupo desconocido", reason: "No pertenece a este negocio." });

  // Última actividad en cada grupo (de cualquier publicación) para la pausa mínima.
  const { data: activity } = await db
    .from("mkt_distribution_tasks")
    .select("group_id, content_id, status, opened_at, confirmed_at")
    .in("group_id", [...byId.keys()])
    .in("status", ["opened", "awaiting_approval", "confirmed"]);
  const last = new Map<string, string>();
  for (const a of activity ?? []) {
    const at = (a.confirmed_at ?? a.opened_at) as string | null;
    if (at && (!last.has(a.group_id) || at > last.get(a.group_id)!)) last.set(a.group_id, at);
  }
  const { data: existing } = await db.from("mkt_distribution_tasks").select("group_id").eq("content_id", input.contentId);
  const already = new Set((existing ?? []).map((e) => e.group_id as string));

  const eligible = [];
  for (const g of byId.values()) {
    if (!g.active) skipped.push({ groupId: g.id, name: g.name, reason: "Está desactivado." });
    else if (already.has(g.id)) skipped.push({ groupId: g.id, name: g.name, reason: "Ya está en la cola de esta publicación." });
    else {
      const f = frequencyCheck(g.min_days_between, last.get(g.id) ?? null, now);
      if (!f.allowed) skipped.push({ groupId: g.id, name: g.name, reason: `Respeta la pausa de ${g.min_days_between} días: disponible desde el ${f.nextAllowedAt!.toISOString().slice(0, 10)}.` });
      else eligible.push(g);
    }
  }

  // Reutiliza la distribución activa/pausada de la publicación, o crea una nueva.
  const { data: current } = await db
    .from("mkt_distributions")
    .select("id")
    .eq("content_id", input.contentId)
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let distributionId = current?.id as string | undefined;
  if (!distributionId) {
    if (!eligible.length) throw new Error(skipped.map((s) => `${s.name}: ${s.reason}`).join(" ") || "Ningún grupo disponible.");
    const { data: created, error } = await db
      .from("mkt_distributions")
      .insert({ business_id: input.businessId, content_id: input.contentId, source_url: input.sourceUrl, ...(input.createdBy ? { created_by: input.createdBy } : {}) })
      .select("id")
      .single();
    if (error || !created) throw new Error("No se pudo crear la distribución.");
    distributionId = created.id as string;
  }

  const { data: maxPos } = await db.from("mkt_distribution_tasks").select("position").eq("distribution_id", distributionId).order("position", { ascending: false }).limit(1).maybeSingle();
  let position = ((maxPos?.position as number | undefined) ?? -1) + 1;
  const rows = eligible.map((g) => ({
    business_id: input.businessId,
    distribution_id: distributionId!,
    content_id: input.contentId,
    group_id: g.id,
    position: position++,
    post_text: groupText({
      mode: g.posting_mode as PostingMode,
      groupName: g.name,
      businessName: biz?.name ?? "",
      sector: biz?.sector ?? "",
      caption: content.caption ?? "",
      sourceUrl: input.sourceUrl,
      position: position - 1,
    }),
  }));
  if (rows.length) {
    const { error } = await db.from("mkt_distribution_tasks").insert(rows);
    if (error) throw new Error(error.code === "23505" ? "Uno de los grupos ya estaba en la cola." : "No se pudieron crear las tareas.");
  }
  return { distributionId, added: eligible.map((g) => ({ groupId: g.id, name: g.name })), skipped };
}
