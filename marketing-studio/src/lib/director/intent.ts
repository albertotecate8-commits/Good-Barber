// Convierte una instrucción en español en tareas concretas. Es determinista
// (reglas, no IA): siempre da el mismo resultado y se puede probar.
import { GOALS, type Goal } from "./plan";
import { addDays, weekdayIndex } from "@/lib/tz";

export interface Intent {
  wantsResearch: boolean;
  wantsCompetitors: boolean;
  adsCount: number;
  wantsReel: boolean;
  wantsStories: boolean;
  /** Primer y último día (inclusive) del periodo, en fechas locales. */
  start: string;
  end: string;
  periodLabel: string;
  suggestedGoal: Goal | null;
  mentionsPromotion: boolean;
  tasks: { kind: string; label: string }[];
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function parseCount(text: string, nounRe: string): number | null {
  const re = new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\\s+(?:\\w+\\s+){0,2}?${nounRe}`);
  const m = re.exec(text);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
  return Math.min(Math.max(n, 1), 10);
}

const GOAL_HINTS: [Goal, RegExp][] = [
  ["appointments", /\bcitas?\b|agend|reserv/],
  ["messages", /\bmensajes?\b|whatsapp|\bdm\b|inbox/],
  ["reactivation", /reactiv|recuperar clientes|volver a venir|clientes (antiguos|inactivos|perdidos)/],
  ["sales", /\bventas?\b|vender|ingresos/],
  ["awareness", /reconocimiento|conozcan|alcance|seguidores|visibilidad/],
  ["customers", /clientes nuevos|nuevos clientes|mas clientes|atraer clientes/],
];

export function parseInstruction(instruction: string, today: string): Intent {
  const t = normalize(instruction);

  const wantsCompetitors = /competen|competidor|otras barberias|otros negocios|la competencia/.test(t);
  const wantsResearch = wantsCompetitors || /investig|tendenc|que (esta|estan) funcionando|analiza el mercado|mercado/.test(t);
  const wantsReel = /\breels?\b|video corto|tiktok/.test(t);
  const wantsStories = /\bhistorias?\b|\bstor(y|ies)\b/.test(t);
  const mentionsPromotion = /promo|descuento|oferta|2x1|paquete/.test(t);
  const adsCount = parseCount(t, "(anuncios?|ads?|publicaciones|piezas|disenos|posts?)") ?? 5;

  // Periodo (por defecto, los próximos 7 días a partir de mañana).
  let start = addDays(today, 1);
  let end = addDays(today, 7);
  let periodLabel = "los próximos 7 días";
  const nextDays = /proxim[oa]s?\s+(\d{1,2})\s+dias/.exec(t);
  if (/esta semana/.test(t)) {
    start = today;
    end = addDays(today, 6 - weekdayIndex(today));
    periodLabel = "esta semana";
  } else if (/fin de semana/.test(t)) {
    const wd = weekdayIndex(today);
    start = wd >= 4 ? today : addDays(today, 4 - wd); // desde el viernes
    end = addDays(today, 6 - wd);
    periodLabel = "este fin de semana";
  } else if (/este mes/.test(t)) {
    start = today;
    const [y, m] = today.split("-").map(Number);
    end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    periodLabel = "este mes";
  } else if (/proximas? (2|dos) semanas|quincena/.test(t)) {
    end = addDays(start, 13);
    periodLabel = "las próximas dos semanas";
  } else if (nextDays) {
    const n = Math.min(Math.max(Number(nextDays[1]), 1), 31);
    end = addDays(start, n - 1);
    periodLabel = `los próximos ${n} días`;
  }

  const suggestedGoal = GOAL_HINTS.find(([, re]) => re.test(t))?.[0] ?? null;

  const tasks = [
    { kind: "context", label: "Recuperar contexto, precios, promociones, público y reglas visuales del negocio" },
    ...(wantsResearch
      ? [{ kind: "research", label: wantsCompetitors ? "Investigar competencia y tendencias en fuentes públicas" : "Investigar tendencias y fechas relevantes" }]
      : [{ kind: "research", label: "Revisar fechas comerciales del periodo (investigación básica)" }]),
    { kind: "strategy", label: "Definir oportunidad, público, oferta y concepto visual" },
    { kind: "ads", label: `Proponer ${adsCount} anuncio${adsCount === 1 ? "" : "s"} con enfoques distintos` },
    ...(wantsReel ? [{ kind: "reel", label: "Escribir guion de Reel" }] : []),
    { kind: "schedule", label: `Sugerir calendario para ${periodLabel}` },
    { kind: "prompts", label: "Preparar prompts para generar imágenes o video en herramientas externas" },
    { kind: "measurement", label: "Definir indicadores y cómo registrar resultados" },
  ];

  return { wantsResearch, wantsCompetitors, adsCount, wantsReel, wantsStories, start, end, periodLabel, suggestedGoal, mentionsPromotion, tasks };
}

export function isGoal(v: unknown): v is Goal {
  return typeof v === "string" && (GOALS as readonly string[]).includes(v);
}
