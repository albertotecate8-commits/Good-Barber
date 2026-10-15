import { FileText, Film, ImageIcon, Music } from "lucide-react";
import clsx from "clsx";
import type { Asset } from "@/lib/data/types";

export function assetUrl(id: string, download = false) {
  return `/api/biblioteca/archivo/${id}${download ? "?descargar=1" : ""}`;
}

export function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Vista previa de un recurso. `large` muestra el reproductor de video. */
export function AssetPreview({
  asset,
  large = false,
  className,
}: {
  asset: Pick<Asset, "id" | "title" | "mime_type" | "kind">;
  large?: boolean;
  className?: string;
}) {
  const base = clsx("w-full overflow-hidden rounded-xl bg-surface-3", className);
  if (asset.mime_type.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada
      <img src={assetUrl(asset.id)} alt={asset.title} loading="lazy" className={clsx(base, "object-contain", large ? "max-h-[70vh]" : "aspect-square object-cover")} />
    );
  }
  if (asset.mime_type.startsWith("audio/") && large) {
    return <audio src={assetUrl(asset.id)} controls preload="metadata" className="w-full" aria-label={asset.title} />;
  }
  if (asset.mime_type.startsWith("video/") && large) {
    return <video src={assetUrl(asset.id)} controls preload="metadata" className={clsx(base, "max-h-[70vh]")} aria-label={asset.title} />;
  }
  const Icon = asset.mime_type.startsWith("audio/") ? Music : asset.mime_type.startsWith("video/") ? Film : asset.mime_type.startsWith("image/") ? ImageIcon : FileText;
  return (
    <div className={clsx(base, "grid place-items-center text-faint", large ? "aspect-video" : "aspect-square")} aria-hidden={!large}>
      <Icon className="size-10" />
    </div>
  );
}
