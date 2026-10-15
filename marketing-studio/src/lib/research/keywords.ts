import { slugify } from "@/lib/slug";

/** Palabras clave de búsqueda según el sector (editables en cada informe). */
export function defaultKeywords(sector: string): string[] {
  const s = slugify(sector);
  if (/barber|peluquer|corte/.test(s)) return ["barbería", "corte de cabello", "barba"];
  if (/una|nail|manicur/.test(s)) return ["uñas", "manicure", "uñas acrílicas"];
  if (/afore|retiro|pension/.test(s)) return ["afore", "retiro afore", "pensión"];
  return sector ? [sector.toLowerCase()] : [];
}

/** Etiquetas de OpenStreetMap para buscar negocios similares, por sector. */
export function osmSelectors(sector: string): { selectors: string[]; label: string } | null {
  const s = slugify(sector);
  if (/barber|peluquer/.test(s)) return { selectors: ['nwr["shop"="hairdresser"]'], label: "barberías y peluquerías" };
  if (/una|nail|manicur|belleza|beauty/.test(s)) return { selectors: ['nwr["shop"="beauty"]'], label: "salones de belleza y uñas" };
  if (/afore|retiro|pension|financ/.test(s))
    return { selectors: ['nwr["office"="financial_advisor"]', 'nwr["office"="financial"]'], label: "asesores financieros" };
  return null;
}
