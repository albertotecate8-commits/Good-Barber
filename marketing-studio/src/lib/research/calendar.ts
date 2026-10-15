// Calendario comercial de México + Durango. Solo incluye fechas verificables;
// la relevancia comercial de cada fecha es una hipótesis que hay que probar.
import type { FindingDraft } from "./types";

const LFT = "https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf";

interface CalendarEvent {
  date: string;
  end?: string;
  name: string;
  why: string;
  level: "fact" | "observation";
  confidence: "high" | "medium" | "low";
  source: string;
  url: string;
}

function nthWeekday(year: number, month: number, weekday: number, n: number) {
  // weekday: 0 = domingo … 6 = sábado (getUTCDay)
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7)).toISOString().slice(0, 10);
}
const d = (y: number, m: number, day: number) => `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Fechas con fuente verificada solo para años concretos (no se extrapolan). */
const YEAR_SPECIFIC: CalendarEvent[] = [
  {
    date: "2026-07-17",
    end: "2026-08-02",
    name: "Feria Nacional Durango (FENADU) 2026",
    why: "Alta afluencia de visitantes en la ciudad.",
    level: "fact",
    confidence: "medium",
    source: "Medios locales (Posta Durango)",
    url: "https://www.posta.com.mx/durango/feria-durango-2026-estos-aristas-integran-el-cartel-de-la-explanada-de-los-grandes/vl2199780",
  },
  {
    date: "2026-11-13",
    end: "2026-11-17",
    name: "El Buen Fin 2026",
    why: "Temporada nacional de ofertas; la gente compara promociones.",
    level: "fact",
    confidence: "high",
    source: "Fechas anunciadas por la Secretaría de Economía (vía N+)",
    url: "https://www.nmas.com.mx/economia/el-buen-fin-2026-cambia-de-dias-cuando-es-fecha-inicio-detalles-temporada-ofertas/",
  },
];

export function eventsForYear(y: number): CalendarEvent[] {
  const legal = (date: string, name: string): CalendarEvent => ({
    date,
    name: `${name} (descanso obligatorio)`,
    why: "Día de descanso obligatorio: cambia la disponibilidad y los hábitos de la gente.",
    level: "fact",
    confidence: "high",
    source: "Ley Federal del Trabajo, art. 74",
    url: LFT,
  });
  const cultural = (date: string, name: string, why: string): CalendarEvent => ({
    date,
    name,
    why,
    level: "observation",
    confidence: "high",
    source: "Fecha conmemorativa tradicional en México",
    url: "https://www.gob.mx/",
  });
  return [
    legal(d(y, 1, 1), "Año Nuevo"),
    legal(nthWeekday(y, 2, 1, 1), "Día de la Constitución"),
    legal(nthWeekday(y, 3, 1, 3), "Natalicio de Benito Juárez"),
    legal(d(y, 5, 1), "Día del Trabajo"),
    legal(d(y, 9, 16), "Día de la Independencia"),
    legal(nthWeekday(y, 11, 1, 3), "Día de la Revolución"),
    legal(d(y, 12, 25), "Navidad"),
    cultural(d(y, 1, 6), "Día de Reyes", "Fecha familiar; regalos."),
    cultural(d(y, 2, 14), "Día del Amor y la Amistad", "Citas y salidas en pareja: arreglo personal."),
    cultural(d(y, 4, 30), "Día del Niño", "Actividades familiares."),
    cultural(d(y, 5, 10), "Día de las Madres", "Regalos y celebraciones familiares."),
    cultural(nthWeekday(y, 6, 0, 3), "Día del Padre", "Regalos para papá."),
    cultural(d(y, 9, 15), "Noche Mexicana (15 de septiembre)", "Fiestas: la gente quiere verse bien."),
    cultural(d(y, 11, 2), "Día de Muertos", "Puente y reuniones familiares."),
    cultural(d(y, 12, 24), "Nochebuena", "Temporada de fiestas: alta demanda de arreglo personal."),
    cultural(d(y, 12, 31), "Fin de año", "Fiestas de fin de año."),
    {
      date: d(y, 7, 8),
      name: "Aniversario de la fundación de Durango (8 de julio de 1563)",
      why: "Fecha de orgullo local para la ciudad.",
      level: "fact",
      confidence: "high",
      source: "Historia de Victoria de Durango",
      url: "https://es.wikipedia.org/wiki/Victoria_de_Durango",
    },
    {
      date: d(y, 12, 20),
      name: "Fecha límite para pagar el aguinaldo",
      why: "Muchas personas reciben aguinaldo antes de esta fecha.",
      level: "fact",
      confidence: "high",
      source: "Ley Federal del Trabajo, art. 87",
      url: LFT,
    },
    ...YEAR_SPECIFIC.filter((e) => e.date.startsWith(String(y))),
  ];
}

/** Días de pago habituales (quincena): práctica común, no regla para todos. */
function paydays(start: string, end: string): string[] {
  const out: string[] = [];
  const [ys, ms] = start.split("-").map(Number);
  const [ye, me] = end.split("-").map(Number);
  for (let y = ys, m = ms; y < ye || (y === ye && m <= me); m === 12 ? (y++, (m = 1)) : m++) {
    out.push(d(y, m, 15), new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  }
  return out.filter((x) => x >= start && x <= end);
}

/**
 * Hallazgos del calendario para un periodo, más una ventana de anticipación
 * (por defecto 45 días) para preparar campañas de temporada.
 */
export function calendarFindings(start: string, end: string, now: Date, lookaheadDays = 45): FindingDraft[] {
  const until = new Date(new Date(`${end}T00:00:00Z`).getTime() + lookaheadDays * 86400_000).toISOString().slice(0, 10);
  const years = new Set([Number(start.slice(0, 4)), Number(until.slice(0, 4))]);
  const events = [...years].flatMap(eventsForYear).filter((e) => (e.end ?? e.date) >= start && e.date <= until);
  events.sort((a, b) => a.date.localeCompare(b.date));
  const consulted_at = now.toISOString();
  const out: FindingDraft[] = events.map((e) => ({
    source_type: "calendar",
    source_name: e.source,
    url: e.url,
    consulted_at,
    summary: `${e.name}: ${e.date}${e.end ? ` al ${e.end}` : ""}.`,
    evidence: `${e.why} La relación con las ventas del negocio es una hipótesis a medir.`,
    evidence_level: e.level,
    confidence: e.confidence,
    capture_method: "automatic",
  }));
  const pay = paydays(start, end);
  if (pay.length) {
    out.push({
      source_type: "calendar",
      source_name: "Práctica laboral común en México (pago quincenal)",
      url: LFT,
      consulted_at,
      summary: `Días de quincena en el periodo: ${pay.join(", ")}.`,
      evidence: "Muchos empleos pagan los días 15 y último del mes; no aplica a todos. Hipótesis: más disposición a gastar cerca de esas fechas.",
      evidence_level: "observation",
      confidence: "medium",
      capture_method: "automatic",
    });
  }
  return out;
}
