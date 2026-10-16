import Link from "next/link";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { todayInTz } from "@/lib/tz";
import { summarizeLeads, type LeadRow } from "@/lib/analytics";
import { ATTRIBUTION_LABELS, LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/validation/lead";
import { Badge, Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/business-forms";
import { ImportLeadsForm, LeadStatusForm, NewLeadForm } from "@/components/lead-forms";
import { createLead, deleteLead, importLeads, updateLead } from "./actions";

export const metadata = { title: "Prospectos y resultados" };

const CSV_TEMPLATE =
  "fecha,nombre,contacto,origen,estado,monto,campaña,notas\n16/10/2026,Juan,@juan,Instagram,cliente,$170,,Corte y barba\n16/10/2026,,••42,WhatsApp,cita,,,Preguntó por cejas\n";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const business = businesses.find((b) => b.slug === sp.negocio) ?? businesses[0];
  const supabase = await createClient();
  const [{ data: leads }, { data: campaigns }] = business
    ? await Promise.all([
        supabase.from("mkt_leads").select("*").eq("business_id", business.id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(300),
        supabase.from("mkt_campaigns").select("id,name").eq("business_id", business.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const summary = summarizeLeads((leads ?? []) as LeadRow[]);
  const campaignName = new Map((campaigns ?? []).map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader title="Prospectos y resultados" description="Mensajes, citas y ventas que registras o importas, separados por negocio." />
      <div className="mb-4">
        <Notice tone="gold" title="Qué es automático y qué no">
          La app no lee tus bandejas de Instagram, Facebook o WhatsApp: Meta exige permisos de mensajería con revisión de
          la app para eso. Aquí registras o importas (CSV) los prospectos y ventas reales. La app de citas de Good Barber no
          se conecta: si quieres usar sus datos, expórtalos a una hoja de cálculo e impórtalos aquí.
        </Notice>
      </div>
      {businesses.length === 0 ? (
        <EmptyState title="Aún no hay negocios" />
      ) : (
        <>
          <nav aria-label="Negocio" className="mb-4 flex flex-wrap gap-2">
            {businesses.map((b) => (
              <Link
                key={b.id}
                href={`/mensajes?negocio=${b.slug}`}
                aria-current={b.id === business?.id ? "page" : undefined}
                className="rounded-full border border-line px-3 py-1.5 text-sm aria-[current=page]:border-action aria-[current=page]:font-medium"
              >
                {b.name}
              </Link>
            ))}
          </nav>
          {business && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="flex min-w-0 flex-col gap-4">
                <Card>
                  <CardTitle>Resumen de {business.name}</CardTitle>
                  <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="text-xs text-muted">Prospectos</dt>
                      <dd className="text-xl font-semibold tabular-nums">{summary.total}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Con cita</dt>
                      <dd className="text-xl font-semibold tabular-nums">{summary.byStatus.appointment}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Clientes</dt>
                      <dd className="text-xl font-semibold tabular-nums">{summary.byStatus.customer}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Ventas registradas</dt>
                      <dd className="text-xl font-semibold tabular-nums">{formatCents(summary.revenueCents)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-faint">
                    Atribuidos a una campaña: {summary.attributed} · sin atribuir: {summary.unattributed}. Solo cuenta como atribuido
                    lo que registraste así.
                  </p>
                </Card>
                <Card>
                  <CardTitle>Registro</CardTitle>
                  {(leads ?? []).length === 0 ? (
                    <EmptyState title="Sin prospectos registrados">Registra el primero o importa un CSV.</EmptyState>
                  ) : (
                    <ul className="divide-y divide-line">
                      {(leads ?? []).map((l) => {
                        const label = l.contact_name || l.contact_hint || LEAD_SOURCE_LABELS[l.source as keyof typeof LEAD_SOURCE_LABELS];
                        return (
                          <li key={l.id} className="flex flex-col gap-2 py-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium">{label}</span>
                              <Badge tone={l.status === "customer" ? "positive" : l.status === "lost" ? "neutral" : "action"}>
                                {LEAD_STATUS_LABELS[l.status as LeadStatus]}
                              </Badge>
                              {l.value_cents !== null && <span className="tabular-nums">{formatCents(l.value_cents)}</span>}
                            </div>
                            <p className="text-xs text-muted">
                              {formatDate(l.occurred_on)} · {LEAD_SOURCE_LABELS[l.source as keyof typeof LEAD_SOURCE_LABELS]}
                              {l.campaign_id && ` · ${campaignName.get(l.campaign_id) ?? "Campaña"} (${ATTRIBUTION_LABELS[l.attribution as keyof typeof ATTRIBUTION_LABELS].toLowerCase()})`}
                            </p>
                            {l.notes && <p className="text-xs text-faint">{l.notes}</p>}
                            <div className="flex flex-wrap items-end gap-2">
                              <LeadStatusForm action={updateLead.bind(null, l.id)} status={l.status} label={label} />
                              <ConfirmButton action={deleteLead.bind(null, l.id)} confirmText="¿Borrar este prospecto?" variant="ghost">
                                Borrar
                              </ConfirmButton>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </div>
              <div className="flex flex-col gap-4">
                <Card>
                  <CardTitle>Nuevo prospecto</CardTitle>
                  <NewLeadForm action={createLead} businessId={business.id} campaigns={campaigns ?? []} today={todayInTz()} />
                </Card>
                <Card>
                  <CardTitle>Importar CSV</CardTitle>
                  <p className="mb-2 text-xs text-muted">
                    Columnas: fecha, nombre, contacto, origen, estado, monto, campaña, notas (coma o punto y coma). Si una fila tiene
                    errores no se importa nada. Las campañas deben ser de {business.name}.
                  </p>
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
                    download="plantilla-prospectos.csv"
                    className="mb-3 inline-block text-sm text-action-strong hover:underline"
                  >
                    Descargar plantilla
                  </a>
                  <ImportLeadsForm action={importLeads.bind(null, business.id)} />
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
