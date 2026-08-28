// Utilidades de fecha. Todas las fechas se guardan como "YYYY-MM-DD" (local).

export const MS_DAY = 86400000;

export const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export const DOW_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

/** Periodicidades soportadas. */
export const RECURRENCES = [
  { id: "once", label: "Una sola vez", short: "Única" },
  { id: "weekly", label: "Semanal", short: "Semanal", days: 7 },
  { id: "biweekly", label: "Cada 2 semanas", short: "2 semanas", days: 14 },
  { id: "triweekly", label: "Cada 3 semanas", short: "3 semanas", days: 21 },
  { id: "monthly", label: "Mensual", short: "Mensual", months: 1 },
  { id: "bimonthly", label: "Cada 2 meses", short: "2 meses", months: 2 },
  { id: "quarterly", label: "Cada 3 meses", short: "3 meses", months: 3 },
];

export function recurrenceLabel(id) {
  const r = RECURRENCES.find((x) => x.id === id);
  return r ? r.label : "Una sola vez";
}

export function recurrenceShort(id) {
  const r = RECURRENCES.find((x) => x.id === id);
  return r ? r.short : "Única";
}

/** Fecha de hoy en formato ISO local (no UTC). */
export function todayISO() {
  return toISO(new Date());
}

/** Date -> "YYYY-MM-DD" usando la zona horaria local. */
export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> Date local a mediodía (evita saltos por horario de verano). */
export function parseISO(iso) {
  if (!iso) return null;
  const parts = String(iso).slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d, 12, 0, 0, 0);
  return isNaN(date.getTime()) ? null : date;
}

export function isValidISO(iso) {
  const d = parseISO(iso);
  if (!d) return false;
  // Rechaza fechas imposibles como 2026-02-31 (Date las desborda al mes siguiente).
  return toISO(d) === String(iso).slice(0, 10);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/**
 * Suma meses conservando el "día ancla". Si el día no existe en el mes destino
 * (31 de agosto + 1 mes), se ajusta al último día de ese mes sin romperse, y el
 * ancla original se conserva para los periodos siguientes.
 */
export function addMonths(iso, n, anchorDay) {
  const d = parseISO(iso);
  if (!d) return iso;
  const anchor = anchorDay || d.getDate();
  const year = d.getFullYear();
  const month = d.getMonth() + n;
  const target = new Date(year, month, 1, 12, 0, 0, 0);
  const max = daysInMonth(target.getFullYear(), target.getMonth());
  target.setDate(Math.min(anchor, max));
  return toISO(target);
}

/** Siguiente vencimiento a partir de una fecha, según la periodicidad. */
export function nextDue(iso, recurrence, anchorDay) {
  const rec = RECURRENCES.find((r) => r.id === recurrence);
  if (!rec || rec.id === "once") return null;
  if (rec.days) return addDays(iso, rec.days);
  return addMonths(iso, rec.months, anchorDay);
}

/** Diferencia en días completos: b - a. */
export function diffDays(a, b) {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

/** Lunes de la semana de `iso`. */
export function startOfWeek(iso) {
  const d = parseISO(iso) || new Date();
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  return toISO(d);
}

export function endOfWeek(iso) {
  return addDays(startOfWeek(iso), 6);
}

/**
 * Corte financiero: domingo a sábado (no lunes a domingo). El sábado es el
 * día de "hacer cuentas" — cierra el corte de esa semana. El domingo
 * siguiente ya es un corte nuevo. Siempre dura 7 días, sin excepciones.
 */
export function startOfCut(iso) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() - d.getDay()); // domingo = 0
  return toISO(d);
}

export function endOfCut(iso) {
  return addDays(startOfCut(iso), 6); // el sábado de esa misma semana
}

/** "29 ago → 4 sep" */
export function formatCutRange(startISO, endISO) {
  const a = parseISO(startISO);
  const b = parseISO(endISO);
  if (!a || !b) return "";
  const sameMonth = a.getMonth() === b.getMonth();
  const left = sameMonth ? `${a.getDate()}` : `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}`;
  return `${left} ${sameMonth ? MONTHS_SHORT[a.getMonth()] : ""} → ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`.replace(/\s+/g, " ").trim();
}

export function startOfMonth(iso) {
  const d = parseISO(iso) || new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
}

export function endOfMonth(iso) {
  const d = parseISO(iso) || new Date();
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
}

export function monthKey(iso) {
  return String(iso).slice(0, 7);
}

/** "28 agosto 2026" */
export function formatLong(iso) {
  const d = parseISO(iso);
  if (!d) return "Sin fecha";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "28 ago" */
export function formatShort(iso) {
  const d = parseISO(iso);
  if (!d) return "Sin fecha";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "28 ago 2026" */
export function formatMedium(iso) {
  const d = parseISO(iso);
  if (!d) return "Sin fecha";
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "agosto 2026" */
export function formatMonthYear(iso) {
  const d = parseISO(iso);
  if (!d) return "";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Hoy", "Mañana", "Ayer", "Vencido hace 3 días", "En 5 días"… */
export function relativeLabel(iso, from) {
  const base = from || todayISO();
  const n = diffDays(base, iso);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  if (n < 0) return `Hace ${Math.abs(n)} días`;
  if (n <= 30) return `En ${n} días`;
  return formatShort(iso);
}
