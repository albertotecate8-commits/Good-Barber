// Dónde se guardan los archivos de la Biblioteca.
//
//  * "supabase"  — Supabase Storage, bucket privado "mkt-assets" (plan gratuito,
//                  50 MB por archivo). Es el modo de producción.
//  * "local_dev" — disco del servidor de desarrollo. Solo para trabajar sin
//                  Storage configurado: los archivos NO están en la nube, y la
//                  app lo indica en pantalla. Está prohibido en Vercel, cuyo
//                  disco es efímero (los archivos se perderían).

export type StorageBackend = "supabase" | "local_dev";
export const SUPABASE_BUCKET = "mkt-assets";

export interface StorageConfig {
  backend: StorageBackend;
  /** Si existe, el almacenamiento no se puede usar y se explica por qué. */
  problem?: string;
  label: string;
}

export function storageConfig(env: Record<string, string | undefined> = process.env): StorageConfig {
  const raw = (env.MKT_STORAGE_BACKEND ?? "supabase").trim().toLowerCase();
  if (raw === "local") {
    if (env.VERCEL) {
      return {
        backend: "local_dev",
        label: "Almacenamiento local de desarrollo",
        problem:
          "MKT_STORAGE_BACKEND=local no funciona en Vercel (el disco es temporal y los archivos se perderían). Quita esa variable para usar Supabase Storage.",
      };
    }
    return { backend: "local_dev", label: "Almacenamiento local de desarrollo (este equipo, no la nube)" };
  }
  if (raw !== "supabase") {
    return { backend: "supabase", label: "Supabase Storage", problem: `MKT_STORAGE_BACKEND="${raw}" no es válido: usa "supabase" o "local".` };
  }
  return { backend: "supabase", label: `Supabase Storage (bucket privado «${SUPABASE_BUCKET}»)` };
}

export function storagePath(businessId: string, assetId: string, safeName: string) {
  return `${businessId}/${assetId}/${safeName}`;
}
