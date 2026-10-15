import Link from "next/link";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { listScheduledContent, listUnscheduledContent } from "@/lib/data/content";
import { EDITABLE_STATUSES } from "@/lib/content-labels";
import { SOCIAL_PLATFORMS } from "@/lib/validation/business";
import {
  addDays,
  addMonths,
  isValidDateString,
  monthGrid,
  startOfWeek,
  todayInTz,
  utcRangeForDays,
} from "@/lib/tz";
import { ButtonLink, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";
import {
  CalendarFilters,
  ContentChip,
  DayList,
  MonthView,
  formatDayLong,
  formatMonthTitle,
  groupByLocalDate,
  type CalendarView,
} from "@/components/calendar";

export const metadata = { title: "Calendario" };

type SP = {
  vista?: string;
  fecha?: string;
  negocio?: string;
  plataforma?: string;
  estado?: string;
  hasta?: string;
  eliminado?: string;
};

const VIEWS: [CalendarView, string][] = [
  ["mes", "Mes"],
  ["semana", "Semana"],
  ["proximas", "Próximas"],
];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view: CalendarView = VIEWS.some(([v]) => v === sp.vista) ? (sp.vista as CalendarView) : "mes";
  const today = todayInTz();
  const fecha = sp.fecha && isValidDateString(sp.fecha) ? sp.fecha : today;

  const businesses = await listBusinessesWithColor();
  const bizMap = new Map(businesses.map((b) => [b.id, b]));
  const selectedBiz = businesses.find((b) => b.slug === sp.negocio);
  const platform = SOCIAL_PLATFORMS.find((p) => p === sp.plataforma);
  const status = [...EDITABLE_STATUSES, "published", "error"].find((s) => s === sp.estado);
  const hasta = sp.hasta && isValidDateString(sp.hasta) ? sp.hasta : undefined;
  const filters = { businessId: selectedBiz?.id, platform, status };

  // Rango de días locales (Ciudad de México) que muestra cada vista.
  let days: string[];
  let weeks: string[][] = [];
  let rangeStart: string;
  let rangeEnd: string;
  if (view === "mes") {
    weeks = monthGrid(fecha);
    days = weeks.flat();
    ({ start: rangeStart, end: rangeEnd } = utcRangeForDays(days[0], addDays(days[days.length - 1], 1)));
  } else if (view === "semana") {
    const monday = startOfWeek(fecha);
    days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    ({ start: rangeStart, end: rangeEnd } = utcRangeForDays(days[0], addDays(days[6], 1)));
  } else {
    rangeStart = new Date().toISOString();
    const until = hasta && hasta >= today ? hasta : addDays(today, 59);
    rangeEnd = utcRangeForDays(today, addDays(until, 1)).end;
    days = [];
    for (let d = today; d <= until; d = addDays(d, 1)) days.push(d);
  }

  const [items, unscheduled] = await Promise.all([
    listScheduledContent({ ...filters, from: rangeStart, to: rangeEnd }),
    view === "proximas" ? Promise.resolve([]) : listUnscheduledContent(filters),
  ]);
  const byDate = groupByLocalDate(items);

  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { vista: view, fecha, negocio: sp.negocio, plataforma: platform, estado: status, hasta, ...extra };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/calendario?${p.toString()}`;
  };
  const newHref = (date: string) =>
    `/calendario/nueva?fecha=${date}${selectedBiz ? `&negocio=${selectedBiz.slug}` : ""}`;

  const prev = view === "mes" ? addMonths(fecha, -1) : addDays(fecha, -7);
  const next = view === "mes" ? addMonths(fecha, 1) : addDays(fecha, 7);
  const title =
    view === "mes"
      ? formatMonthTitle(fecha)
      : view === "semana"
        ? `Semana del ${formatDayLong(days[0])}`
        : "Próximas publicaciones";

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Planea las publicaciones de cada negocio. Horario de Ciudad de México."
        actions={
          businesses.length > 0 && (
            <ButtonLink href={newHref(view === "proximas" ? today : fecha)}>
              <Plus className="size-4" aria-hidden /> Nueva publicación
            </ButtonLink>
          )
        }
      />

      <Notice tone="gold" title="Programar no es publicar">
        Programar una fecha aquí <strong>no</strong> publica nada en Facebook ni en Instagram: todavía no hay ninguna
        integración oficial conectada. En la fecha indicada tú publicas manualmente (descarga el recurso y copia el texto
        desde la publicación).
      </Notice>

      {sp.eliminado === "1" && (
        <div className="mt-4" role="status">
          <Notice tone="positive">Publicación eliminada.</Notice>
        </div>
      )}

      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Primero agrega tus negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>}>
            Cada publicación pertenece a un negocio.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav aria-label="Vista del calendario" className="inline-flex rounded-xl border border-line bg-surface p-1">
                {VIEWS.map(([v, label]) => (
                  <Link
                    key={v}
                    href={keep({ vista: v })}
                    aria-current={view === v ? "page" : undefined}
                    className={clsx(
                      "flex min-h-9 items-center rounded-lg px-3 text-sm",
                      view === v ? "bg-action-soft font-medium text-ink" : "text-muted hover:text-ink",
                    )}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              {view !== "proximas" && (
                <div className="flex items-center gap-1">
                  <Link href={keep({ fecha: prev })} className={buttonClass("ghost", "min-h-9 px-2")} aria-label="Anterior">
                    <ChevronLeft className="size-5" aria-hidden />
                  </Link>
                  <Link href={keep({ fecha: today })} className={buttonClass("secondary", "min-h-9 px-3")}>
                    Hoy
                  </Link>
                  <Link href={keep({ fecha: next })} className={buttonClass("ghost", "min-h-9 px-2")} aria-label="Siguiente">
                    <ChevronRight className="size-5" aria-hidden />
                  </Link>
                </div>
              )}
            </div>
            <CalendarFilters
              view={view}
              fecha={fecha}
              businesses={businesses}
              values={{ negocio: selectedBiz?.slug, plataforma: platform, estado: status, hasta }}
            />
          </div>

          <h2 className="mb-3 mt-6 text-lg font-semibold first-letter:uppercase">{title}</h2>

          {view === "mes" && (
            <>
              <MonthView weeks={weeks} month={fecha.slice(0, 7)} byDate={byDate} businesses={bizMap} newHref={newHref} />
              <section aria-label="Agenda del mes" className="mt-4 sm:hidden">
                {items.length === 0 ? (
                  <p className="text-sm text-muted">Sin publicaciones con fecha este mes.</p>
                ) : (
                  <DayList days={days.filter((d) => d.startsWith(fecha.slice(0, 7)))} byDate={byDate} businesses={bizMap} />
                )}
              </section>
            </>
          )}

          {view === "semana" && <DayList days={days} byDate={byDate} businesses={bizMap} newHref={newHref} showEmptyDays />}

          {view === "proximas" &&
            (items.length === 0 ? (
              <EmptyState
                title="No hay publicaciones próximas"
                action={<ButtonLink href={newHref(today)}>Crear publicación</ButtonLink>}
              >
                Con los filtros actuales no hay nada programado en este periodo.
              </EmptyState>
            ) : (
              <DayList days={days} byDate={byDate} businesses={bizMap} />
            ))}

          {view !== "proximas" && (
            <section aria-labelledby="h-sin-fecha" className="mt-6">
              <h2 id="h-sin-fecha" className="mb-2 text-base font-semibold">
                Borradores sin fecha
              </h2>
              {unscheduled.length === 0 ? (
                <p className="text-sm text-muted">No hay publicaciones sin fecha.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {unscheduled.map((it) => (
                    <li key={it.id}>
                      <ContentChip item={it} business={bizMap.get(it.business_id)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
