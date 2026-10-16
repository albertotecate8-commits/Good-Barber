// Analíticas a partir de datos REALES registrados en la app: publicaciones,
// prospectos/ventas capturados o importados y resultados manuales de campañas.
// Nunca se estiman ventas ni alcance; si un dato no existe se muestra como tal.
// Atribución: solo cuenta para una campaña lo que tú registraste como
// atribuido (el cliente lo dijo o usó el código); lo demás queda «sin atribuir».

export interface LeadRow {
  campaign_id: string | null;
  status: "new" | "contacted" | "appointment" | "customer" | "lost";
  source: string;
  value_cents: number | null;
  attribution: "declared" | "campaign_code" | "unknown";
}

export interface ContentRow {
  campaign_id: string | null;
  status: string;
  manual_posted_at: string | null;
  external_post_id: string | null;
}

export interface ResultRow {
  campaign_id: string;
  messages: number;
  appointments: number;
  customers: number;
  revenue_cents: number;
  ad_spend_cents: number;
}

export interface CampaignStats {
  campaignId: string | null;
  leads: number;
  appointments: number;
  customers: number;
  revenueCents: number;
  /** Resultados capturados a mano en «Resultados» de la campaña. */
  manual: { messages: number; appointments: number; customers: number; revenueCents: number; adSpendCents: number };
  published: { platform: number; manual: number };
  /** Solo si hay gasto publicitario real registrado. */
  costPerCustomerCents: number | null;
}

const reached = (s: LeadRow["status"]) => s === "appointment" || s === "customer";

export function summarizeLeads(leads: LeadRow[]) {
  const byStatus = { new: 0, contacted: 0, appointment: 0, customer: 0, lost: 0 } as Record<LeadRow["status"], number>;
  const bySource: Record<string, number> = {};
  let revenueCents = 0;
  let attributed = 0;
  for (const l of leads) {
    byStatus[l.status]++;
    bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    if (l.status === "customer" && l.value_cents) revenueCents += l.value_cents;
    if (l.attribution !== "unknown" && l.campaign_id) attributed++;
  }
  return {
    total: leads.length,
    byStatus,
    bySource,
    revenueCents,
    attributed,
    unattributed: leads.length - attributed,
    /** Proporción de prospectos que llegaron a cita o compra (null sin datos). */
    toAppointmentRate: leads.length ? leads.filter((l) => reached(l.status)).length / leads.length : null,
  };
}

export function campaignStats(campaignIds: string[], leads: LeadRow[], content: ContentRow[], results: ResultRow[]): CampaignStats[] {
  return campaignIds.map((id) => {
    const ls = leads.filter((l) => l.campaign_id === id && l.attribution !== "unknown");
    const rs = results.filter((r) => r.campaign_id === id);
    const cs = content.filter((c) => c.campaign_id === id);
    const manual = rs.reduce(
      (a, r) => ({
        messages: a.messages + r.messages,
        appointments: a.appointments + r.appointments,
        customers: a.customers + r.customers,
        revenueCents: a.revenueCents + r.revenue_cents,
        adSpendCents: a.adSpendCents + r.ad_spend_cents,
      }),
      { messages: 0, appointments: 0, customers: 0, revenueCents: 0, adSpendCents: 0 },
    );
    const customers = ls.filter((l) => l.status === "customer").length;
    const totalCustomers = customers + manual.customers;
    return {
      campaignId: id,
      leads: ls.length,
      appointments: ls.filter((l) => reached(l.status)).length,
      customers,
      revenueCents: ls.reduce((a, l) => a + (l.status === "customer" ? (l.value_cents ?? 0) : 0), 0),
      manual,
      published: {
        platform: cs.filter((c) => c.status === "published" && c.external_post_id).length,
        manual: cs.filter((c) => c.manual_posted_at && !c.external_post_id).length,
      },
      costPerCustomerCents: manual.adSpendCents > 0 && totalCustomers > 0 ? Math.round(manual.adSpendCents / totalCustomers) : null,
    };
  });
}

export function contentSummary(content: ContentRow[]) {
  return {
    total: content.length,
    confirmedByPlatform: content.filter((c) => c.status === "published" && c.external_post_id).length,
    declaredManual: content.filter((c) => c.manual_posted_at && !c.external_post_id).length,
    scheduled: content.filter((c) => c.status === "scheduled").length,
    errors: content.filter((c) => c.status === "error").length,
    drafts: content.filter((c) => c.status === "draft" || c.status === "review").length,
  };
}
