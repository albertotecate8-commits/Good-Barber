import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storageConfig } from "@/lib/storage/config";
import { removeLocal, writeLocalStream } from "@/lib/storage/local";
import { MAX_ASSET_BYTES, sniffMatches } from "@/lib/validation/asset";

// Subida al almacenamiento LOCAL de desarrollo. Excluida del proxy (que
// trunca cuerpos de más de 10 MB), por eso verifica aquí la sesión.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fail = (status: number, message: string) => NextResponse.json({ ok: false, message }, { status });

  const cfg = storageConfig();
  if (cfg.backend !== "local_dev" || cfg.problem) return fail(400, cfg.problem ?? "El almacenamiento local no está activo.");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail(400, "Identificador inválido.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Tu sesión expiró. Vuelve a iniciar sesión.");

  // RLS: solo devuelve el registro si es de un negocio al que tienes acceso.
  const { data: asset } = await supabase
    .from("mkt_assets")
    .select("id,business_id,storage_backend,storage_path,mime_type,size_bytes,upload_status")
    .eq("id", id)
    .maybeSingle();
  if (!asset || asset.storage_backend !== "local_dev" || asset.upload_status !== "pending")
    return fail(404, "Subida no encontrada.");
  const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: asset.business_id });
  if (!canWrite) return fail(403, "No tienes permiso para subir archivos a este negocio.");
  if (!request.body) return fail(400, "No se recibió ningún archivo.");

  const discard = async () => {
    await removeLocal(asset.storage_path).catch(() => {});
    await supabase.from("mkt_assets").delete().eq("id", id).eq("upload_status", "pending");
  };

  let written: { size: number; head: Uint8Array };
  try {
    written = await writeLocalStream(asset.storage_path, request.body, MAX_ASSET_BYTES);
  } catch (e) {
    await discard();
    return fail(413, (e as Error).message);
  }
  if (asset.size_bytes && written.size !== asset.size_bytes) {
    await discard();
    return fail(400, "El archivo llegó incompleto. Inténtalo de nuevo.");
  }
  if (!sniffMatches(asset.mime_type, written.head)) {
    await discard();
    return fail(415, "El contenido del archivo no corresponde a su tipo.");
  }
  const { error } = await supabase
    .from("mkt_assets")
    .update({ upload_status: "ready", size_bytes: written.size })
    .eq("id", id);
  if (error) {
    await discard();
    return fail(500, "No se pudo registrar el archivo.");
  }
  return NextResponse.json({ ok: true });
}
