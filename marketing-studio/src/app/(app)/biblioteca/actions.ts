"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/validation/business";
import { ALLOWED_MIME, MAX_ASSET_BYTES, assetMetaSchema, assetUploadSchema, safeFileName, sniffMatches, type AssetUploadInput } from "@/lib/validation/asset";
import { SUPABASE_BUCKET, storageConfig, storagePath, type StorageBackend } from "@/lib/storage/config";
import { removeLocal } from "@/lib/storage/local";

// Flujo de subida en 3 pasos (los archivos grandes no pasan por una Server
// Action, que tiene límite de tamaño):
//   1. prepareAssetUpload: valida y crea el registro "pending" (RLS: solo si
//      puedes editar ese negocio). Devuelve la ruta asignada.
//   2. El navegador sube el archivo: a Supabase Storage (las políticas exigen
//      un registro pending con esa ruta) o a la ruta local de desarrollo.
//   3. finalizeAssetUpload (solo Supabase): verifica tamaño y tipo reales y lo
//      marca "ready". En modo local lo hace la propia ruta de subida.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!UUID.test(id)) throw new Error("Identificador inválido");
}

export type PrepareResult =
  | { ok: true; id: string; path: string; backend: StorageBackend; bucket: string }
  | { ok: false; message: string; errors?: Record<string, string> };

export async function prepareAssetUpload(input: AssetUploadInput): Promise<PrepareResult> {
  await requireUser();
  const cfg = storageConfig();
  if (cfg.problem) return { ok: false, message: cfg.problem };
  const parsed = assetUploadSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, message: "Revisa los datos del archivo.", errors };
  }
  const v = parsed.data;
  const supabase = await createClient();

  // Limpieza de subidas propias abandonadas (más de 1 hora en "pending").
  await supabase
    .from("mkt_assets")
    .delete()
    .eq("business_id", v.business_id)
    .eq("upload_status", "pending")
    .lt("created_at", new Date(Date.now() - 3600_000).toISOString());

  const id = randomUUID();
  const path = storagePath(v.business_id, id, safeFileName(v.original_name));
  const { error } = await supabase.from("mkt_assets").insert({
    id,
    business_id: v.business_id,
    kind: v.kind,
    origin: v.origin,
    title: v.title,
    description: v.description,
    tags: v.tags,
    asset_date: v.asset_date,
    storage_backend: cfg.backend,
    storage_path: path,
    original_name: v.original_name.slice(0, 255),
    mime_type: v.mime_type,
    size_bytes: v.size,
    upload_status: "pending",
  });
  if (error) return { ok: false, message: friendlyDbError(error) };
  return { ok: true, id, path, backend: cfg.backend, bucket: SUPABASE_BUCKET };
}

/** Verifica en Supabase Storage que el archivo exista y coincida, y lo marca listo. */
export async function finalizeAssetUpload(id: string): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data: asset, error } = await supabase
    .from("mkt_assets")
    .select("id,storage_backend,storage_path,mime_type,kind,upload_status")
    .eq("id", id)
    .maybeSingle();
  if (error) return { message: friendlyDbError(error) };
  if (!asset || asset.storage_backend !== "supabase") return { message: "Registro de subida no encontrado." };
  if (asset.upload_status === "ready") return { ok: true };

  const folder = asset.storage_path.split("/").slice(0, -1).join("/");
  const name = asset.storage_path.split("/").pop()!;
  const { data: list, error: listError } = await supabase.storage.from(SUPABASE_BUCKET).list(folder, { search: name });
  const obj = list?.find((o) => o.name === name);
  if (listError || !obj) {
    await discardPendingAsset(id);
    return { message: "El archivo no llegó a Supabase Storage. Inténtalo de nuevo." };
  }
  const size = Number(obj.metadata?.size ?? 0);
  const mimetype = String(obj.metadata?.mimetype ?? "");
  let problem = "";
  if (!size || size > MAX_ASSET_BYTES) problem = "Tamaño de archivo no válido.";
  else if (mimetype && !ALLOWED_MIME[asset.kind as keyof typeof ALLOWED_MIME].includes(mimetype)) problem = "Tipo de archivo no permitido.";
  else {
    // Revisa los primeros bytes reales (que no sea, p. ej., un ejecutable con extensión .jpg).
    const { data: signed } = await supabase.storage.from(SUPABASE_BUCKET).createSignedUrl(asset.storage_path, 60);
    if (signed?.signedUrl) {
      const head = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-63" } })
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      if (head && !sniffMatches(asset.mime_type, new Uint8Array(head))) problem = "El contenido del archivo no corresponde a su tipo.";
    }
  }
  if (problem) {
    await supabase.storage.from(SUPABASE_BUCKET).remove([asset.storage_path]);
    await supabase.from("mkt_assets").delete().eq("id", id);
    return { message: problem };
  }
  const { error: updateError } = await supabase
    .from("mkt_assets")
    .update({ upload_status: "ready", size_bytes: size, mime_type: mimetype || asset.mime_type })
    .eq("id", id);
  if (updateError) return { message: friendlyDbError(updateError) };
  revalidatePath("/biblioteca");
  return { ok: true };
}

/** Descarta un registro pendiente cuando la subida falla o se cancela. */
export async function discardPendingAsset(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data } = await supabase
    .from("mkt_assets")
    .delete()
    .eq("id", id)
    .eq("upload_status", "pending")
    .select("storage_backend,storage_path");
  const row = data?.[0];
  if (row?.storage_backend === "supabase") await supabase.storage.from(SUPABASE_BUCKET).remove([row.storage_path]);
  if (row?.storage_backend === "local_dev") await removeLocal(row.storage_path).catch(() => {});
}

export async function updateAssetMeta(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const parsed = assetMetaSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("mkt_assets").select("mime_type").eq("id", id).maybeSingle();
  if (!current) return { message: "El recurso no existe o no tienes acceso." };
  if (!ALLOWED_MIME[parsed.data.kind].includes(current.mime_type))
    return { errors: { kind: "Ese tipo no corresponde al formato del archivo." } };
  const { data, error } = await supabase.from("mkt_assets").update(parsed.data).eq("id", id).select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar este recurso." };
  revalidatePath("/biblioteca", "layout");
  return { ok: true, message: "Datos del recurso guardados." };
}

export async function deleteAsset(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  // Primero el registro (RLS confirma el permiso), después el archivo.
  const { data, error } = await supabase
    .from("mkt_assets")
    .delete()
    .eq("id", id)
    .select("storage_backend,storage_path");
  if (error) throw new Error(friendlyDbError(error));
  const row = data?.[0];
  if (!row) throw new Error("No tienes permiso para eliminar este recurso.");
  let fileWarning = "";
  if (row.storage_backend === "supabase") {
    const { error: rmError } = await supabase.storage.from(SUPABASE_BUCKET).remove([row.storage_path]);
    if (rmError) fileWarning = "1";
  } else {
    await removeLocal(row.storage_path).catch(() => {
      fileWarning = "1";
    });
  }
  revalidatePath("/biblioteca", "layout");
  revalidatePath("/calendario", "layout");
  redirect(`/biblioteca?eliminado=1${fileWarning ? "&archivo_huerfano=1" : ""}`);
}
