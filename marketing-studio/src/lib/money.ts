// Dinero en centavos (enteros) para evitar errores de coma flotante.

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });

export function formatCents(cents: number | null | undefined, currency = "MXN"): string {
  if (cents === null || cents === undefined) return "Sin precio";
  const fmt = currency === "MXN" ? mxn : new Intl.NumberFormat("es-MX", { style: "currency", currency });
  const text = fmt.format(cents / 100);
  // "$120.00" -> "$120" cuando no hay centavos: más natural en anuncios.
  return cents % 100 === 0 ? text.replace(/[.,]00(?=\D*$)/, "") : text;
}

/**
 * Convierte lo que escribe el usuario ("120", "$1,250.50", "99,5") a centavos.
 * Devuelve null si el campo está vacío y lanza si no es un precio válido.
 */
export function parsePriceToCents(input: string): number | null {
  const raw = input.trim().replace(/\s|\$|MXN/gi, "");
  if (raw === "") return null;
  let normalized = raw;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(raw)) normalized = raw.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(raw)) normalized = raw.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error(`Precio no válido: "${input}"`);
  const [whole, frac = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000) throw new Error(`Precio fuera de rango: "${input}"`);
  return cents;
}
