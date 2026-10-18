import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileEdit,
  Megaphone,
  Send,
  Share2,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
  Wand2,
} from "lucide-react";
import { getDashboard } from "@/lib/data/businesses";
import { getHomeData } from "@/lib/data/home";
import { getActiveBusiness } from "@/lib/data/shell";
import { requireUser } from "@/lib/data/session";
import { PROVIDERS, runtimeStatus, type RuntimeStatus } from "@/lib/providers/registry";
import { MONTHLY_BUDGET_MXN } from "@/lib/providers/budget";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { BUSINESS_TZ } from "@/lib/tz";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES, FORMAT_LABELS } from "@/lib/content-labels";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, Notice, QuickAction, StatCard } from "@/components/ui";
import { ConnectionBadge } from "@/components/connection-badge";
import { LoadInitialButton } from "@/components/load-initial-button";

export const metadata = { title: "Resumen" };

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: BUSINESS_TZ }).format(now));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cargados?: string }> }) {
  const [user, { cargados }, data, { active }] = await Promise.all([requireUser(), searchParams, getDashboard(), getActiveBusiness()]);
  const home = active ? await getHomeData(active.id) : null;
  const activeBiz = active ? data.businesses.find((b) => b.id === active.id) : undefined;

  const providerSummary = PROVIDERS.reduce(
    (acc, p) => {
      acc[runtimeStatus(p)]++;
      return acc;
    },
    { ready_untested: 0, missing_config: 0, assisted: 0, blocked: 0, pending_build: 0 } as Record<RuntimeStatus, number>,
  );
  const realAlerts = data.socials.filter((s) => s.connection_status === "expired" || s.connection_status === "error");
  const activeSocials = active ? data.socials.filter((s) => s.business_id === active.id) : data.socials;

  // Tareas pendientes, cada una con un botón para continuar (solo lo que existe de verdad).
  const tasks: { key: string; icon: typeof FileEdit; text: string; href: string; cta: string }[] = [];
  if (home && active) {
    for (const d of home.drafts)
      tasks.push({ key: d.id, icon: FileEdit, text: `Borrador: ${d.title || d.caption.slice(0, 50) || "sin título"}`, href: `/calendario/${d.id}`, cta: "Continuar" });
    if (home.inReview) tasks.push({ key: "review", icon: ClipboardCheck, text: `${home.inReview} publicación(es) esperan tu revisión`, href: `/calendario?negocio=${active.slug}&estado=review`, cta: "Revisar" });
    if (home.pendingDistribution) tasks.push({ key: "dist", icon: Share2, text: `${home.pendingDistribution} grupo(s) pendientes de compartir`, href: `/distribucion?negocio=${active.slug}`, cta: "Distribuir" });
    if (!home.offeringsWithPrice) tasks.push({ key: "prices", icon: Tag, text: "Registra servicios con precio: los anuncios usan solo precios reales", href: `/negocios/${active.slug}?tab=servicios`, cta: "Agregar precios" });
    if (!activeSocials.length) tasks.push({ key: "socials", icon: Send, text: "Registra las redes sociales del negocio para saber dónde publicar", href: `/negocios/${active.slug}?tab=redes`, cta: "Agregar redes" });
  }

  return (
    <>
      <h1 className="sr-only">Resumen</h1>

      {cargados === "1" && (
        <div className="mb-5" role="status">
          <Notice tone="positive" title="Negocios cargados">
            Se crearon tus negocios con los datos conocidos. Completa lo pendiente de cada uno (ciudad, público, servicios
            y precios de Glamour Studio y AFORE PRO) desde su apartado.
          </Notice>
        </div>
      )}

      {(realAlerts.length > 0 || data.failedContent > 0) && (
        <div className="mb-5 rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-semibold text-danger">
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

      {/* Bienvenida con la acción principal */}
      <section aria-labelledby="h-bienvenida" className="relative mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-nav-2 to-nav p-5 text-nav-text shadow-float sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-[#3cc3be]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-24 size-56 rounded-full bg-[#7c8cff]/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-nav-muted">{greeting()}</p>
            <h2 id="h-bienvenida" className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">
              {active ? (
                <>
                  ¿Qué preparamos hoy para{" "}
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className="size-3 rounded-full ring-2 ring-white/40" style={{ background: active.color }} />
                    {active.name}
                  </span>
                  ?
                </>
              ) : (
                "Empecemos por tus negocios"
              )}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-nav-muted">
              {active ? "Crea un anuncio en unos pasos: eliges objetivo y oferta, revisas la vista previa y lo programas." : "Carga tus negocios para crear anuncios con sus precios y su identidad."}
            </p>
          </div>
          {active && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href="/anuncio/nuevo" className="pressable inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-[#0a4f53] shadow-raised hover:bg-[#e8fbfa]">
                <Sparkles className="size-4" aria-hidden /> Crear anuncio
              </Link>
              <Link href="/calendario" className="pressable inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white/10 px-4 text-sm font-semibold text-nav-text ring-1 ring-white/20 hover:bg-white/15">
                <CalendarDays className="size-4" aria-hidden /> Calendario
              </Link>
            </div>
          )}
        </div>
      </section>

      {data.businesses.length === 0 ? (
        <section aria-labelledby="h-negocios" className="mb-6">
          <h2 id="h-negocios" className="sr-only">
            Tus negocios
          </h2>
          <EmptyState
            icon={Users}
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
        </section>
      ) : (
        home &&
        active && (
          <>
            {/* Métricas reales del negocio activo */}
            <section aria-labelledby="h-metricas" className="mb-6">
              <h2 id="h-metricas" className="sr-only">
                Resumen de {active.name}
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Publicados" value={home.published} icon={CheckCircle2} tone="teal" hint="Confirmados en la plataforma" href={`/calendario?negocio=${active.slug}&estado=published`} />
                <StatCard label="Campañas activas" value={home.activeCampaigns} icon={Megaphone} tone="sky" href="/campanas" />
                <StatCard label="Por revisar" value={home.inReview} icon={ClipboardCheck} tone="sand" hint="Esperan tu aprobación" href={`/calendario?negocio=${active.slug}&estado=review`} />
                <StatCard label="Próximas" value={home.upcoming.length} icon={CalendarClock} tone="violet" hint="Programadas a futuro" href={`/calendario?negocio=${active.slug}`} />
              </div>
            </section>

            {/* Acciones rápidas */}
            <section aria-labelledby="h-acciones" className="mb-6">
              <h2 id="h-acciones" className="mb-3 text-base font-semibold">
                Acciones rápidas
              </h2>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <QuickAction href="/anuncio/nuevo" icon={Sparkles} label="Crear anuncio" description="Paso a paso, con vista previa" />
                <QuickAction href={`/negocios/${active.slug}?tab=promociones`} icon={Tag} label="Crear promoción" description="Oferta con vigencia y condiciones" />
                <QuickAction href="/crear" icon={Wand2} label="Preparar campaña" description="Estrategia, anuncios y calendario" />
                <QuickAction href="/calendario/nueva" icon={CalendarDays} label="Programar publicación" description="Elige fecha, red y texto" />
                <QuickAction href={`/distribucion?negocio=${active.slug}`} icon={Share2} label="Distribuir a grupos" description="Comparte tu publicación con un clic" />
                <QuickAction href="/analiticas" icon={TrendingUp} label="Ver resultados" description="Prospectos, citas y ventas reales" />
              </div>
            </section>

            <div className="mb-6 grid gap-4 lg:grid-cols-2">
              <Card aria-labelledby="h-pendientes">
                <CardTitle>
                  <span id="h-pendientes">Pendientes</span>
                </CardTitle>
                {tasks.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="No hay nada pendiente" action={<ButtonLink href="/anuncio/nuevo">Crear un anuncio</ButtonLink>}>
                    Cuando guardes borradores o haya publicaciones por revisar aparecerán aquí.
                  </EmptyState>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {tasks.map(({ key, icon: Icon, text, href, cta }) => (
                      <li key={key} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-2.5">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface text-action-strong shadow-soft">
                          <Icon className="size-4" />
                        </span>
                        <p className="min-w-0 flex-1 basis-40 text-sm">{text}</p>
                        <ButtonLink href={href} variant="secondary" className="w-full shrink-0 px-3 sm:w-auto">
                          {cta}
                        </ButtonLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card aria-labelledby="h-proximas">
                <CardTitle action={<CalendarDays className="size-4 text-faint" aria-hidden />}>
                  <span id="h-proximas">Próximas publicaciones</span>
                </CardTitle>
                {home.upcoming.length === 0 ? (
                  <EmptyState icon={CalendarClock} title="No hay publicaciones próximas" action={<ButtonLink href="/anuncio/nuevo" variant="secondary">Preparar una</ButtonLink>}>
                    Programar no publica automáticamente: cada publicación automática requiere tu aprobación.
                  </EmptyState>
                ) : (
                  <ul className="divide-y divide-line">
                    {home.upcoming.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <Link href={`/calendario/${c.id}`} className="block truncate font-medium hover:text-action-strong">
                            {c.title || c.caption.slice(0, 60) || "Sin título"}
                          </Link>
                          <p className="text-xs text-muted">
                            {PLATFORM_LABELS[c.platform]} · {FORMAT_LABELS[c.format as keyof typeof FORMAT_LABELS] ?? c.format} · {formatDateTime(c.scheduled_at)}
                          </p>
                        </div>
                        <Badge tone={CONTENT_STATUS_TONES[c.status]}>{CONTENT_STATUS_LABELS[c.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card className="mb-6" aria-labelledby="h-resultados">
              <CardTitle
                action={
                  <Link href="/analiticas" className="text-sm font-medium text-action-strong hover:underline">
                    Ver analíticas
                  </Link>
                }
              >
                <span id="h-resultados">Resultados de {active.name}</span>
              </CardTitle>
              {home.leads ? (
                <dl className="grid grid-cols-3 gap-3 text-center">
                  {[
                    ["Prospectos registrados", String(home.leads.total), Users],
                    ["Clientes", String(home.leads.customers), CheckCircle2],
                    ["Ventas registradas", formatCents(home.leads.revenueCents), BadgeDollarSign],
                  ].map(([label, value, Icon]) => {
                    const I = Icon as typeof Users;
                    return (
                      <div key={label as string} className="rounded-xl bg-surface-2 p-3">
                        <I className="mx-auto mb-1 size-4 text-action-strong" aria-hidden />
                        <dd className="text-lg font-semibold tabular-nums">{value as string}</dd>
                        <dt className="text-xs text-muted">{label as string}</dt>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <EmptyState icon={TrendingUp} title="Aún no hay resultados medidos" action={<ButtonLink href="/mensajes" variant="secondary">Registrar un prospecto</ButtonLink>}>
                  No se muestran cifras inventadas. Habrá datos cuando registres prospectos, citas o ventas, o cuando conectes
                  las estadísticas oficiales de Meta.
                </EmptyState>
              )}
            </Card>
          </>
        )
      )}

      {/* Negocios */}
      {data.businesses.length > 0 && (
        <section aria-labelledby="h-negocios" className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="h-negocios" className="text-base font-semibold">
              Tus negocios
            </h2>
            <Link href="/negocios" className="text-sm font-medium text-action-strong hover:underline">
              Administrar
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.businesses.map((b) => {
              const c = data.counts[b.id];
              const isActiveBiz = b.id === activeBiz?.id;
              return (
                <li key={b.id}>
                  <Link
                    href={`/negocios/${b.slug}`}
                    className="pressable surface-raised group block h-full overflow-hidden rounded-2xl border border-line/70 hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <div className="h-1.5" style={{ background: b.brand?.color_primary ?? "var(--gold)" }} aria-hidden />
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{b.name}</p>
                          <p className="truncate text-sm text-muted">{b.sector || "Sector sin definir"}</p>
                        </div>
                        {isActiveBiz ? <Badge tone="action">Activo</Badge> : <ArrowRight className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />}
                      </div>
                      <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                        {[
                          ["Servicios", c.offerings],
                          ["Perfiles", c.socials],
                          ["Campañas", c.campaigns],
                          ["Próximas", c.upcoming],
                        ].map(([label, n]) => (
                          <div key={label} className="rounded-xl bg-surface-2 px-1 py-2">
                            <dd className="text-lg font-semibold">{n}</dd>
                            <dt className="text-[11px] text-muted">{label}</dt>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card aria-labelledby="h-conexiones">
          <CardTitle>
            <span id="h-conexiones">Redes sociales y conexiones</span>
          </CardTitle>
          {data.socials.length === 0 ? (
            <EmptyState icon={Send} title="Sin perfiles registrados">
              Agrega los perfiles de cada negocio en su apartado.
            </EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {data.socials.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {PLATFORM_LABELS[s.platform]}{" "}
                        {s.handle && (
                          <span className="text-muted">
                            · {s.platform === "instagram" ? "@" : ""}
                            {s.handle}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{s.business_name}</p>
                    </div>
                    <ConnectionBadge status={s.connection_status} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                «Registrado» significa que el perfil está anotado, no que la app pueda publicar. «Conectado» solo aparece
                cuando autorizas la app en el diálogo oficial de Meta (Negocio → Redes sociales).
              </p>
            </>
          )}
        </Card>

        <Card aria-labelledby="h-servicios">
          <CardTitle
            action={
              <Link href="/configuracion" className="text-sm font-medium text-action-strong hover:underline">
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
          <p className="mt-3 text-xs text-muted">
            Los proveedores gratuitos no exponen el saldo por API; la app se impone topes diarios propios para no rebasarlos.
          </p>
        </Card>
      </div>
    </>
  );
}
