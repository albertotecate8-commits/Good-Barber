// Revisión ortográfica en español con un diccionario Hunspell libre
// (dictionary-es, licencia MPL/LGPL/GPL) y nspell, sin servicios externos.
// Es una AYUDA: las palabras desconocidas se informan como advertencia (nunca
// bloquean) porque nombres propios, marcas y anglicismos pueden ser correctos.
import type { QaCheck } from "./qa";

export interface Speller {
  correct(word: string): boolean;
  suggest(word: string): string[];
}

/** Anglicismos y términos de redes habituales en publicidad en México. */
const COMMON_ALLOWED = [
  "fade", "taper", "barber", "barbershop", "look", "combo", "promo", "promos", "whatsapp", "instagram", "facebook",
  "tiktok", "reel", "reels", "dm", "inbox", "online", "link", "stories", "story", "post", "afore", "aforé", "spa",
  "ok", "vip", "free", "style", "skin", "outfit", "staff", "hashtag",
];

const ENCLITICS = ["selas", "selos", "sela", "selo", "nos", "les", "los", "las", "le", "lo", "la", "me", "te", "se"];
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** «Agéndala» → «agenda»; «Reserva» → «reserva». Solo se usa para no marcar formas válidas. */
function encliticBases(word: string): string[] {
  const w = word.toLowerCase();
  const out: string[] = [];
  for (const e of ENCLITICS) {
    if (w.length > e.length + 2 && w.endsWith(e)) out.push(strip(w.slice(0, -e.length)));
  }
  return out;
}

const ACCENTS: Record<string, string> = { a: "á", e: "é", i: "í", o: "ó", u: "ú", n: "ñ" };

/** Variantes con una tilde (o ñ) agregada: el error más común en publicidad («promocion»). */
function accentVariants(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; i++) {
    const r = ACCENTS[word[i]];
    if (r) out.push(word.slice(0, i) + r + word.slice(i + 1));
  }
  return out;
}

export function tokenize(text: string): string[] {
  return (text.match(/[\p{L}][\p{L}'’-]*/gu) ?? []).flatMap((w) => w.split(/[-'’]/)).filter((w) => w.length > 1);
}

export function unknownWords(text: string, speller: Speller, allowed: Iterable<string> = []): { word: string; suggestions: string[] }[] {
  const allow = new Set([...COMMON_ALLOWED, ...[...allowed].flatMap((a) => tokenize(a))].map((w) => strip(w.toLowerCase())));
  const seen = new Set<string>();
  const out: { word: string; suggestions: string[] }[] = [];
  for (const word of tokenize(text)) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (allow.has(strip(key))) continue;
    if (/^[A-ZÁÉÍÓÚÑ]{2,}$/.test(word) && word.length <= 5) continue; // siglas (CTA, IMSS, MXN)
    if (speller.correct(word) || speller.correct(key)) continue;
    if (encliticBases(word).some((b) => speller.correct(b))) continue;
    const accented = accentVariants(key).filter((v) => speller.correct(v));
    out.push({ word, suggestions: [...new Set([...accented, ...speller.suggest(key)])].slice(0, 3) });
  }
  return out;
}

export function spellingCheck(texts: Record<string, string>, speller: Speller | null, allowed: Iterable<string>): QaCheck {
  const label = "Ortografía";
  if (!speller)
    return { id: "spelling", label, level: "warning", detail: "El corrector ortográfico no está disponible en este servidor: revisa la ortografía a mano.", source: "server" };
  const words = unknownWords(Object.values(texts).join("\n"), speller, allowed);
  if (!words.length) return { id: "spelling", label, level: "ok", detail: "No se encontraron palabras desconocidas.", source: "server" };
  const list = words
    .slice(0, 8)
    .map((w) => (w.suggestions.length ? `«${w.word}» (¿${w.suggestions.join(", ")}?)` : `«${w.word}»`))
    .join("; ");
  return {
    id: "spelling",
    label,
    level: "warning",
    detail: `Palabras que el diccionario no reconoce: ${list}. Si son nombres propios o marcas, ignora este aviso.`,
    source: "server",
  };
}
