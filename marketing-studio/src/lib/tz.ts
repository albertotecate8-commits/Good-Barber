// Conversión entre fecha/hora "de pared" en una zona horaria y UTC, sin
// dependencias. Se calcula el desfase con Intl en lugar de asumir -06:00, así
// sigue siendo correcto si México vuelve a cambiar sus reglas de horario.

export const BUSINESS_TZ = "America/Mexico_City";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string) {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

function wallClock(utcMs: number, tz: string) {
  const parts = formatterFor(tz).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

/** Minutos que la zona está adelantada respecto a UTC en ese instante (México: -360). */
export function tzOffsetMinutes(utcMs: number, tz = BUSINESS_TZ): number {
  const w = wallClock(utcMs, tz);
  return (Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(utcMs / 1000) * 1000) / 60000;
}

export function isValidDateString(date: string): boolean {
  const m = DATE_RE.exec(date);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function isValidTimeString(time: string): boolean {
  return TIME_RE.test(time);
}

/** "2026-10-20" + "18:30" en Ciudad de México -> ISO UTC ("2026-10-21T00:30:00.000Z"). */
export function zonedToUtc(date: string, time: string, tz = BUSINESS_TZ): string {
  if (!isValidDateString(date)) throw new Error(`Fecha no válida: ${date}`);
  if (!isValidTimeString(time)) throw new Error(`Hora no válida: ${time}`);
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let ts = naive - tzOffsetMinutes(naive, tz) * 60000;
  const second = naive - tzOffsetMinutes(ts, tz) * 60000;
  if (second !== ts) ts = second;
  const back = utcToZoned(new Date(ts).toISOString(), tz);
  if (back.date !== date || back.time !== time) {
    throw new Error(`La hora ${time} no existe el ${date} en ${tz} (cambio de horario).`);
  }
  return new Date(ts).toISOString();
}

/** ISO UTC -> fecha y hora locales de la zona. */
export function utcToZoned(iso: string, tz = BUSINESS_TZ): { date: string; time: string } {
  const w = wallClock(new Date(iso).getTime(), tz);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${w.y}-${p(w.m)}-${p(w.d)}`, time: `${p(w.h)}:${p(w.mi)}` };
}

export function todayInTz(now = new Date(), tz = BUSINESS_TZ): string {
  return utcToZoned(now.toISOString(), tz).date;
}

/** Suma días a una fecha "YYYY-MM-DD" (aritmética de calendario, sin zona). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** 0 = lunes … 6 = domingo. */
export function weekdayIndex(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** Semanas (lunes a domingo) que cubren el mes de la fecha dada. */
export function monthGrid(date: string): string[][] {
  const first = `${date.slice(0, 7)}-01`;
  const nextMonth = addMonths(first, 1);
  const weeks: string[][] = [];
  let cursor = startOfWeek(first);
  while (cursor < nextMonth) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Rango [inicio, fin) en UTC que cubre los días locales [fromDate, toDateExclusive). */
export function utcRangeForDays(fromDate: string, toDateExclusive: string, tz = BUSINESS_TZ) {
  return { start: zonedToUtc(fromDate, "00:00", tz), end: zonedToUtc(toDateExclusive, "00:00", tz) };
}
