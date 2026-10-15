export const BUSINESS_TZ = "America/Mexico_City";

export function formatDateTime(iso: string | null | undefined, tz = BUSINESS_TZ) {
  if (!iso) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(isoDate: string | null | undefined) {
  if (!isoDate) return "—";
  // Fechas "YYYY-MM-DD" sin hora: se formatean en UTC para no correr un día.
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}
