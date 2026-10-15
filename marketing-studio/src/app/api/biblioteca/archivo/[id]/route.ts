import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_BUCKET, storageConfig } from "@/lib/storage/config";
import { openLocalStream, statLocal } from "@/lib/storage/local";

function contentDisposition(kind: "inline" | "attachment", name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// Entrega un archivo de la Biblioteca. El acceso lo decide RLS: si el usuario
// no es miembro del negocio, el registro "no existe" (404).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const download = request.nextUrl.searchParams.get("descargar") === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Sesión requerida", { status: 401 });

  const { data: asset } = await supabase
    .from("mkt_assets")
    .select("storage_backend,storage_path,mime_type,original_name,upload_status")
    .eq("id", id)
    .maybeSingle();
  if (!asset || asset.upload_status !== "ready") return new NextResponse("No encontrado", { status: 404 });

  if (asset.storage_backend === "supabase") {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(asset.storage_path, 300, download ? { download: asset.original_name } : undefined);
    if (error || !data) return new NextResponse("No se pudo obtener el archivo de Supabase Storage.", { status: 502 });
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "private, no-store" } });
  }

  const cfg = storageConfig();
  if (cfg.backend !== "local_dev" || cfg.problem)
    return new NextResponse("Este archivo está en el almacenamiento local de desarrollo, que no está activo aquí.", { status: 410 });
  const stat = await statLocal(asset.storage_path);
  if (!stat) return new NextResponse("El archivo ya no existe en el almacenamiento local.", { status: 410 });

  const stream = Readable.toWeb(openLocalStream(asset.storage_path)) as ReadableStream<Uint8Array>;
  return new NextResponse(stream, {
    headers: {
      "Content-Type": asset.mime_type,
      "Content-Length": String(stat.size),
      "Content-Disposition": contentDisposition(download ? "attachment" : "inline", asset.original_name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Un SVG malicioso no puede ejecutar scripts aunque se abra directamente.
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
