"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";
import { discardPendingAsset, finalizeAssetUpload, prepareAssetUpload } from "@/app/(app)/biblioteca/actions";
import type { AssetUploadInput } from "@/lib/validation/asset";

export type UploadResult = { ok: true; id: string } | { ok: false; message: string; errors?: Record<string, string> };

/**
 * Sube un archivo a la Biblioteca con el flujo de 3 pasos (preparar → subir →
 * verificar). Lo usan el cargador, el editor al exportar y la importación de
 * resultados de herramientas externas.
 */
export async function uploadToLibrary(file: Blob, meta: Omit<AssetUploadInput, "size" | "mime_type"> & { mime_type?: string }): Promise<UploadResult> {
  const mime = meta.mime_type ?? file.type;
  const prep = await prepareAssetUpload({ ...meta, mime_type: mime, size: file.size }).catch(() => ({
    ok: false as const,
    message: "No se pudo contactar al servidor.",
  }));
  if (!prep.ok) return { ok: false, message: prep.message, errors: "errors" in prep ? prep.errors : undefined };
  try {
    if (prep.backend === "supabase") {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.storage.from(prep.bucket).upload(prep.path, file, { contentType: mime, upsert: false });
      if (error) {
        await discardPendingAsset(prep.id);
        const notConfigured = /bucket not found|not found/i.test(error.message);
        throw new Error(
          notConfigured
            ? "Supabase Storage no está configurado (falta el bucket «mkt-assets»). Ejecuta la migración de la Biblioteca en tu proyecto."
            : `Supabase Storage rechazó el archivo: ${error.message}`,
        );
      }
      const fin = await finalizeAssetUpload(prep.id);
      if (!fin.ok) throw new Error(fin.message ?? "No se pudo verificar el archivo.");
    } else {
      const res = await fetch(`/api/biblioteca/local/${prep.id}`, { method: "PUT", body: file, headers: { "Content-Type": "application/octet-stream" } });
      const body = await res.json().catch(() => ({ ok: false, message: "Respuesta inválida del servidor." }));
      if (!res.ok || !body.ok) throw new Error(body.message ?? "No se pudo subir el archivo.");
    }
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
  return { ok: true, id: prep.id };
}
