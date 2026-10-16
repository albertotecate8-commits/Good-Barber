"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import type { ActionState } from "@/lib/action-state";
import { MetaError } from "@/lib/meta/graph";
import { validateForPlatform, type PublishPlatform } from "@/lib/meta/publish";
import { checkPublishAccess, publishReadiness, setAutoPublish } from "@/lib/meta/service";
import { composePostText } from "@/lib/validation/content";

// Aprobación manual obligatoria: solo el DUEÑO del negocio puede aprobar que
// una publicación salga sola, y solo si la cuenta tiene permisos de publicación.
// Cualquier editor puede cancelarla. Todo se verifica en el servidor.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function approveAutoPublish(contentId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!UUID.test(contentId)) return { message: "Identificador inválido." };
  if (form.get("confirm") !== "on") return { message: "Confirma que revisaste el texto, la imagen, la red y la fecha.", errors: { confirm: "Marca la casilla." } };
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("mkt_content_items")
    .select("id, business_id, platform, format, status, scheduled_at, caption, hashtags, asset_id, external_post_id")
    .eq("id", contentId)
    .maybeSingle();
  if (!item) return { message: "La publicación no existe o no tienes acceso." };
  const { data: isOwner } = await supabase.rpc("mkt_is_owner", { p_business: item.business_id });
  if (!isOwner) return { message: "Solo el dueño del negocio puede aprobar la publicación automática." };
  if (item.external_post_id) return { message: "Esta publicación ya se publicó." };
  if (!["approved", "scheduled"].includes(item.status)) return { message: "Primero márcala como «Aprobada» o «Programada»." };
  if (!item.scheduled_at) return { message: "Elige fecha y hora de publicación." };
  if (new Date(item.scheduled_at).getTime() < Date.now() - 5 * 60_000) return { message: "La fecha programada ya pasó: elige una nueva." };

  const readiness = await publishReadiness(item.business_id, item.platform);
  if (!readiness.ready) return { message: readiness.reason ?? "La cuenta no está lista para publicar." };

  let mediaKind: "image" | "video" | null = null;
  if (item.asset_id) {
    const { data: asset } = await supabase.from("mkt_assets").select("mime_type, storage_backend, upload_status").eq("id", item.asset_id).maybeSingle();
    if (!asset || asset.upload_status !== "ready") return { message: "El recurso creativo no está disponible." };
    if (asset.storage_backend !== "supabase") return { message: "El recurso está en el almacenamiento local de desarrollo: Meta no puede descargarlo." };
    mediaKind = asset.mime_type.startsWith("video/") ? "video" : asset.mime_type.startsWith("image/") ? "image" : null;
    if (!mediaKind) return { message: "Solo se publican imágenes o videos." };
  }
  const problem = validateForPlatform({
    platform: item.platform as PublishPlatform,
    format: item.format,
    caption: composePostText(item.caption ?? "", item.hashtags ?? []),
    media: mediaKind ? { url: "", kind: mediaKind } : null,
  });
  if (problem) return { message: problem };

  try {
    await setAutoPublish(item.id, { userId: user.id });
  } catch (e) {
    return { message: e instanceof MetaError ? e.message : "No se pudo aprobar." };
  }
  revalidatePath(`/calendario/${item.id}`);
  revalidatePath("/calendario");
  return {
    ok: true,
    message: readiness.publishingOn
      ? "Aprobada: se publicará automáticamente a la hora programada."
      : "Aprobada, pero la publicación automática está APAGADA en el servidor: no saldrá hasta que la actives.",
  };
}

export async function revokeAutoPublish(contentId: string): Promise<void> {
  await requireUser();
  if (!UUID.test(contentId)) throw new Error("Identificador inválido");
  const supabase = await createClient();
  const { data: item } = await supabase.from("mkt_content_items").select("id, business_id").eq("id", contentId).maybeSingle();
  if (!item) throw new Error("La publicación no existe o no tienes acceso.");
  const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: item.business_id });
  if (!canWrite) throw new Error("No puedes editar este negocio.");
  await setAutoPublish(item.id, null);
  revalidatePath(`/calendario/${item.id}`);
}

/** Verificación segura de permisos de publicación: NO publica nada. */
export async function verifyPublishPermissions(businessId: string): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(businessId)) return { message: "Identificador inválido." };
  const supabase = await createClient();
  const { data: isOwner } = await supabase.rpc("mkt_is_owner", { p_business: businessId });
  if (!isOwner) return { message: "Solo el dueño del negocio puede verificar los permisos." };
  try {
    const results = await checkPublishAccess(businessId);
    const label = { facebook_page: "Facebook", instagram: "Instagram" } as const;
    const lines = results.map((r) =>
      !r.reachable
        ? `${label[r.platform]}: Meta no devolvió la cuenta.`
        : r.missing.length
          ? `${label[r.platform]}: faltan permisos (${r.missing.join(", ")}).`
          : !r.canCreateContent
            ? `${label[r.platform]}: permisos concedidos, pero tu rol en la página no permite crear contenido.`
            : `${label[r.platform]}: lista para publicar.`,
    );
    const ok = results.length > 0 && results.every((r) => r.reachable && !r.missing.length && r.canCreateContent);
    return { ok, message: `Verificación sin publicar nada — ${lines.join(" ")}` };
  } catch (e) {
    return { message: e instanceof MetaError ? e.message : "No se pudo verificar con Meta." };
  }
}
