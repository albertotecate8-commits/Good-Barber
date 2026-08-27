// Aritmética monetaria seguras en centavos (evita errores de punto flotante).

export const CURRENCY = "MXN";
export const LOCALE = "es-MX";

export function toCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

export function fromCents(cents) {
  return Number(cents || 0) / 100;
}

export function formatCents(cents) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(fromCents(cents));
}

export function formatAmount(amount) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: CURRENCY,
  }).format(Number(amount || 0));
}

export function splitCents(totalCents, barberPercentage) {
  const pct = Number(barberPercentage || 60);
  const barberShare = Math.round((totalCents * pct) / 100);
  const businessShare = totalCents - barberShare;
  return { barberShare, businessShare };
}

export function clampNonNegative(cents) {
  return cents < 0 ? 0 : cents;
}
