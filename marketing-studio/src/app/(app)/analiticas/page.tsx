import Link from "next/link";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { campaignStats, contentSummary, summarizeLeads, type ContentRow, type LeadRow, type ResultRow } from "@/lib/analytics";
import { LEAD_SOURCE_LABELS } from "@/lib/validation/lead";
import { Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Analíticas" };

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-faint">{hint}</dd>}
    </div>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const business = businesses.find((b) => b.slug === sp.negocio) ?? businesses[0];
  if (!business)
    return (
      <>
        <PageHeader title="Analíticas" />
        <EmptyState title="Aún no hay negocios" />
      </>
    );
  const supabase = await createClient();
  const [leads, content, results, campaigns] = await Promise.all([
    supabase.from("mkt_leads").select("campaign_id,status,source,value_cents,attribution").eq("business_id", business.id).limit(5000),
    supabase.from("mkt_content_items").select("campaign_id,status,manual_posted_at,external_post_id").eq("business_id", business.id).limit(5000),
    supabase.from("mkt_experiments").select("campaign_id,messages,appointments,customers,revenue_cents,ad_spend_cents").eq("business_id", business.id).limit(5000),
    supabase.from("mkt_campaigns").select("id,name,status").eq("business_id", business.id).order("created_at", { ascending: false }).limit(100),
  ]);
  const l = summarizeLeads((leads.data ?? []) as LeadRow[]);
  const c = contentSummary((content.data ?? []) as ContentRow[]);
  const stats = campaignStats(
    (campaigns.data ?? []).map((x) => x.id),
    (leads.data ?? []) as LeadRow[],
    (content.data ?? []) as ContentRow[],
    (results.data ?? []) as ResultRow[],
  );
  const name = new Map((campaigns.data ?? []).map((x) => [x.id, x.name]));
  const withData = stats.filter((s) => s.leads || s.manual.messages || s.manual.customers || s.published.platform || s.published.manual);

  return (
    <>
      <PageHeader title="Analíticas" description="Solo datos reales registrados en la app, por negocio. Nada se estima." />
      <nav aria-label="Negocio" className="mb-4 flex flex-wrap gap-2">
        {businesses.map((b) => (
          <Link
            key={b.id}
            href={`/analiticas?negocio=${b.slug}`}
            aria-current={b.id === business.id ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 text-sm aria-[current=page]:border-action aria-[current=page]:font-medium"
          >
            {b.name}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4">
        <Card>
          <CardTitle>Publicaciones de {business.name}</CardTitle>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Confirmadas por Meta" value={c.confirmedByPlatform} hint="publicadas por la API" />
            <Stat label="Publicadas a mano" value={c.declaredManual} hint="declaradas por ti" />
            <Stat label="Programadas" value={c.scheduled} />
            <Stat label="Con error" value={c.errors} />
            <Stat label="Borradores" value={c.drafts} />
          </dl>
        </Card>
        <Card>
          <CardTitle>Prospectos y ventas</CardTitle>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Prospectos" value={l.total} />
            <Stat label="Con cita o compra" value={l.byStatus.appointment + l.byStatus.customer} hint={l.toAppointmentRate === null ? "sin datos" : `${Math.round(l.toAppointmentRate * 100)} % de los prospectos`} />
            <Stat label="Clientes" value={l.byStatus.customer} />
            <Stat label="Ventas registradas" value={formatCents(l.revenueCents)} />
          </dl>
          {l.total > 0 && (
            <p className="mt-3 text-xs text-muted">
              Por origen:{" "}
              {Object.entries(l.bySource)
                .map(([k, v]) => `${LEAD_SOURCE_LABELS[k as keyof typeof LEAD_SOURCE_LABELS] ?? k} ${v}`)
                .join(" · ")}
            </p>
          )}
        </Card>
        <Card>
          <CardTitle>Por campaña</CardTitle>
          {withData.length === 0 ? (
            <EmptyState title="Aún no hay resultados registrados">
              Registra prospectos atribuidos a una campaña (Prospectos y resultados) o captura resultados en la campaña.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Campaña</th>
                    <th className="py-2 pr-3 font-medium">Publicadas</th>
                    <th className="py-2 pr-3 font-medium">Prospectos atribuidos</th>
                    <th className="py-2 pr-3 font-medium">Citas</th>
                    <th className="py-2 pr-3 font-medium">Clientes</th>
                    <th className="py-2 pr-3 font-medium">Ventas</th>
                    <th className="py-2 pr-3 font-medium">Costo por cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {withData.map((s) => (
                    <tr key={s.campaignId}>
                      <td className="py-2 pr-3">
                        <Link href={`/campanas/${s.campaignId}`} className="hover:underline">
                          {name.get(s.campaignId!)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {s.published.platform} Meta · {s.published.manual} a mano
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{s.leads}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.appointments + s.manual.appointments}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.customers + s.manual.customers}</td>
                      <td className="py-2 pr-3 tabular-nums">{formatCents(s.revenueCents + s.manual.revenueCents)}</td>
                      <td className="py-2 pr-3 tabular-nums">{s.costPerCustomerCents === null ? "— (sin gasto registrado)" : formatCents(s.costPerCustomerCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-faint">
            Citas, clientes y ventas suman los prospectos atribuidos y los resultados capturados en cada campaña. Una
            coincidencia en el tiempo no prueba que la campaña los causó.
          </p>
        </Card>
        <Notice tone="warn" title="Alcance e interacciones: pendiente">
          Leer alcance, impresiones e interacciones requiere los permisos de estadísticas de Meta (read_insights /
          instagram_manage_insights) y una cuenta conectada. Todavía no está conectada, así que aquí no se muestran cifras
          de alcance: no se inventan.
        </Notice>
      </div>
    </>
  );
}
