import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Megaphone, Search, Sparkles, TrendingUp } from "lucide-react";
import { getDashboard } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { PROVIDERS, runtimeStatus, type RuntimeStatus } from "@/lib/providers/registry";
import { MONTHLY_BUDGET_MXN } from "@/lib/providers/budget";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { formatDateTime } from "@/lib/dates";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES } from "@/lib/content-labels";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ConnectionBadge } from "@/components/connection-badge";
import { LoadInitialButton } from "@/components/load-initial-button";

export const metadata = { title: "Inicio" };

const CAMPAIGN_LABELS: Record<string, string> = {
  idea: "Idea",
  research: "Investigando",
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobada",
  active: "Activa",
};

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cargados?: string }> }) {
  const [user, { cargados }] = await Promise.all([requireUser(), searchParams]);
  const data = await getDashboard();

  const providerSummary = PROVIDERS.reduce(
    (acc, p) => {
      acc[runtimeStatus(p)]++;
      return acc;
    },
    { ready_untested: 0, missing_config: 0, assisted: 0, blocked: 0, pending_build: 0 } as Record<RuntimeStatus, number>,
  );
  const connectionAlerts = data.socials.filter((s) => s.connection_status !== "connected");
  const realAlerts = data.socials.filter((s) => s.connection_status === "expired" || s.connection_status === "error");

  return (
    <>
      <PageHeader
        eyebrow="Panel general"
        title="Inicio"
        description="Todos tus negocios en un solo lugar. Lo que todavía no está conectado se indica tal cual."
        actions={
          <>
            <ButtonLink href="/crear">
              <Sparkles className="size-4" aria-hidden /> Crear con IA
            </ButtonLink>
            <ButtonLink href="/investigacion" variant="secondary">
              <Search className="size-4" aria-hidden /> Investigar mercado
            </ButtonLink>
          </>
        }
      />

      {cargados === "1" && (
        <div className="mb-6" role="status">
          <Notice tone="positive" title="Negocios cargados">
            Se crearon tus negocios con los datos conocidos. Completa lo pendiente de cada uno (ciudad, público, servicios
            y precios de Glamour Studio y AFORE PRO) desde su apartado.
          </Notice>
        </div>
      )}

      {(realAlerts.length > 0 || data.failedContent > 0) && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-danger">
            <AlertTriangle className="size-4" aria-hidden /> Requiere atención
          </p>
          <ul className="mt-1 list-inside list-disc text-muted">
            {realAlerts.map((s) => (
              <li key={s.id}>
                {s.business_name}: {PLATFORM_LABELS[s.platform]} — reconecta la cuenta.
              </li>
            ))}
            {data.failedContent > 0 && <li>{data.failedContent} publicación(es) con error.</li>}
          </ul>
        </div>
      )}

      {/* Negocios */}
      <section aria-labelledby="h-negocios" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="h-negocios" className="text-base font-semibold">
            Tus negocios
          </h2>
          {data.businesses.length > 0 && (
            <Link href="/negocios" className="text-sm text-action-strong hover:underline">
              Administrar
            </Link>
          )}
        </div>
        {data.businesses.length === 0 ? (
          <EmptyState
            title="Todavía no hay negocios"
            action={
              user.isAdmin ? (
                <div className="flex flex-col items-center gap-3">
                  <LoadInitialButton />
                  <ButtonLink href="/negocios/nuevo" variant="ghost">
                    O crear otro negocio
                  </ButtonLink>
                </div>
              ) : undefined
            }
          >
            {user.isAdmin
              ? "Carga tus tres negocios con los datos que ya conocemos (precios de Good Barber, Instagram, página de Facebook existente). Lo que falte lo completas después."
              : "Tu cuenta aún no tiene acceso a ningún negocio. Pide al administrador que te agregue."}
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.businesses.map((b) => {
              const c = data.counts[b.id];
              return (
                <li key={b.id}>
                  <Link
                    href={`/negocios/${b.slug}`}
                    className="group block h-full overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong"
                  >
                    <div className="h-1.5" style={{ background: b.brand?.color_primary ?? "var(--gold)" }} aria-hidden />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{b.name}</p>
                          <p className="truncate text-sm text-muted">{b.sector || "Sector sin definir"}</p>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </div>
                      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                        {[
                          ["Servicios", c.offerings],
                          ["Perfiles", c.socials],
                          ["Campañas", c.campaigns],
                          ["Próximas", c.upcoming],
                        ].map(([label, n]) => (
                          <div key={label} className="rounded-lg bg-surface-2 px-1 py-2">
                            <dd className="text-lg font-semibold">{n}</dd>
                            <dt className="text-[11px] text-faint">{label}</dt>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="h-proximas">
          <CardTitle action={<CalendarDays className="size-4 text-faint" aria-hidden />}>
            <span id="h-proximas">Próximas publicaciones</span>
          </CardTitle>
          {data.upcoming.length === 0 ? (
            <EmptyState title="No hay publicaciones próximas" action={<ButtonLink href="/calendario/nueva" variant="secondary">Planear una</ButtonLink>}>
              Organízalas en el calendario. Programar no publica automáticamente en redes.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.upcoming.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/calendario/${c.id}`} className="block truncate font-medium hover:text-action-strong">
                      {c.title || c.caption.slice(0, 60) || "Sin título"}
                    </Link>
                    <p className="text-xs text-muted">
                      {c.business_name} · {PLATFORM_LABELS[c.platform]} · {formatDateTime(c.scheduled_at)}
                    </p>
                  </div>
                  <Badge tone={CONTENT_STATUS_TONES[c.status]}>{CONTENT_STATUS_LABELS[c.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="h-campanas">
          <CardTitle action={<Megaphone className="size-4 text-faint" aria-hidden />}>
            <span id="h-campanas">Campañas en preparación</span>
          </CardTitle>
          {data.campaignsInProgress.length === 0 ? (
            <EmptyState title="Sin campañas todavía">
              El Director de Marketing con IA creará campañas a partir de investigación real (Etapa 3).
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.campaignsInProgress.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.name}</p>
                    <p className="text-xs text-muted">{c.business_name}</p>
                  </div>
                  <Badge tone="action">{CAMPAIGN_LABELS[c.status] ?? c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card aria-labelledby="h-resultados">
          <CardTitle action={<TrendingUp className="size-4 text-faint" aria-hidden />}>
            <span id="h-resultados">Resultados disponibles</span>
          </CardTitle>
          <EmptyState title="Aún no hay resultados medidos">
            No se muestran cifras inventadas. Habrá datos cuando conectes Meta (estadísticas oficiales) o registres
            manualmente citas y ventas.
          </EmptyState>
        </Card>

        <Card aria-labelledby="h-conexiones">
          <CardTitle>
            <span id="h-conexiones">Conexiones de redes sociales</span>
          </CardTitle>
          {connectionAlerts.length === 0 && data.socials.length === 0 ? (
            <EmptyState title="Sin perfiles registrados">Agrega los perfiles de cada negocio en su apartado.</EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.socials.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {PLATFORM_LABELS[s.platform]} {s.handle && <span className="text-muted">· {s.platform === "instagram" ? "@" : ""}{s.handle}</span>}
                      </p>
                      <p className="text-xs text-muted">{s.business_name}</p>
                    </div>
                    <ConnectionBadge status={s.connection_status} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-faint">
                «Registrado» significa que el perfil está anotado, no que la app pueda publicar. «Conectado» solo aparece
                cuando autorizas la app en el diálogo oficial de Meta (Negocio → Redes sociales).
              </p>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4" aria-labelledby="h-servicios">
        <CardTitle
          action={
            <Link href="/configuracion" className="text-sm text-action-strong hover:underline">
              Ver detalle
            </Link>
          }
        >
          <span id="h-servicios">Servicios de IA e integraciones</span>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Badge tone="positive">Presupuesto adicional: ${MONTHLY_BUDGET_MXN} MXN</Badge>
          <Badge tone="action">{providerSummary.ready_untested} listos sin probar</Badge>
          <Badge tone="warn">{providerSummary.missing_config} por configurar</Badge>
          <Badge tone="gold">{providerSummary.assisted} con flujo asistido</Badge>
          <Badge tone="danger">{providerSummary.blocked} bloqueados por costo</Badge>
          <Badge>{providerSummary.pending_build} en construcción</Badge>
        </div>
        <p className="mt-3 text-xs text-faint">
          Créditos disponibles: los proveedores gratuitos no exponen el saldo por API; los límites se consultan en cada
          plataforma. La app se impone topes diarios propios para no rebasarlos.
        </p>
      </Card>
    </>
  );
}
