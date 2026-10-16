import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { metaConfig } from "@/lib/meta/config";
import {
  DAILY_GROUP_LIMIT,
  POSTING_MODE_LABELS,
  TASK_STATUS_LABELS,
  activityLast24h,
  nextTask,
  progress,
  shareUrl,
  type PostingMode,
  type QueueTask,
  type TaskStatus,
} from "@/lib/distribution/core";
import { Badge, Card, CardTitle, Notice } from "@/components/ui";
import { ConfirmButton } from "@/components/business-forms";
import { CopyTextButton } from "@/components/content-extras";
import { AssetPreview, assetUrl } from "@/components/asset-preview";
import { ExternalLink, OpenInFacebook, TaskActionForm } from "@/components/distribution";
import { setDistributionStatus, updateTask } from "../actions";
import type { Asset } from "@/lib/data/types";

export const metadata = { title: "Cola de distribución" };

const TONE: Record<TaskStatus, "neutral" | "action" | "warn" | "positive" | "danger" | "gold"> = {
  pending: "neutral",
  opened: "action",
  awaiting_approval: "gold",
  confirmed: "positive",
  skipped: "neutral",
  failed: "danger",
  cancelled: "neutral",
};

export default async function DistributionPanel({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data: dist } = await supabase.from("mkt_distributions").select("*").eq("id", id).maybeSingle();
  if (!dist) notFound();
  const [{ data: item }, { data: biz }, { data: tasks }, { data: recent }] = await Promise.all([
    supabase.from("mkt_content_items").select("id, title, caption, hashtags, asset_id, external_post_url, manual_post_url").eq("id", dist.content_id).maybeSingle(),
    supabase.from("mkt_businesses").select("name, slug").eq("id", dist.business_id).maybeSingle(),
    supabase.from("mkt_distribution_tasks").select("*, group:mkt_fb_groups(id, name, url, posting_mode, page_can_participate, requires_approval, rules)").eq("distribution_id", id).order("position"),
    supabase.from("mkt_distribution_tasks").select("id, status, position, opened_at, confirmed_at").eq("business_id", dist.business_id).in("status", ["opened", "awaiting_approval", "confirmed"]),
  ]);
  const { data: asset } = item?.asset_id ? await supabase.from("mkt_assets").select("*").eq("id", item.asset_id).maybeSingle() : { data: null };
  type Row = QueueTask & { group: { id: string; name: string; url: string; posting_mode: PostingMode; page_can_participate: string; requires_approval: boolean; rules: string }; post_text: string; group_post_url: string | null; note: string; updated_at: string };
  const rows = (tasks ?? []) as Row[];
  const p = progress(rows);
  const next = dist.status === "active" ? nextTask(rows) : null;
  const usedToday = activityLast24h((recent ?? []) as QueueTask[]);
  const cfg = metaConfig();
  const share = shareUrl(dist.source_url, cfg.appId || null, cfg.redirectUri ? cfg.redirectUri.replace("/api/meta/retorno", `/distribucion/${id}`) : null);

  return (
    <>
      <div className="mb-5">
        <Link href={`/distribucion?negocio=${biz?.slug ?? ""}`} className="text-sm text-muted hover:text-ink">
          ← Distribución a grupos
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Cola de distribución</h1>
        <p className="text-sm text-muted">
          {biz?.name} · {item?.title || "Publicación"} ·{" "}
          {dist.status === "active" ? "Activa" : dist.status === "paused" ? "Pausada" : dist.status === "completed" ? "Terminada" : "Cancelada"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle>Progreso</CardTitle>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
              {[
                ["Pendientes", p.pending],
                ["En aprobación del grupo", p.awaitingApproval],
                ["Confirmados", p.confirmed],
                ["Con error", p.failed],
                ["Omitidos o cancelados", p.skipped],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="text-xl font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              {dist.status === "active" && (
                <ConfirmButton action={setDistributionStatus.bind(null, id, "paused")} confirmText="¿Pausar la distribución?" variant="secondary">
                  Pausar
                </ConfirmButton>
              )}
              {dist.status === "paused" && (
                <ConfirmButton action={setDistributionStatus.bind(null, id, "active")} confirmText="¿Continuar la distribución?" variant="secondary">
                  Continuar
                </ConfirmButton>
              )}
              {(dist.status === "active" || dist.status === "paused") && (
                <ConfirmButton action={setDistributionStatus.bind(null, id, "cancelled")} confirmText="¿Cancelar las tareas pendientes? Lo ya confirmado se conserva." variant="ghost">
                  Cancelar pendientes
                </ConfirmButton>
              )}
            </div>
          </Card>

          {next ? (
            <Card>
              <CardTitle>Siguiente grupo: {next.group.name}</CardTitle>
              <div className="flex flex-col gap-3 text-sm">
                <p className="text-muted">
                  {POSTING_MODE_LABELS[next.group.posting_mode]}
                  {next.group.page_can_participate === "yes" && " · la página puede participar: en Facebook elige publicar como la página"}
                  {next.group.page_can_participate === "no" && " · este grupo solo admite perfiles personales"}
                  {next.group.requires_approval && " · los administradores aprueban cada publicación"}
                </p>
                {next.group.rules && <Notice tone="warn" title="Reglas del grupo">{next.group.rules}</Notice>}
                {usedToday >= DAILY_GROUP_LIMIT && next.status === "pending" && (
                  <Notice tone="warn">
                    Ya distribuiste a {DAILY_GROUP_LIMIT} grupos en las últimas 24 h. Continúa mañana para no saturar a las comunidades.
                  </Notice>
                )}
                <div>
                  <p className="mb-1 text-xs font-medium text-muted">Texto para este grupo</p>
                  <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{next.post_text}</pre>
                  <div className="mt-2">
                    <CopyTextButton text={next.post_text} />
                  </div>
                </div>
                <ol className="flex flex-col gap-2">
                  {next.group.posting_mode === "share_page_post" ? (
                    <>
                      <li>
                        <OpenInFacebook taskId={next.id} href={share} label="1. Compartir la publicación original (diálogo de Facebook)" />
                        <p className="mt-1 text-xs text-faint">En el diálogo elige «Compartir en un grupo» → {next.group.name}, pega el texto y publica.</p>
                      </li>
                      <li className="flex flex-wrap gap-2">
                        <ExternalLink href={dist.source_url}>Abrir la publicación original</ExternalLink>
                        <ExternalLink href={next.group.url}>Abrir el grupo</ExternalLink>
                      </li>
                    </>
                  ) : (
                    <>
                      <li>
                        <OpenInFacebook taskId={next.id} href={next.group.url} label="1. Abrir el grupo en Facebook" />
                        <p className="mt-1 text-xs text-faint">El grupo pide una publicación nueva: pega el texto y adjunta la imagen descargada.</p>
                      </li>
                      {asset && (
                        <li>
                          <a href={assetUrl(asset.id, true)} className="text-action-strong hover:underline">
                            Descargar la imagen o el video
                          </a>
                        </li>
                      )}
                    </>
                  )}
                </ol>
                <div className="grid gap-2 sm:grid-cols-2">
                  <TaskActionForm action={updateTask.bind(null, next.id, "confirm")} label="2. Confirmar: ya se publicó" variant="primary" withUrl />
                  <TaskActionForm action={updateTask.bind(null, next.id, "awaiting")} label="Quedó pendiente de aprobación" />
                  <TaskActionForm action={updateTask.bind(null, next.id, "skip")} label="Omitir este grupo" variant="ghost" />
                  <TaskActionForm action={updateTask.bind(null, next.id, "fail")} label="Marcar error" variant="ghost" withNote />
                </div>
              </div>
            </Card>
          ) : (
            <Notice tone={dist.status === "active" ? "positive" : "warn"}>
              {dist.status === "active" ? "No quedan grupos pendientes en esta cola." : "La distribución no está activa."}
            </Notice>
          )}

          <Card>
            <CardTitle>Historial por grupo</CardTitle>
            <ul className="divide-y divide-line text-sm">
              {rows.map((t) => (
                <li key={t.id} className="flex flex-col gap-1 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.group.name}</span>
                    <Badge tone={TONE[t.status]}>{TASK_STATUS_LABELS[t.status]}</Badge>
                  </div>
                  <p className="text-xs text-faint">
                    {t.opened_at && `Abierto: ${formatDateTime(t.opened_at)} · `}
                    {t.confirmed_at && `Confirmado por ti: ${formatDateTime(t.confirmed_at)} · `}
                    Actualizado: {formatDateTime(t.updated_at)}
                  </p>
                  {t.group_post_url && (
                    <a href={t.group_post_url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-action-strong hover:underline">
                      {t.group_post_url}
                    </a>
                  )}
                  {t.note && <p className="text-xs text-danger">{t.note}</p>}
                  {t.status !== "pending" && t.status !== "confirmed" && dist.status !== "cancelled" && (
                    <TaskActionForm action={updateTask.bind(null, t.id, "reset")} label="Volver a pendiente" variant="ghost" />
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Publicación original</CardTitle>
            <a href={dist.source_url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-action-strong hover:underline">
              {dist.source_url}
            </a>
            {asset && (
              <div className="mt-3">
                <AssetPreview asset={asset as Asset} />
              </div>
            )}
            {item?.caption && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{item.caption}</p>}
          </Card>
          <Notice tone="gold" title="Qué hace la app y qué haces tú">
            La app prepara cada grupo, abre el diálogo oficial de Facebook y lleva el registro. Elegir el grupo y publicar
            ocurre dentro de Facebook (Meta no ofrece API para grupos desde abril de 2024). Facebook decide si puedes
            compartir como la página según la configuración del grupo.
          </Notice>
        </div>
      </div>
    </>
  );
}
