// Análisis de resultados registrados a mano. Solo describe lo que pasó y
// sugiere qué probar; nunca afirma causalidad.

export interface ExperimentRow {
  id: string;
  campaign_id: string;
  variant: string;
  hypothesis: string;
  messages: number;
  appointments: number;
  customers: number;
  sales_count: number;
  revenue_cents: number;
  ad_spend_cents: number;
  published_on: string | null;
  period_end: string | null;
}

export interface Totals {
  messages: number;
  appointments: number;
  customers: number;
  sales_count: number;
  revenue_cents: number;
  ad_spend_cents: number;
  /** null cuando no se puede calcular (división entre cero). */
  costPerAppointmentCents: number | null;
  costPerCustomerCents: number | null;
  messageToAppointment: number | null;
}

export function totals(rows: ExperimentRow[]): Totals {
  const t = rows.reduce(
    (a, r) => ({
      messages: a.messages + r.messages,
      appointments: a.appointments + r.appointments,
      customers: a.customers + r.customers,
      sales_count: a.sales_count + r.sales_count,
      revenue_cents: a.revenue_cents + r.revenue_cents,
      ad_spend_cents: a.ad_spend_cents + r.ad_spend_cents,
    }),
    { messages: 0, appointments: 0, customers: 0, sales_count: 0, revenue_cents: 0, ad_spend_cents: 0 },
  );
  return {
    ...t,
    costPerAppointmentCents: t.ad_spend_cents > 0 && t.appointments > 0 ? Math.round(t.ad_spend_cents / t.appointments) : null,
    costPerCustomerCents: t.ad_spend_cents > 0 && t.customers > 0 ? Math.round(t.ad_spend_cents / t.customers) : null,
    messageToAppointment: t.messages > 0 ? t.appointments / t.messages : null,
  };
}

/** Umbral mínimo para decir algo comparativo (muy conservador a propósito). */
export const MIN_RESULTS_TO_COMPARE = 10;

export function recommendations(byVariant: { label: string; rows: ExperimentRow[] }[]): string[] {
  const out: string[] = [];
  const scored = byVariant
    .map((v) => ({ label: v.label, t: totals(v.rows) }))
    .map((v) => ({ ...v, results: v.t.appointments + v.t.customers + v.t.sales_count }));
  const withData = scored.filter((v) => v.results > 0 || v.t.messages > 0);
  if (!withData.length) {
    return ["Aún no hay resultados registrados. Registra mensajes, citas o ventas por variante para poder comparar."];
  }
  const total = scored.reduce((a, v) => a + v.results, 0);
  if (total < MIN_RESULTS_TO_COMPARE || withData.length < 2) {
    out.push(
      `Hay ${total} resultado(s) registrados${withData.length < 2 ? " y solo una variante con datos" : ""}: todavía no alcanza para comparar con confianza (mínimo sugerido: ${MIN_RESULTS_TO_COMPARE}). Sigue registrando antes de decidir.`,
    );
  } else {
    const sorted = [...withData].sort((a, b) => b.results - a.results);
    const [best, second] = sorted;
    if (best.results === second.results) {
      out.push(`«${best.label}» y «${second.label}» empatan en resultados: prueba ambas otra semana.`);
    } else {
      out.push(
        `«${best.label}» registró más resultados (${best.results} vs ${second.results} de «${second.label}»). Recomendación por probar: repetirla otra semana y cambiar solo un elemento (texto o imagen) para confirmar.`,
      );
    }
    const zero = scored.filter((v) => v.results === 0 && v.t.messages === 0);
    if (zero.length) out.push(`Sin resultados registrados: ${zero.map((z) => `«${z.label}»`).join(", ")}. Revisa si se publicaron y si se midieron, antes de descartarlas.`);
  }
  out.push("Recuerda: estas diferencias son correlaciones. La quincena, el clima, la temporada o el día de publicación también influyen.");
  return out;
}
