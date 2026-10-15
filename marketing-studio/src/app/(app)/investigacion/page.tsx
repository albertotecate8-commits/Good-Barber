import Link from "next/link";
import { listBusinesses } from "@/lib/data/businesses";
import { listReports } from "@/lib/data/director";
import { formatDateTime } from "@/lib/dates";
import { ActionForm, FieldError } from "@/components/action-form";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, Field, Notice, PageHeader } from "@/components/ui";
import { createReport } from "./actions";

export const metadata = { title: "Investigación" };

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  const sp = await searchParams;
  const businesses = await listBusinesses();
  const selected = businesses.find((b) => b.slug === sp.negocio);
  const reports = await listReports({ businessId: selected?.id });
  const nameOf = new Map(businesses.map((b) => [b.id, b.name]));

  return (
    <>
      <PageHeader title="Investigación de mercado" description="Hallazgos con fuente, enlace, fecha de consulta y nivel de confianza. Prioridad: Durango." />
      <Notice tone="gold" title="Cómo se investiga">
        Automático: datos de tu negocio, calendario comercial verificado, OpenStreetMap, búsqueda web (Tavily, si está
        configurada) y tendencias de Google. Asistido: Biblioteca de anuncios de Meta, Google Maps, Google Trends y TikTok
        Creative Center se abren en tu navegador y registras lo que viste. No se hace scraping.
      </Notice>

      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Primero agrega tus negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle>Investigaciones</CardTitle>
            <form method="get" className="mb-3 flex gap-2" aria-label="Filtrar por negocio">
              <select name="negocio" defaultValue={selected?.slug ?? ""} className="input min-h-10 py-1.5 text-sm" aria-label="Negocio">
                <option value="">Todos los negocios</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button className="rounded-xl border border-line-strong px-3 text-sm">Filtrar</button>
            </form>
            {reports.length === 0 ? (
              <EmptyState title="Aún no hay investigaciones">Crea una aquí o desde el Director de Marketing.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {reports.map((r) => {
                  const ok = r.provider_runs.filter((x) => x.status === "ok").length;
                  const failed = r.provider_runs.filter((x) => x.status === "error").length;
                  return (
                    <li key={r.id}>
                      <Link href={`/investigacion/${r.id}`} className="block py-3 hover:text-action-strong">
                        <span className="block truncate font-medium">{r.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          {nameOf.get(r.business_id)} · {formatDateTime(r.created_at)}
                          <Badge tone="positive">{ok} fuentes consultadas</Badge>
                          {failed > 0 && <Badge tone="danger">{failed} con error</Badge>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle>Nueva investigación</CardTitle>
            <ActionForm action={createReport} submitLabel="Investigar" pendingLabel="Consultando fuentes…">
              <Field label="Negocio" name="business_id">
                <select id="business_id" name="business_id" className="input" defaultValue={selected?.id}>
                  {businesses.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <FieldError name="business_id" />
              <Field label="Título" name="title">
                <input id="title" name="title" className="input" defaultValue="Competencia y temporada" maxLength={160} />
              </Field>
              <FieldError name="title" />
              <Field label="Palabras clave" name="keywords" hint="Separadas por comas. Vacío = según el sector.">
                <input id="keywords" name="keywords" className="input" placeholder="barbería, fade, barba" />
              </Field>
              <Field label="Periodo a analizar (días)" name="days">
                <input id="days" name="days" type="number" min={1} max={90} defaultValue={30} className="input" />
              </Field>
              <FieldError name="days" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="automatic" defaultChecked className="size-4 accent-[var(--action)]" /> Consultar fuentes automáticas
              </label>
            </ActionForm>
          </Card>
        </div>
      )}
    </>
  );
}
