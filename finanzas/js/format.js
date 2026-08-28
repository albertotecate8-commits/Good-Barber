// Formato de dinero y textos. Todo en pesos mexicanos.

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MXN_ROUND = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** $1,429.00 */
export function money(value) {
  const n = Number(value) || 0;
  return MXN.format(n);
}

/** $1,429 — solo para espacios muy estrechos (gráficas, chips). */
export function moneyShort(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000000) return MXN_ROUND.format(n / 1000000).replace(/\s/g, "") + "M";
  return MXN_ROUND.format(n);
}

/** Convierte "1,234.50" o "$1,234.50" a número. Devuelve NaN si no es válido. */
export function parseMoney(text) {
  if (typeof text === "number") return text;
  if (text == null) return NaN;
  const clean = String(text).replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  if (clean === "" || clean === "-" || clean === ".") return NaN;
  return Number(clean);
}

/** Redondea a centavos para evitar errores de punto flotante. */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function initials(name) {
  const words = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Escapa texto antes de insertarlo en HTML. */
export function esc(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
