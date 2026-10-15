import Link from "next/link";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { listAssets } from "@/lib/data/assets";
import { ASSET_KINDS, ASSET_KIND_LABELS } from "@/lib/content-labels";
import { storageConfig } from "@/lib/storage/config";
import { AssetPreview, formatBytes } from "@/components/asset-preview";
import { AssetUploader } from "@/components/asset-uploader";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Biblioteca" };

type SP = { negocio?: string; tipo?: string; etiqueta?: string; q?: string; eliminado?: string; archivo_huerfano?: string };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const selected = businesses.find((b) => b.slug === sp.negocio);
  const kind = ASSET_KINDS.find((k) => k === sp.tipo);
  const tag = sp.etiqueta?.trim().slice(0, 40) || undefined;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const assets = await listAssets({ businessId: selected?.id, kind, tag, q });
  const bizMap = new Map(businesses.map((b) => [b.id, b]));
  const cfg = storageConfig();
  const filtered = Boolean(selected || kind || tag || q);

  return (
    <>
      <PageHeader title="Biblioteca" description="Imágenes, videos, logotipos y documentos de cada negocio, separados entre sí." />

      {cfg.backend === "local_dev" && !cfg.problem ? (
        <Notice tone="warn" title="Almacenamiento local de desarrollo">
          Los archivos se guardan en el disco de este equipo, <strong>no</strong> en la nube. Sirve para probar; en
          producción se usa Supabase Storage (privado, plan gratuito).
        </Notice>
      ) : cfg.problem ? (
        <Notice tone="danger" title="Almacenamiento no disponible">
          {cfg.problem}
        </Notice>
      ) : (
        <p className="text-xs text-faint">Almacenamiento: {cfg.label}. Archivos privados; solo los ven los miembros de cada negocio.</p>
      )}

      {sp.eliminado === "1" && (
        <div className="mt-4" role="status">
          <Notice tone={sp.archivo_huerfano ? "warn" : "positive"}>
            Recurso eliminado.{sp.archivo_huerfano && " El registro se borró, pero el archivo no pudo eliminarse del almacenamiento."}
          </Notice>
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Primero agrega tus negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
        </div>
      ) : (
        <>
          <Card className="mt-4">
            <CardTitle>Subir archivo</CardTitle>
            <AssetUploader
              businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
              defaultBusinessId={selected?.id}
              disabledReason={cfg.problem}
            />
          </Card>

          <form method="get" className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" aria-label="Filtros de la biblioteca">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted sm:min-w-56">
              Buscar
              <input name="q" defaultValue={q} className="input min-h-10 py-1.5 text-sm" placeholder="Título, descripción o archivo" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Negocio
              <select name="negocio" defaultValue={selected?.slug ?? ""} className="input min-h-10 py-1.5 text-sm">
                <option value="">Todos</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Tipo
              <select name="tipo" defaultValue={kind ?? ""} className="input min-h-10 py-1.5 text-sm">
                <option value="">Todos</option>
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ASSET_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Etiqueta
              <input name="etiqueta" defaultValue={tag} className="input min-h-10 py-1.5 text-sm" />
            </label>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className={buttonClass("secondary", "min-h-10")}>
                Filtrar
              </button>
              <Link href="/biblioteca" className={buttonClass("ghost", "min-h-10")}>
                Limpiar
              </Link>
            </div>
          </form>

          <h2 className="mb-3 mt-6 text-base font-semibold">
            {assets.length} recurso{assets.length === 1 ? "" : "s"}
            {filtered && " con estos filtros"}
          </h2>
          {assets.length === 0 ? (
            <EmptyState title={filtered ? "Nada coincide con los filtros" : "La biblioteca está vacía"}>
              {filtered ? "Prueba con otros filtros." : "Sube logotipos, fotos reales del negocio y diseños para usarlos en el calendario."}
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((a) => {
                const b = bizMap.get(a.business_id);
                return (
                  <li key={a.id}>
                    <Link
                      href={`/biblioteca/${a.id}`}
                      className="block h-full overflow-hidden rounded-2xl border border-line bg-surface p-2 hover:border-line-strong"
                    >
                      <AssetPreview asset={a} />
                      <div className="px-1 pb-1 pt-2">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-muted">
                          <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: b?.color }} aria-hidden />
                          {b?.name} · {ASSET_KIND_LABELS[a.kind]} · {formatBytes(a.size_bytes)}
                        </p>
                        {a.origin === "ai_generated" && (
                          <div className="mt-1.5">
                            <Badge tone="action">Generado con IA</Badge>
                          </div>
                        )}
                        {a.tags.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {a.tags.slice(0, 3).map((t) => (
                              <Badge key={t}>{t}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
