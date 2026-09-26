const moneyWhole = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 0, maximumFractionDigits: 0,
});
const moneyCents = new Intl.NumberFormat("es-MX", {
  style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

/** $160 · $6.50 · −$2 */
export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? moneyWhole.format(rounded) : moneyCents.format(rounded);
}

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n)}%`;
}

export function int(n: number): string {
  return new Intl.NumberFormat("es-MX").format(n);
}

const dayMonth = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
const dayMonthLong = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" });
const full = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" });

export const fmtDay = (d: string | Date) => dayMonth.format(new Date(d)).replace(".", "");
export const fmtDayLong = (d: string | Date) => dayMonthLong.format(new Date(d));
export const fmtFull = (d: string | Date) => {
  const s = full.format(new Date(d));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const fmtTime = (d: string | Date) => time.format(new Date(d));

/** "Semana del 21 al 27 de septiembre" / "Semana del 28 sep al 4 oct" */
export function weekLabel(start: string | null, end: string): string {
  const e = new Date(end);
  if (!start) return `Hasta el ${fmtDayLong(e)}`;
  const s = new Date(start);
  // El periodo empieza el día siguiente al conteo anterior.
  const from = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
  if (from > e) return `Semana al ${fmtDayLong(e)}`;
  if (from.getMonth() === e.getMonth()) {
    return `Semana del ${from.getDate()} al ${fmtDayLong(e)}`;
  }
  return `Semana del ${fmtDay(from)} al ${fmtDay(e)}`;
}

export function isSaturday(d = new Date()): boolean {
  return d.getDay() === 6;
}

export function sameLocalDay(a: string | Date, b: string | Date): boolean {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
