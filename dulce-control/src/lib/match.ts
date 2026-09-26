// Relaciona los nombres abreviados de un ticket ("TAKIS FGO 70G") con los
// productos del catálogo ("Takis Fuego"). La IA ya sugiere una coincidencia;
// esto ordena alternativas para el selector y sirve de respaldo sin IA.

export interface Named {
  id: string;
  name: string;
}

export interface MatchResult<T extends Named> {
  product: T;
  score: number; // 0..1
}

const STOP = new Set(["de", "la", "el", "los", "las", "con", "sin", "y", "en", "pz", "pza", "pzs", "pieza", "piezas", "gr", "g", "grs", "ml", "kg", "lt", "paq", "pq", "cja", "cj", "caja", "bolsa", "bsa", "x"]);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s)
    .split(" ")
    .filter((t) => t.length > 0 && !STOP.has(t) && !/^\d+([a-z]{1,3})?$/.test(t)); // quita "70g", "12", "500ml"
}

/** ¿`abbr` es subsecuencia de `word` empezando por la misma letra? ("fgo" ⊂ "fuego") */
function isAbbreviation(abbr: string, word: string): boolean {
  if (abbr.length < 2 || abbr[0] !== word[0] || abbr.length > word.length) return false;
  let j = 0;
  for (let i = 0; i < word.length && j < abbr.length; i++) if (word[i] === abbr[j]) j++;
  return j === abbr.length;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + b.length - 1);
}

/** Parecido entre dos palabras; simétrico (una puede ser abreviatura de la otra). */
function tokenScore(a: string, b: string): number {
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.startsWith(short) && short.length >= 3) return 0.92;
  if (isAbbreviation(short, long)) return 0.85;
  return dice(a, b) * 0.9;
}

export function similarity(ticketName: string, productName: string): number {
  const a = tokens(ticketName);
  const b = tokens(productName);
  if (!a.length || !b.length) return 0;
  // Cada palabra del producto debe encontrarse en el ticket (cobertura),
  // y las palabras del ticket deberían explicarse con el producto (precisión).
  const best = (t: string, pool: string[]) => Math.max(...pool.map((w) => tokenScore(t, w)));
  const coverage = b.reduce((s, w) => s + best(w, a), 0) / b.length;
  const precision = a.reduce((s, t) => s + best(t, b), 0) / a.length;
  return 0.65 * coverage + 0.35 * precision;
}

export function rankMatches<T extends Named>(ticketName: string, catalog: T[], limit = 5): MatchResult<T>[] {
  return catalog
    .map((product) => ({ product, score: similarity(ticketName, product.name) }))
    .filter((m) => m.score > 0.25)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

export type Confidence = "high" | "medium" | "low" | "none";

export function confidenceFromScore(score: number): Confidence {
  if (score >= 0.82) return "high";
  if (score >= 0.6) return "medium";
  if (score >= 0.4) return "low";
  return "none";
}
