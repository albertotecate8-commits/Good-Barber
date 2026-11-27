import type { BusinessHoursRow } from "./types";
import { formatClock, localParts, timeToMinutes } from "./time";

/** Orden de la semana en la interfaz: lunes primero. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

export type ScheduleStatus =
  /** No hay horario registrado para hoy. */
  | { kind: "unknown"; confirmed: boolean }
  | { kind: "open"; confirmed: boolean; closesAt: string }
  | { kind: "before_open"; confirmed: boolean; opensAt: string }
  | { kind: "after_close"; confirmed: boolean }
  | { kind: "closed_today"; confirmed: boolean };

/**
 * Estado del horario comercial en un instante, en la zona del sitio.
 * Base para clasificar eventos "fuera de horario" (Etapa 6).
 */
export function scheduleStatus(
  hours: BusinessHoursRow[],
  confirmed: boolean,
  now: Date,
  timeZone: string,
): ScheduleStatus {
  const p = localParts(now, timeZone);
  const today = hours.find((h) => h.weekday === p.weekday);
  if (!today) return { kind: "unknown", confirmed };
  if (today.is_closed || !today.opens_at || !today.closes_at) return { kind: "closed_today", confirmed };
  const nowMin = p.hour * 60 + p.minute;
  const open = timeToMinutes(today.opens_at);
  const close = timeToMinutes(today.closes_at);
  if (nowMin < open) return { kind: "before_open", confirmed, opensAt: today.opens_at };
  if (nowMin >= close) return { kind: "after_close", confirmed };
  return { kind: "open", confirmed, closesAt: today.closes_at };
}

export function isWithinBusinessHours(status: ScheduleStatus): boolean | null {
  if (status.kind === "unknown") return null;
  return status.kind === "open";
}

export function describeSchedule(status: ScheduleStatus): string {
  const suffix = status.confirmed ? "" : " · horario sin confirmar";
  switch (status.kind) {
    case "unknown":
      return status.confirmed ? "Sin horario registrado para hoy" : "Horario pendiente de confirmar";
    case "open":
      return `Abierto · cierra ${formatClock(status.closesAt)}${suffix}`;
    case "before_open":
      return `Cerrado · abre ${formatClock(status.opensAt)}${suffix}`;
    case "after_close":
      return `Cerrado por hoy${suffix}`;
    case "closed_today":
      return `Cerrado hoy${suffix}`;
  }
}

export function describeDay(row: BusinessHoursRow | undefined): string {
  if (!row) return "Sin registrar";
  if (row.is_closed || !row.opens_at || !row.closes_at) return "Cerrado";
  return `${formatClock(row.opens_at)} – ${formatClock(row.closes_at)}`;
}

/** Fila editable del formulario de horario. */
export type DayDraft = {
  weekday: number;
  state: "open" | "closed" | "unset";
  opensAt: string; // "HH:MM"
  closesAt: string;
};

export function draftFromRows(rows: BusinessHoursRow[]): DayDraft[] {
  return WEEK_ORDER.map((weekday) => {
    const r = rows.find((x) => x.weekday === weekday);
    if (!r) return { weekday, state: "unset", opensAt: "", closesAt: "" };
    if (r.is_closed) return { weekday, state: "closed", opensAt: "", closesAt: "" };
    return {
      weekday,
      state: "open",
      opensAt: (r.opens_at ?? "").slice(0, 5),
      closesAt: (r.closes_at ?? "").slice(0, 5),
    };
  });
}

export type DraftError = { weekday: number; message: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validateDrafts(drafts: DayDraft[]): DraftError[] {
  const errors: DraftError[] = [];
  for (const d of drafts) {
    if (d.state !== "open") continue;
    if (!HHMM.test(d.opensAt) || !HHMM.test(d.closesAt)) {
      errors.push({ weekday: d.weekday, message: "Indica hora de apertura y de cierre." });
    } else if (timeToMinutes(d.opensAt) >= timeToMinutes(d.closesAt)) {
      errors.push({ weekday: d.weekday, message: "La hora de cierre debe ser posterior a la de apertura." });
    }
  }
  return errors;
}
