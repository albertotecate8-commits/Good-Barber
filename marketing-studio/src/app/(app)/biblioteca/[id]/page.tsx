import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { getAssetDetail } from "@/lib/data/assets";
import { listBusinesses } from "@/lib/data/businesses";
import { ASSET_KIND_LABELS, CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { formatDate, formatDateTime } from "@/lib/dates";
import { AssetPreview, assetUrl, formatBytes } from "@/components/asset-preview";
import { AssetMetaForm } from "@/components/asset-meta-form";
import { ConfirmButton } from "@/components/business-forms";
import { Badge, Card, CardTitle, buttonClass } from "@/components/ui";
import { deleteAsset, updateAssetMeta } from "../actions";

export const metadata = { title: "Recurso" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ asset, usage }, businesses] = await Promise.all([getAssetDetail(id), listBusinesses()]);
  const business = businesses.find((b) => b.id === asset.business_id);

  return (
    <>
      <Link href="/biblioteca" className="text-sm text-muted hover:text-ink">
        ← Biblioteca
      </Link>
      <header className="mb-5 mt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gold">
          {business?.name} · {ASSET_KIND_LABELS[asset.kind]}
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{asset.title}</h1>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <AssetPreview asset={asset} large />
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={assetUrl(asset.id, true)} className={buttonClass("primary")}>
              <Download className="size-4" aria-hidden /> Descargar
            </a>
            <a href={assetUrl(asset.id)} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
              <ExternalLink className="size-4" aria-hidden /> Abrir
            </a>
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Archivo</dt>
            <dd className="break-all">{asset.original_name}</dd>
            <dt className="text-muted">Formato</dt>
            <dd>{asset.mime_type}</dd>
            <dt className="text-muted">Tamaño</dt>
            <dd>{formatBytes(asset.size_bytes)}</dd>
            <dt className="text-muted">Fecha</dt>
            <dd>{asset.asset_date ? formatDate(asset.asset_date) : "—"}</dd>
            <dt className="text-muted">Subido</dt>
            <dd>{formatDateTime(asset.created_at)}</dd>
            <dt className="text-muted">Almacenamiento</dt>
            <dd>{asset.storage_backend === "supabase" ? "Supabase Storage (privado)" : "Local de desarrollo (este equipo)"}</dd>
          </dl>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Datos y organización</CardTitle>
            <AssetMetaForm action={updateAssetMeta.bind(null, asset.id)} asset={asset} />
          </Card>

          <Card>
            <CardTitle>Usado en publicaciones</CardTitle>
            {usage.length === 0 ? (
              <p className="text-sm text-muted">Todavía no se usa en el calendario.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {usage.map((u) => (
                  <li key={u.id}>
                    <Link href={`/calendario/${u.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-action-strong">
                      <span className="min-w-0 truncate">
                        {u.title || u.caption.slice(0, 50) || "Sin título"}
                        <span className="block text-xs text-muted">
                          {PLATFORM_LABELS[u.platform]} · {u.scheduled_at ? formatDateTime(u.scheduled_at) : "Sin fecha"}
                        </span>
                      </span>
                      <Badge tone={CONTENT_STATUS_TONES[u.status]}>{CONTENT_STATUS_LABELS[u.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Eliminar</CardTitle>
            <p className="mb-3 text-sm text-muted">
              Se borra el archivo y su registro.{usage.length > 0 && ` ${usage.length} publicación(es) quedarán sin recurso.`}
            </p>
            <ConfirmButton action={deleteAsset.bind(null, asset.id)} confirmText={`¿Eliminar «${asset.title}» definitivamente?`}>
              Eliminar recurso
            </ConfirmButton>
          </Card>
        </div>
      </div>
    </>
  );
}
