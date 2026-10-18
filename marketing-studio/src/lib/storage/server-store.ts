import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_BUCKET, storageConfig, storagePath } from "./config";
import { writeLocalStream, openLocalStream, statLocal } from "./local";
import { MAX_ASSET_BYTES, safeFileName, sniffMatches } from "@/lib/validation/asset";
import { imageSize } from "@/lib/creative/image-size";
import { Readable } from "node:stream";

/**
 * Guarda en la Biblioteca un archivo producido en el servidor (p. ej. un video
 * montado con FFmpeg). Usa el cliente con la sesión del usuario: las mismas
 * políticas RLS y de Storage que una subida desde el navegador.
 */
export async function storeGeneratedAsset(
  supabase: SupabaseClient,
  input: {
    businessId: string;
    data: Buffer;
    mime: string;
    fileName: string;
    kind: "image" | "video";
    origin: "code_edited" | "ai_generated";
    title: string;
    description: string;
    tags: string[];
  },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const cfg = storageConfig();
  if (cfg.problem) return { ok: false, message: cfg.problem };
  if (input.data.length === 0 || input.data.length > MAX_ASSET_BYTES) return { ok: false, message: "El archivo generado supera 50 MB o está vacío." };
  if (!sniffMatches(input.mime, new Uint8Array(input.data.subarray(0, 64)))) return { ok: false, message: "El archivo generado no tiene el formato esperado." };
  const id = randomUUID();
  const path = storagePath(input.businessId, id, safeFileName(input.fileName));
  const { error } = await supabase.from("mkt_assets").insert({
    id,
    business_id: input.businessId,
    kind: input.kind,
    origin: input.origin,
    title: input.title.slice(0, 160),
    description: input.description.slice(0, 2000),
    tags: input.tags.slice(0, 30),
    storage_backend: cfg.backend,
    storage_path: path,
    original_name: safeFileName(input.fileName),
    mime_type: input.mime,
    size_bytes: input.data.length,
    upload_status: "pending",
  });
  if (error) return { ok: false, message: `No se pudo registrar el archivo: ${error.message}` };
  try {
    if (cfg.backend === "supabase") {
      const { error: upErr } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, input.data, { contentType: input.mime, upsert: false });
      if (upErr) throw new Error(upErr.message);
    } else {
      await writeLocalStream(path, Readable.toWeb(Readable.from(input.data)) as ReadableStream<Uint8Array>, MAX_ASSET_BYTES);
    }
  } catch (e) {
    await supabase.from("mkt_assets").delete().eq("id", id);
    return { ok: false, message: `No se pudo guardar el archivo: ${(e as Error).message}` };
  }
  const dims = input.mime.startsWith("image/") ? imageSize(new Uint8Array(input.data.subarray(0, 65536))) : null;
  const { error: readyErr } = await supabase.from("mkt_assets").update({ upload_status: "ready", ...(dims ?? {}) }).eq("id", id);
  if (readyErr) return { ok: false, message: readyErr.message };
  return { ok: true, id };
}

/** Descarga un recurso de la Biblioteca a un archivo temporal (para FFmpeg). */
export async function readAssetBytes(supabase: SupabaseClient, asset: { storage_backend: string; storage_path: string }): Promise<Buffer> {
  if (asset.storage_backend === "supabase") {
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(asset.storage_path);
    if (error || !data) throw new Error("No se pudo descargar el archivo de Supabase Storage.");
    return Buffer.from(await data.arrayBuffer());
  }
  const st = await statLocal(asset.storage_path);
  if (!st) throw new Error("El archivo ya no existe en el almacenamiento local.");
  const chunks: Buffer[] = [];
  for await (const c of openLocalStream(asset.storage_path)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}
