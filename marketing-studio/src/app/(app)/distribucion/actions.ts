"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { DAILY_GROUP_LIMIT, POSTING_MODES, TASK_STATUSES, activityLast24h, normalizeGroupUrl, type QueueTask, type TaskStatus } from "@/lib/distribution/core";
import { createDistribution } from "@/lib/distribution/server";

// Todo con la sesión del usuario (RLS). La base impide mezclar negocios.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refresh = () => revalidatePath("/distribucion", "layout");

const groupSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del grupo.").max(160),
  url: z
    .string()
    .trim()
    .transform((v) => normalizeGroupUrl(v))
    .refine((v): v is string => v !== null, "Pega la dirección del grupo (https://www.facebook.com/groups/…)."),
  posting_mode: z.enum(POSTING_MODES),
  page_can_participate: z.enum(["unknown", "yes", "no"]),
  requires_approval: z.boolean(),
  rules: z.string().trim().max(2000),
  min_days_between: z.coerce.number().int().min(1, "Mínimo 1 día.").max(90, "Máximo 90 días."),
  notes: z.string().trim().max(1000),
});

function parseGroup(form: FormData) {
  return groupSchema.safeParse({
    name: form.get("name") ?? "",
    url: form.get("url") ?? "",
    posting_mode: form.get("posting_mode") ?? "share_page_post",
    page_can_participate: form.get("page_can_participate") ?? "unknown",
    requires_approval: form.get("requires_approval") === "on",
    rules: form.get("rules") ?? "",
    min_days_between: form.get("min_days_between") ?? 7,
    notes: form.get("notes") ?? "",
  });
}
const errorsOf = (e: z.ZodError) => {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
};

export async function createGroup(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(businessId)) return { message: "Elige un negocio." };
  const parsed = parseGroup(form);
  if (!parsed.success) return { message: "Revisa los datos del grupo.", errors: errorsOf(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_fb_groups").insert({ business_id: businessId, ...parsed.data });
  if (error) return { message: error.code === "23505" ? "Ese grupo ya está registrado en este negocio." : friendlyDbError(error) };
  refresh();
  return { ok: true, message: `Grupo «${parsed.data.name}» agregado.` };
}

export async function updateGroup(groupId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(groupId)) return { message: "Identificador inválido." };
  const parsed = parseGroup(form);
  if (!parsed.success) return { message: "Revisa los datos del grupo.", errors: errorsOf(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_fb_groups").update(parsed.data).eq("id", groupId).select("id");
  if (error) return { message: error.code === "23505" ? "Ese grupo ya está registrado en este negocio." : friendlyDbError(error) };
  if (!data?.length) return { message: "El grupo no existe o no tienes acceso." };
  refresh();
  return { ok: true, message: "Grupo actualizado." };
}

export async function setGroupActive(groupId: string, active: boolean): Promise<void> {
  await requireUser();
  if (!UUID.test(groupId)) throw new Error("Identificador inválido");
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_fb_groups").update({ active }).eq("id", groupId);
  if (error) throw new Error(friendlyDbError(error));
  refresh();
}

/** Crea la cola de distribución con los grupos elegidos (solo del negocio de la publicación). */
export async function startDistribution(contentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!UUID.test(contentId)) return { message: "Identificador inválido." };
  const groupIds = form.getAll("group_ids").map(String).filter((g) => UUID.test(g));
  if (!groupIds.length) return { message: "Elige al menos un grupo.", errors: { group_ids: "Elige al menos un grupo." } };
  const supabase = await createClient();
  const { data: item } = await supabase.from("mkt_content_items").select("id, business_id, platform, external_post_url, manual_post_url").eq("id", contentId).maybeSingle();
  if (!item) return { message: "La publicación no existe o no tienes acceso." };
  const sourceUrl = item.external_post_url ?? item.manual_post_url;
  if (!sourceUrl) return { message: "Primero publícala en la página: hace falta el enlace de la publicación original." };
  let distributionId: string;
  try {
    const r = await createDistribution(supabase, { businessId: item.business_id, contentId, groupIds, sourceUrl, createdBy: user.id });
    distributionId = r.distributionId;
    if (!r.added.length) return { message: `No se agregó ningún grupo. ${r.skipped.map((s) => `${s.name}: ${s.reason}`).join(" ")}` };
  } catch (e) {
    return { message: (e as Error).message };
  }
  refresh();
  redirect(`/distribucion/${distributionId}`);
}

/** Guarda en la publicación los grupos a los que se distribuirá en cuanto se publique en la página. */
export async function planGroups(contentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(contentId)) return { message: "Identificador inválido." };
  const supabase = await createClient();
  const { data: item } = await supabase.from("mkt_content_items").select("id, business_id").eq("id", contentId).maybeSingle();
  if (!item) return { message: "La publicación no existe o no tienes acceso." };
  const ids = form.getAll("group_ids").map(String).filter((g) => UUID.test(g));
  const { data: valid } = ids.length
    ? await supabase.from("mkt_fb_groups").select("id").in("id", ids).eq("business_id", item.business_id).eq("active", true)
    : { data: [] };
  const { error } = await supabase.from("mkt_content_items").update({ planned_group_ids: (valid ?? []).map((g) => g.id) }).eq("id", contentId);
  if (error) return { message: friendlyDbError(error) };
  revalidatePath(`/calendario/${contentId}`);
  return { ok: true, message: valid?.length ? `${valid.length} grupo(s) planeados: la cola se creará al publicarse en la página.` : "Sin grupos planeados." };
}

const TRANSITIONS: Record<string, TaskStatus[]> = {
  open: ["opened"],
  confirm: ["confirmed"],
  awaiting: ["awaiting_approval"],
  skip: ["skipped"],
  fail: ["failed"],
  reset: ["pending"],
};

/** Cambia el estado de una tarea. «Confirmado» solo lo marca la persona (queda su nombre y fecha). */
export async function updateTask(taskId: string, action: keyof typeof TRANSITIONS, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(taskId) || !TRANSITIONS[action]) return { message: "Acción inválida." };
  const status = TRANSITIONS[action][0];
  if (!TASK_STATUSES.includes(status)) return { message: "Estado inválido." };
  const supabase = await createClient();
  const { data: task } = await supabase.from("mkt_distribution_tasks").select("id, distribution_id, status").eq("id", taskId).maybeSingle();
  if (!task) return { message: "La tarea no existe o no tienes acceso." };
  const { data: dist } = await supabase.from("mkt_distributions").select("status").eq("id", task.distribution_id).maybeSingle();
  if (dist?.status !== "active" && action !== "reset") return { message: "La distribución está pausada o cancelada: reanúdala primero." };

  const rawUrl = String(form.get("group_post_url") ?? "").trim();
  if (rawUrl && !/^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(rawUrl)) return { message: "El enlace debe ser de facebook.com.", errors: { group_post_url: "Enlace no válido." } };
  const note = String(form.get("note") ?? "").trim().slice(0, 1000);
  if (action === "fail" && !note) return { message: "Escribe qué falló.", errors: { note: "Describe el problema." } };

  const { error } = await supabase
    .from("mkt_distribution_tasks")
    .update({ status, ...(rawUrl ? { group_post_url: rawUrl } : {}), ...(note || action === "reset" ? { note } : {}) })
    .eq("id", taskId);
  if (error) return { message: friendlyDbError(error) };
  await completeIfDone(supabase, task.distribution_id);
  revalidatePath(`/distribucion/${task.distribution_id}`);
  return { ok: true, message: action === "confirm" ? "Confirmado como publicado en el grupo." : "Estado actualizado." };
}

/** Marca la tarea como abierta (se llama al abrir Facebook desde el panel). */
export async function markOpened(taskId: string): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  if (!UUID.test(taskId)) return { ok: false, message: "Identificador inválido." };
  const supabase = await createClient();
  const { data: task } = await supabase.from("mkt_distribution_tasks").select("id, status, distribution_id, business_id").eq("id", taskId).maybeSingle();
  if (!task) return { ok: false, message: "La tarea no existe o no tienes acceso." };
  const { data: dist } = await supabase.from("mkt_distributions").select("status").eq("id", task.distribution_id).maybeSingle();
  if (dist?.status !== "active") return { ok: false, message: "La distribución está pausada o cancelada." };
  // Tope diario por negocio para no saturar grupos ni parecer spam.
  const { data: recent } = await supabase
    .from("mkt_distribution_tasks")
    .select("id, status, position, opened_at, confirmed_at")
    .eq("business_id", task.business_id)
    .in("status", ["opened", "awaiting_approval", "confirmed"])
    .neq("id", taskId);
  const count = activityLast24h((recent ?? []) as QueueTask[]);
  if (task.status === "pending" && count >= DAILY_GROUP_LIMIT)
    return { ok: false, message: `Ya distribuiste a ${DAILY_GROUP_LIMIT} grupos en las últimas 24 h. Continúa mañana para no saturar a las comunidades.` };
  if (task.status === "pending") await supabase.from("mkt_distribution_tasks").update({ status: "opened" }).eq("id", taskId);
  revalidatePath(`/distribucion/${task.distribution_id}`);
  return { ok: true };
}

async function completeIfDone(supabase: Awaited<ReturnType<typeof createClient>>, distributionId: string) {
  const { count } = await supabase.from("mkt_distribution_tasks").select("id", { count: "exact", head: true }).eq("distribution_id", distributionId).in("status", ["pending", "opened"]);
  if (count === 0) await supabase.from("mkt_distributions").update({ status: "completed" }).eq("id", distributionId).eq("status", "active");
}

export async function setDistributionStatus(distributionId: string, status: "active" | "paused" | "cancelled"): Promise<void> {
  await requireUser();
  if (!UUID.test(distributionId)) throw new Error("Identificador inválido");
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_distributions").update({ status }).eq("id", distributionId).in("status", status === "active" ? ["paused"] : ["active", "paused"]);
  if (error) throw new Error(friendlyDbError(error));
  if (status === "cancelled") {
    await supabase.from("mkt_distribution_tasks").update({ status: "cancelled" }).eq("distribution_id", distributionId).in("status", ["pending", "opened"]);
  }
  revalidatePath(`/distribucion/${distributionId}`);
  refresh();
}
