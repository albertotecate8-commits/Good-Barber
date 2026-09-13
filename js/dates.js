// Manejo de fechas en horario local del negocio (evita corrimientos por UTC).

export const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIA_INDEX = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 }; // getDay(): 1=Lun ... 6=Sáb

export function startOfWeek(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// La semana que la AGENDA debe mostrar. De lunes a sábado se comporta igual
// que startOfWeek; el domingo —día en que el negocio no abre— abre la semana
// SIGUIENTE en vez de cerrar la que ya terminó, que es lo que un barbero
// necesita ver ese día.
//
// startOfWeek() se deja intacta A PROPÓSITO: de ella cuelgan el resumen
// semanal del barbero, las cifras del panel de administrador y el agrupado de
// liquidaciones (weekKeyForRecord / week_start_date). Cambiarla movería esas
// cifras en domingo — justo lo contrario de lo que se quiere.
export function startOfAgendaWeek(base = new Date()) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const day = d.getDay();
  const diff = day === 0 ? 1 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

// Desplaza una fecha ISO un número de días, en horario local (sin UTC).
export function shiftISODate(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function endOfWeek(base = new Date()) {
  const d = startOfWeek(base);
  d.setDate(d.getDate() + 5);
  return d;
}

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateText(date) {
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatDateLong(date) {
  return date.toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" });
}

export function dayNameFromDate(date) {
  const idx = DIA_INDEX[date.getDay()];
  return idx === undefined ? null : DIAS[idx];
}

export function todayISO() {
  return toISODate(new Date());
}

export function nowTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function weekLabel(weekStartISO) {
  const start = parseISODate(weekStartISO);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);
  return `${formatDateText(start)} al ${formatDateText(end)}`;
}
