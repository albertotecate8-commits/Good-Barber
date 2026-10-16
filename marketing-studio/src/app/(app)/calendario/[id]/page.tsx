import Link from "next/link";
import { Download } from "lucide-react";
import { getContentDetail } from "@/lib/data/content";
import { listBusinesses } from "@/lib/data/businesses";
import { listAssetOptions } from "@/lib/data/assets";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { composePostText } from "@/lib/validation/content";
import { publishReadiness } from "@/lib/meta/service";
import { AutoPublishForm } from "@/components/auto-publish-form";
import { approveAutoPublish, revokeAutoPublish } from "../publish-actions";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { POSTING_MODE_LABELS, type PostingMode } from "@/lib/distribution/core";
import { DistributeForm } from "@/components/distribution";
import { planGroups } from "../../distribucion/actions";
import { ContentForm } from "@/components/content-form";
import { ConfirmButton } from "@/components/business-forms";
import { AssetPreview, assetUrl } from "@/components/asset-preview";
import { CopyTextButton, ManualPostForm } from "@/components/content-extras";
import { Badge, Card, CardTitle, Notice, buttonClass } from "@/components/ui";
import {
  clearManuallyPosted,
  deleteContent,
  duplicateContent,
  markManuallyPosted,
  updateContent,
} from "../actions";

export const metadata = { title: "Publicación" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string; duplicado?: string }> };

export default async function ContentPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [{ item, asset, socials, attempts }, businesses, assets] = await Promise.all([
    getContentDetail(id),
    listBusinesses(),
    listAssetOptions(),
  ]);
  const business = businesses.find((b) => b.id === item.business_id);
  const readiness = await publishReadiness(item.business_id, item.platform);
  const destination = readiness.accountName ? `la página «${readiness.accountName}»` : PLATFORM_LABELS[item.platform];
  const isPage = item.platform === "facebook_page";
  const sourceUrl = item.external_post_url ?? item.manual_post_url;
  const supabase = await createClient();
  const [{ data: groups }, { data: distributions }] = isPage
    ? await Promise.all([
        supabase.from("mkt_fb_groups").select("id, name, posting_mode, page_can_participate").eq("business_id", item.business_id).eq("active", true).order("name"),
        supabase.from("mkt_distributions").select("id, status, created_at").eq("content_id", item.id).order("created_at", { ascending: false }).limit(1),
      ])
    : [{ data: [] }, { data: [] }];
  const distribution = distributions?.[0] ?? null;
  void socials;
  const text = composePostText(item.caption, item.hashtags);

  return (
    <>
      <Link href="/calendario" className="text-sm text-muted hover:text-ink">
        ← Calendario
      </Link>
      <header className="mb-5 mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-gold">
            {business?.name} · {PLATFORM_LABELS[item.platform]}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{item.title || "Publicación sin título"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge tone={CONTENT_STATUS_TONES[item.status]}>{CONTENT_STATUS_LABELS[item.status]}</Badge>
            {item.scheduled_at ? formatDateTime(item.scheduled_at) : "Sin fecha"}
            {item.manual_posted_at && <Badge tone="positive">Publicada a mano (declarado por ti)</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          <ConfirmButton action={duplicateContent.bind(null, item.id)} confirmText="¿Crear una copia como borrador, sin fecha?" variant="secondary">
            Duplicar
          </ConfirmButton>
          <ConfirmButton action={deleteContent.bind(null, item.id)} confirmText="¿Eliminar esta publicación? No se puede deshacer.">
            Eliminar
          </ConfirmButton>
        </div>
      </header>

      {(sp.guardado === "1" || sp.duplicado === "1") && (
        <div className="mb-4" role="status">
          <Notice tone="positive">{sp.duplicado === "1" ? "Copia creada como borrador." : "Publicación guardada."}</Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardTitle>Editar</CardTitle>
          <ContentForm
            action={updateContent.bind(null, item.id)}
            businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
            assets={assets}
            item={item}
            submitLabel="Guardar cambios"
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Cómo se publica</CardTitle>
            {item.publish_mode === "api" && item.approved_at ? (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  <Badge tone="positive">Aprobada para publicación automática</Badge>
                </p>
                <p className="text-muted">
                  Aprobada el {formatDateTime(item.approved_at)}. Se publicará en {destination} el{" "}
                  {formatDateTime(item.scheduled_at)} por la API oficial de Meta. Si editas algo, la aprobación se cancela sola.
                </p>
                {!readiness.publishingOn && (
                  <Notice tone="warn">La publicación automática está APAGADA en el servidor: no saldrá hasta que la actives.</Notice>
                )}
                {item.publish_attempts > 0 && <p className="text-xs text-warn">Intentos fallidos: {item.publish_attempts} de 3.</p>}
                <ConfirmButton action={revokeAutoPublish.bind(null, item.id)} confirmText="¿Cancelar la publicación automática? Quedará como publicación manual." variant="secondary">
                  Cancelar publicación automática
                </ConfirmButton>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-sm">
                <p>
                  <Badge tone="gold">Publicación manual</Badge>
                </p>
                <p className="text-muted">
                  {readiness.ready
                    ? "La cuenta está conectada con permisos de publicación. Puedes aprobar que salga sola a la hora programada."
                    : readiness.reason}
                </p>
                <p className="text-xs text-faint">
                  Aunque esté «Programada», la app no enviará nada a {PLATFORM_LABELS[item.platform]} sin tu aprobación.
                </p>
                {readiness.ready && item.status !== "published" && (
                  <AutoPublishForm action={approveAutoPublish.bind(null, item.id)} when={formatDateTime(item.scheduled_at)} platform={destination} />
                )}
                <CopyTextButton text={text} />
                {asset && (
                  <a href={assetUrl(asset.id, true)} className={buttonClass("secondary")}>
                    <Download className="size-4" aria-hidden /> Descargar recurso
                  </a>
                )}
              </div>
            )}
          </Card>

          {isPage && (
            <Card>
              <CardTitle>Enlace y distribución a grupos</CardTitle>
              <div className="flex flex-col gap-3 text-sm">
                {item.external_post_url ? (
                  <p>
                    <a href={item.external_post_url} target="_blank" rel="noopener noreferrer" className="break-all text-action-strong hover:underline">
                      Ver publicación en Facebook
                    </a>
                    <span className="block text-xs text-faint">Enlace devuelto por Meta al publicar.</span>
                  </p>
                ) : item.external_post_id ? (
                  <p className="text-xs text-warn">Meta confirmó la publicación ({item.external_post_id}), pero no devolvió el enlace.</p>
                ) : null}
                {sourceUrl ? (
                  <>
                    {distribution && (
                      <Link href={`/distribucion/${distribution.id}`} className={buttonClass("secondary")}>
                        Ver cola de distribución
                      </Link>
                    )}
                    <Link href={`/distribucion/nueva?contenido=${item.id}`} className={buttonClass("primary")}>
                      Distribuir a grupos
                    </Link>
                  </>
                ) : (groups ?? []).length === 0 ? (
                  <p className="text-muted">
                    No hay grupos activos para este negocio. <Link href="/distribucion" className="text-action-strong hover:underline">Agrégalos en Distribución a grupos</Link>.
                  </p>
                ) : (
                  <>
                    <p className="text-muted">
                      Elige desde ahora los grupos: al publicarse en la página se creará la cola solo con estos grupos. Compartir en cada grupo
                      lo confirmas tú dentro de Facebook.
                    </p>
                    <DistributeForm
                      action={planGroups.bind(null, item.id)}
                      groups={(groups ?? []).map((g) => ({
                        id: g.id,
                        name: g.name,
                        mode: `${POSTING_MODE_LABELS[g.posting_mode as PostingMode]}${g.page_can_participate === "no" ? " · solo perfiles" : ""}`,
                        blockedReason: null,
                        lastActivity: null,
                      }))}
                      preselected={item.planned_group_ids ?? []}
                      submitLabel="Guardar grupos planeados"
                      pendingLabel="Guardando…"
                    />
                  </>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle>Recurso creativo</CardTitle>
            {asset ? (
              <Link href={`/biblioteca/${asset.id}`} className="block">
                <AssetPreview asset={asset} />
                <p className="mt-2 truncate text-sm">{asset.title}</p>
              </Link>
            ) : (
              <p className="text-sm text-muted">Sin recurso. Elige uno de la Biblioteca en el formulario.</p>
            )}
          </Card>

          <Card>
            <CardTitle>Registro manual</CardTitle>
            {item.manual_posted_at ? (
              <div className="flex flex-col gap-2 text-sm">
                <p>Marcada como publicada por ti el {formatDateTime(item.manual_posted_at)}.</p>
                {item.manual_post_url && (
                  <a href={item.manual_post_url} target="_blank" rel="noopener noreferrer" className="break-all text-action-strong hover:underline">
                    {item.manual_post_url}
                  </a>
                )}
                <p className="text-xs text-faint">Es una declaración tuya, no una confirmación de la plataforma.</p>
                <ConfirmButton action={clearManuallyPosted.bind(null, item.id)} confirmText="¿Quitar el registro de publicación manual?" variant="ghost">
                  Deshacer registro
                </ConfirmButton>
              </div>
            ) : (
              <>
                <p className="mb-3 text-sm text-muted">
                  Cuando la publiques tú en la red, regístralo aquí para llevar el control. No cambia el estado a
                  «Publicado».
                </p>
                <ManualPostForm action={markManuallyPosted.bind(null, item.id)} />
              </>
            )}
          </Card>

          <Card>
            <CardTitle>Intentos de publicación automática</CardTitle>
            {attempts.length === 0 ? (
              <p className="text-sm text-muted">Ninguno.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {attempts.map((a) => (
                  <li key={a.id} className="py-2">
                    <Badge tone={a.outcome === "success" ? "positive" : a.outcome === "error" ? "danger" : "neutral"}>{a.outcome}</Badge>{" "}
                    <span className="text-xs text-faint">{formatDateTime(a.attempted_at)}</span>
                    {a.error && <p className="text-xs text-danger">{a.error}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
