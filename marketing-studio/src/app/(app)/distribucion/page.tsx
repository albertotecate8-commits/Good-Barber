import Link from "next/link";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { POSTING_MODE_LABELS, progress, type PostingMode, type TaskStatus } from "@/lib/distribution/core";
import { Badge, Card, CardTitle, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/business-forms";
import { GroupForm } from "@/components/distribution";
import { createGroup, setGroupActive, updateGroup } from "./actions";

export const metadata = { title: "Distribución a grupos" };

const PARTICIPATION = { unknown: "Sin comprobar si la página puede participar", yes: "La página puede participar", no: "Solo perfiles personales" } as const;

export default async function DistributionHome({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const business = businesses.find((b) => b.slug === sp.negocio) ?? businesses[0];
  const supabase = await createClient();
  const [groups, dists, tasks, ready] = business
    ? await Promise.all([
        supabase.from("mkt_fb_groups").select("*").eq("business_id", business.id).order("active", { ascending: false }).order("name"),
        supabase.from("mkt_distributions").select("id, content_id, status, created_at, source_url").eq("business_id", business.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("mkt_distribution_tasks").select("id, distribution_id, group_id, status, confirmed_at, opened_at").eq("business_id", business.id),
        supabase
          .from("mkt_content_items")
          .select("id, title, external_post_url, manual_post_url, published_at, manual_posted_at")
          .eq("business_id", business.id)
          .eq("platform", "facebook_page")
          .order("updated_at", { ascending: false })
          .limit(200),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const allTasks = (tasks.data ?? []) as { id: string; distribution_id: string; group_id: string; status: TaskStatus; confirmed_at: string | null; opened_at: string | null }[];
  const lastByGroup = new Map<string, string>();
  for (const t of allTasks) {
    const at = t.confirmed_at ?? (t.status === "awaiting_approval" ? t.opened_at : null);
    if (at && (!lastByGroup.has(t.group_id) || at > lastByGroup.get(t.group_id)!)) lastByGroup.set(t.group_id, at);
  }
  const titles = new Map((ready.data ?? []).map((c) => [c.id, c.title]));
  const readyItems = (ready.data ?? []).filter((c) => c.external_post_url || c.manual_post_url).slice(0, 20);

  return (
    <>
      <PageHeader title="Distribución a grupos" description="Grupos de Facebook por negocio y colas para compartir tus publicaciones." />
      <div className="mb-4">
        <Notice tone="gold" title="Cómo funciona (y por qué hay un clic final tuyo)">
          Meta retiró la API de grupos en abril de 2024: ninguna app puede publicar sola en un grupo. La app publica en tu
          página por la API oficial, guarda el enlace y prepara cada grupo: abre el diálogo oficial de Facebook para
          compartir, tú eliges el grupo y confirmas allí, y luego lo marcas aquí. Nada se marca «confirmado» sin tu
          confirmación.
        </Notice>
      </div>
      {!business ? (
        <EmptyState title="Aún no hay negocios" />
      ) : (
        <>
          <nav aria-label="Negocio" className="mb-4 flex flex-wrap gap-2">
            {businesses.map((b) => (
              <Link
                key={b.id}
                href={`/distribucion?negocio=${b.slug}`}
                aria-current={b.id === business.id ? "page" : undefined}
                className="rounded-full border border-line px-3 py-1.5 text-sm aria-[current=page]:border-action aria-[current=page]:font-medium"
              >
                {b.name}
              </Link>
            ))}
          </nav>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="flex min-w-0 flex-col gap-4">
              <Card>
                <CardTitle>Publicaciones listas para distribuir</CardTitle>
                {readyItems.length === 0 ? (
                  <EmptyState title="Ninguna todavía">Cuando una publicación de la página tenga su enlace (publicada por la app o registrada a mano), aparece aquí.</EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {readyItems.map((c) => (
                      <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0 text-sm">
                          <p className="truncate font-medium">{c.title || "Publicación"}</p>
                          <p className="text-xs text-muted">{c.external_post_url ? "Publicada por la app (enlace de Meta)" : "Registrada a mano por ti"}</p>
                        </div>
                        <Link href={`/distribucion/nueva?contenido=${c.id}`} className={buttonClass("primary")}>
                          Distribuir a grupos
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card>
                <CardTitle>Colas de distribución</CardTitle>
                {(dists.data ?? []).length === 0 ? (
                  <EmptyState title="Sin colas" />
                ) : (
                  <ul className="divide-y divide-line">
                    {(dists.data ?? []).map((d) => {
                      const p = progress(allTasks.filter((t) => t.distribution_id === d.id));
                      return (
                        <li key={d.id} className="py-3">
                          <Link href={`/distribucion/${d.id}`} className="flex flex-col gap-1 hover:underline">
                            <span className="text-sm font-medium">{titles.get(d.content_id) || "Publicación"}</span>
                            <span className="text-xs text-muted">
                              {d.status === "active" ? "Activa" : d.status === "paused" ? "Pausada" : d.status === "completed" ? "Terminada" : "Cancelada"} · {p.confirmed} confirmados ·{" "}
                              {p.pending} pendientes · {p.awaitingApproval} en aprobación · {p.failed} con error · {formatDateTime(d.created_at)}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card>
                <CardTitle>Grupos de {business.name}</CardTitle>
                {(groups.data ?? []).length === 0 ? (
                  <EmptyState title="Sin grupos registrados">Agrega los grupos donde tienes permiso para compartir.</EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {(groups.data ?? []).map((g) => {
                      const pending = allTasks.filter((t) => t.group_id === g.id && (t.status === "pending" || t.status === "opened")).length;
                      return (
                        <li key={g.id} className="py-3">
                          <details>
                            <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">{g.name}</span>
                              <Badge tone={g.active ? "positive" : "neutral"}>{g.active ? "Activo" : "Desactivado"}</Badge>
                              {pending > 0 && <Badge tone="action">{pending} pendiente(s)</Badge>}
                            </summary>
                            <div className="mt-2 flex flex-col gap-2 text-xs text-muted">
                              <p>
                                {POSTING_MODE_LABELS[g.posting_mode as PostingMode]} · {PARTICIPATION[g.page_can_participate as keyof typeof PARTICIPATION]}
                                {g.page_checked_at ? ` (${formatDateTime(g.page_checked_at)})` : ""} · pausa de {g.min_days_between} días
                                {g.requires_approval ? " · requiere aprobación" : ""}
                              </p>
                              <p>Última distribución: {lastByGroup.get(g.id) ? formatDateTime(lastByGroup.get(g.id)!) : "ninguna"}</p>
                              {g.rules && <p>Reglas: {g.rules}</p>}
                              <a href={g.url} target="_blank" rel="noopener noreferrer" className="break-all text-action-strong hover:underline">
                                {g.url}
                              </a>
                              <GroupForm action={updateGroup.bind(null, g.id)} idPrefix={g.id.replace(/-/g, "")} submitLabel="Guardar cambios" values={g} />
                              <ConfirmButton
                                action={setGroupActive.bind(null, g.id, !g.active)}
                                confirmText={g.active ? "¿Desactivar este grupo? No se podrá elegir en nuevas colas." : "¿Activar este grupo?"}
                                variant="ghost"
                              >
                                {g.active ? "Desactivar" : "Activar"}
                              </ConfirmButton>
                            </div>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
            <Card>
              <CardTitle>Agregar grupo</CardTitle>
              <p className="mb-3 text-xs text-muted">
                Registra solo grupos donde tienes permiso para compartir. La app no solicita acceso administrativo a grupos
                ajenos ni intenta eludir sus reglas.
              </p>
              <GroupForm action={createGroup.bind(null, business.id)} idPrefix="nuevo" submitLabel="Agregar grupo" />
            </Card>
          </div>
        </>
      )}
    </>
  );
}
