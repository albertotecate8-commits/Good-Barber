import Link from "next/link";
import clsx from "clsx";
import type { BusinessWithColor } from "@/lib/data/businesses";
import type { ContentItem } from "@/lib/data/types";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES, EDITABLE_STATUSES, FORMAT_LABELS } from "@/lib/content-labels";
import { PLATFORM_LABELS, SOCIAL_PLATFORMS } from "@/lib/validation/business";
import { BUSINESS_TZ, todayInTz, utcToZoned, weekdayIndex } from "@/lib/tz";
import { Badge, buttonClass } from "./ui";

export type CalendarView = "mes" | "semana" | "proximas";

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAYS_LONG = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function formatDayLong(date: string) {
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

export function formatMonthTitle(date: string) {
  const s = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${date.slice(0, 7)}-01T00:00:00Z`),
  );
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function groupByLocalDate(items: ContentItem[]) {
  const map = new Map<string, ContentItem[]>();
  for (const it of items) {
    if (!it.scheduled_at) continue;
    const d = utcToZoned(it.scheduled_at, BUSINESS_TZ).date;
    map.set(d, [...(map.get(d) ?? []), it]);
  }
  return map;
}

export function ContentChip({
  item,
  business,
  compact = false,
}: {
  item: ContentItem;
  business?: BusinessWithColor;
  compact?: boolean;
}) {
  const time = item.scheduled_at ? utcToZoned(item.scheduled_at).time : null;
  const label = item.title || item.caption.slice(0, 60) || FORMAT_LABELS[item.format as keyof typeof FORMAT_LABELS] || "Publicación";
  return (
    <Link
      href={`/calendario/${item.id}`}
      className={clsx(
        "block rounded-lg border border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3",
        compact ? "px-1.5 py-1 text-[11px]" : "px-3 py-2 text-sm",
      )}
      style={{ borderLeft: `3px solid ${business?.color ?? "var(--gold)"}` }}
      title={`${business?.name ?? ""} · ${PLATFORM_LABELS[item.platform]} · ${CONTENT_STATUS_LABELS[item.status]}`}
    >
      {compact ? (
        <span className="block truncate">
          {time && <span className="text-faint">{time} </span>}
          {label}
        </span>
      ) : (
        <span className="flex flex-col gap-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{label}</span>
            <Badge tone={CONTENT_STATUS_TONES[item.status]}>{CONTENT_STATUS_LABELS[item.status]}</Badge>
          </span>
          <span className="truncate text-xs text-muted">
            {time && `${time} · `}
            {business?.name} · {PLATFORM_LABELS[item.platform]} · {FORMAT_LABELS[item.format as keyof typeof FORMAT_LABELS] ?? item.format}
            {item.manual_posted_at && " · publicada a mano"}
          </span>
        </span>
      )}
    </Link>
  );
}

export function MonthView({
  weeks,
  month,
  byDate,
  businesses,
  newHref,
}: {
  weeks: string[][];
  month: string;
  byDate: Map<string, ContentItem[]>;
  businesses: Map<string, BusinessWithColor>;
  newHref: (date: string) => string;
}) {
  const today = todayInTz();
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line text-center text-xs text-faint">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((date) => {
          const items = byDate.get(date) ?? [];
          const inMonth = date.startsWith(month);
          return (
            <div
              key={date}
              className={clsx(
                "min-h-16 border-b border-r border-line p-1 last:border-r-0 sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-bg/60",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <Link
                  href={newHref(date)}
                  aria-label={`Nueva publicación el ${formatDayLong(date)}`}
                  className={clsx(
                    "grid size-7 place-items-center rounded-full text-xs",
                    date === today ? "bg-action font-semibold text-on-action" : inMonth ? "text-ink hover:bg-surface-3" : "text-faint",
                  )}
                >
                  {Number(date.slice(8))}
                </Link>
                {items.length > 0 && (
                  <span className="text-[10px] text-muted sm:hidden" aria-label={`${items.length} publicaciones`}>
                    {items.length}
                  </span>
                )}
              </div>
              <ul className="hidden flex-col gap-1 sm:flex">
                {items.slice(0, 3).map((it) => (
                  <li key={it.id}>
                    <ContentChip item={it} business={businesses.get(it.business_id)} compact />
                  </li>
                ))}
                {items.length > 3 && <li className="px-1 text-[11px] text-muted">+{items.length - 3} más</li>}
              </ul>
              {items.length > 0 && (
                <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                  {items.slice(0, 4).map((it) => (
                    <span key={it.id} className="size-1.5 rounded-full" style={{ background: businesses.get(it.business_id)?.color }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Lista agrupada por día (vista semanal, próximas y agenda móvil del mes). */
export function DayList({
  days,
  byDate,
  businesses,
  newHref,
  showEmptyDays = false,
}: {
  days: string[];
  byDate: Map<string, ContentItem[]>;
  businesses: Map<string, BusinessWithColor>;
  newHref?: (date: string) => string;
  showEmptyDays?: boolean;
}) {
  const today = todayInTz();
  const visible = showEmptyDays ? days : days.filter((d) => byDate.has(d));
  return (
    <ol className={clsx("grid grid-cols-1 gap-3", showEmptyDays && "md:grid-cols-7 md:gap-2")}>
      {visible.map((date) => {
        const items = byDate.get(date) ?? [];
        return (
          <li key={date} className={clsx("min-w-0 rounded-2xl border border-line bg-surface p-3", showEmptyDays && "md:min-h-48 md:p-2")}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className={clsx("text-sm font-medium first-letter:uppercase", date === today && "text-action-strong")}>
                <span className={showEmptyDays ? "md:hidden" : undefined}>{formatDayLong(date)}</span>
                {showEmptyDays && (
                  <span className="hidden md:inline">
                    {WEEKDAYS[weekdayIndex(date)]} {Number(date.slice(8))}
                  </span>
                )}
                {date === today && <span className="sr-only"> (hoy)</span>}
              </h3>
              {newHref && (
                <Link
                  href={newHref(date)}
                  className="rounded-lg px-2 py-1 text-xs text-action-strong hover:bg-surface-2"
                  aria-label={`Nueva publicación el ${WEEKDAYS_LONG[weekdayIndex(date)]} ${Number(date.slice(8))}`}
                >
                  + Nueva
                </Link>
              )}
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-faint">Sin publicaciones</p>
            ) : (
              <ul className="flex min-w-0 flex-col gap-2">
                {items.map((it) => (
                  <li key={it.id} className="min-w-0">
                    <ContentChip item={it} business={businesses.get(it.business_id)} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function CalendarFilters({
  view,
  fecha,
  businesses,
  values,
}: {
  view: CalendarView;
  fecha: string;
  businesses: BusinessWithColor[];
  values: { negocio?: string; plataforma?: string; estado?: string; hasta?: string };
}) {
  return (
    <form method="get" action="/calendario" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end" aria-label="Filtros del calendario">
      <input type="hidden" name="vista" value={view} />
      {view !== "proximas" && <input type="hidden" name="fecha" value={fecha} />}
      <label className="flex flex-col gap-1 text-xs text-muted">
        Negocio
        <select name="negocio" defaultValue={values.negocio ?? ""} className="input min-h-10 py-1.5 text-sm">
          <option value="">Todos</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Plataforma
        <select name="plataforma" defaultValue={values.plataforma ?? ""} className="input min-h-10 py-1.5 text-sm">
          <option value="">Todas</option>
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Estado
        <select name="estado" defaultValue={values.estado ?? ""} className="input min-h-10 py-1.5 text-sm">
          <option value="">Todos</option>
          {[...EDITABLE_STATUSES, "published", "error"].map((s) => (
            <option key={s} value={s}>
              {CONTENT_STATUS_LABELS[s as keyof typeof CONTENT_STATUS_LABELS]}
            </option>
          ))}
        </select>
      </label>
      {view === "proximas" && (
        <label className="flex flex-col gap-1 text-xs text-muted">
          Hasta
          <input type="date" name="hasta" defaultValue={values.hasta ?? ""} className="input min-h-10 py-1.5 text-sm" />
        </label>
      )}
      <div className="col-span-2 flex gap-2">
        <button type="submit" className={buttonClass("secondary", "min-h-10")}>
          Filtrar
        </button>
        <Link href={`/calendario?vista=${view}`} className={buttonClass("ghost", "min-h-10")}>
          Limpiar
        </Link>
      </div>
    </form>
  );
}
