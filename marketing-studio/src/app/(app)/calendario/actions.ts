"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/validation/business";
import { manualPostSchema, validateContent } from "@/lib/validation/content";

// Toda la autorización por negocio la aplica RLS; además los triggers impiden
// enlazar recursos de otro negocio y marcar contenido como publicado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!UUID.test(id)) throw new Error("Identificador inválido");
}

function refresh() {
  revalidatePath("/calendario", "layout");
  revalidatePath("/");
}

export async function createContent(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const v = validateContent(formToObject(form));
  if (!v.ok) return { errors: v.errors, message: "Revisa los campos marcados." };
  const id = randomUUID();
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_content_items").insert({ id, ...v.data, publish_mode: "manual" });
  if (error) return { message: friendlyDbError(error) };
  refresh();
  redirect(`/calendario/${id}?guardado=1`);
}

export async function updateContent(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data: current } = await supabase.from("mkt_content_items").select("status").eq("id", id).maybeSingle();
  if (!current) return { message: "La publicación no existe o no tienes acceso." };
  // "Publicado" y "Error" los asigna el servidor: se conservan al editar.
  const keepStatus = current.status === "published" || current.status === "error";
  const input = formToObject(form);
  if (keepStatus) input.status = "approved";
  const v = validateContent(input);
  if (!v.ok) return { errors: v.errors, message: "Revisa los campos marcados." };
  const { status, ...rest } = v.data;
  const changes = keepStatus ? rest : { ...rest, status };
  const { data, error } = await supabase.from("mkt_content_items").update(changes).eq("id", id).select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar esta publicación." };
  refresh();
  return { ok: true, message: "Publicación guardada." };
}

/** Copia como borrador, sin fecha ni datos de publicación. */
export async function duplicateContent(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data: src, error } = await supabase
    .from("mkt_content_items")
    .select("business_id,campaign_id,platform,format,title,caption,hashtags,asset_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(friendlyDbError(error));
  if (!src) throw new Error("La publicación no existe o no tienes acceso.");
  const newId = randomUUID();
  const title = `${src.title || "Publicación"} (copia)`.slice(0, 200);
  const { error: insertError } = await supabase
    .from("mkt_content_items")
    .insert({ ...src, id: newId, title, status: "draft", scheduled_at: null, publish_mode: "manual" });
  if (insertError) throw new Error(friendlyDbError(insertError));
  refresh();
  redirect(`/calendario/${newId}?duplicado=1`);
}

export async function deleteContent(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_content_items").delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar esta publicación.");
  refresh();
  redirect("/calendario?eliminado=1");
}

/**
 * Registra que TÚ publicaste a mano en la red. No cambia el estado a
 * «Publicado» (eso queda reservado a la confirmación de la plataforma).
 */
export async function markManuallyPosted(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const parsed = manualPostSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: { manual_post_url: parsed.error.issues[0].message } };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_content_items")
    .update({ manual_posted_at: new Date().toISOString(), manual_post_url: parsed.data.manual_post_url })
    .eq("id", id)
    .select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar esta publicación." };
  refresh();
  return { ok: true, message: "Registrado como publicado manualmente por ti." };
}

export async function clearManuallyPosted(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { error } = await supabase
    .from("mkt_content_items")
    .update({ manual_posted_at: null, manual_post_url: null })
    .eq("id", id);
  if (error) throw new Error(friendlyDbError(error));
  refresh();
}
