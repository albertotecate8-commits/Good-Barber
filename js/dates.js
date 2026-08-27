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
