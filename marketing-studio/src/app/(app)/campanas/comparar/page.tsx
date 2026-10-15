import Link from "next/link";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { listCampaigns, listExperimentsForComparison } from "@/lib/data/director";
import { recommendations, totals } from "@/lib/director/experiments";
import { formatCents } from "@/lib/money";
import { Card, CardTitle, EmptyState, Notice, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Comparar campañas" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const selected = businesses.find((b) => b.slug === sp.negocio);
  const [campaigns, experiments] = await Promise.all([listCampaigns({ businessId: selected?.id }), listExperimentsForComparison(selected?.id)]);
  const bizName = new Map(businesses.map((b) => [b.id, b.name]));
  const rows = campaigns
    .map((c) => ({ c, exps: experiments.filter((e) => e.campaign_id === c.id) }))
    .filter((r) => r.exps.length > 0)
    .map((r) => ({ ...r, t: totals(r.exps) }));
  const advice = recommendations(rows.map((r) => ({ label: r.c.name, rows: r.exps })));

  return (
    <>
      <Link href="/campanas" className="text-sm text-muted hover:text-ink">
        ← Campañas
      </Link>
      <PageHeader title="Comparar resultados" description="Resultados registrados a mano por campaña. Sirve para decidir qué probar después." />
      <form method="get" className="mb-4 flex gap-2" aria-label="Filtrar por negocio">
        <select name="negocio" defaultValue={selected?.slug ?? ""} className="input min-h-10 max-w-xs py-1.5 text-sm" aria-label="Negocio">
          <option value="">Todos los negocios</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <button className={buttonClass("secondary", "min-h-10")}>Filtrar</button>
      </form>
      <Notice tone="warn" title="Correlación no es causalidad">
        Comparar negocios distintos o semanas distintas mezcla muchos factores (temporada, quincena, clima). Compara sobre
        todo variantes de un mismo negocio en periodos parecidos.
      </Notice>
      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="Sin resultados registrados">Registra resultados en la pestaña Experimentos de cada campaña.</EmptyState>
        </div>
      ) : (
        <>
          <Card className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Totales por campaña</caption>
              <thead className="text-xs text-muted">
                <tr className="border-b border-line">
                  <th className="py-2 pr-3 font-medium">Campaña</th>
                  <th className="px-2 font-medium">Mensajes</th>
                  <th className="px-2 font-medium">Citas</th>
                  <th className="px-2 font-medium">Clientes</th>
                  <th className="px-2 font-medium">Ventas</th>
                  <th className="px-2 font-medium">Ingresos</th>
                  <th className="px-2 font-medium">Inversión</th>
                  <th className="px-2 font-medium">Costo por cita</th>
                  <th className="px-2 font-medium">Mensaje → cita</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, t, exps }) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/campanas/${c.id}?tab=experimentos`} className="font-medium hover:text-action-strong">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {bizName.get(c.business_id)} · {exps.length} registro(s)
                      </span>
                    </td>
                    <td className="px-2 tabular-nums">{t.messages}</td>
                    <td className="px-2 tabular-nums">{t.appointments}</td>
                    <td className="px-2 tabular-nums">{t.customers}</td>
                    <td className="px-2 tabular-nums">{t.sales_count}</td>
                    <td className="px-2 tabular-nums">{formatCents(t.revenue_cents)}</td>
                    <td className="px-2 tabular-nums">{formatCents(t.ad_spend_cents)}</td>
                    <td className="px-2 tabular-nums">{t.costPerAppointmentCents === null ? "—" : formatCents(t.costPerAppointmentCents)}</td>
                    <td className="px-2 tabular-nums">{pct(t.messageToAppointment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="mt-4">
            <CardTitle>Qué probar después</CardTitle>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted">
              {advice.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}
