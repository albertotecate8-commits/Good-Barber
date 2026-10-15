import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { getReportDetail } from "@/lib/data/director";
import { listBusinesses } from "@/lib/data/businesses";
import { formatDateTime } from "@/lib/dates";
import { ASSISTED_SOURCES } from "@/lib/research/providers/assisted";
import { SOURCE_LABELS, SOURCE_TYPES } from "@/lib/research/types";
import { ActionForm, FieldError } from "@/components/action-form";
import { FindingList } from "@/components/director/finding-list";
import { ProviderRuns } from "@/components/director/provider-runs";
import { Card, CardTitle, Field } from "@/components/ui";
import { addManualFinding, deleteFinding } from "../actions";

export const metadata = { title: "Investigación" };

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ report, findings, campaigns }, businesses] = await Promise.all([getReportDetail(id), listBusinesses()]);
  const business = businesses.find((b) => b.id === report.business_id);
  const query = {
    businessName: business?.name ?? "",
    sector: business?.sector ?? "",
    city: report.city || business?.city || "Durango",
    keywords: report.keywords,
    start: "",
    end: "",
  };

  return (
    <>
      <Link href="/investigacion" className="text-sm text-muted hover:text-ink">
        ← Investigación
      </Link>
      <header className="mb-5 mt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gold">{business?.name}</p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{report.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {formatDateTime(report.created_at)} · Palabras clave: {report.keywords.join(", ") || "—"}
        </p>
        {campaigns.length > 0 && (
          <p className="mt-1 text-sm">
            Usada en:{" "}
            {campaigns.map((c, i) => (
              <span key={c.id}>
                {i > 0 && ", "}
                <Link href={`/campanas/${c.id}`} className="text-action-strong hover:underline">
                  {c.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle>Fuentes consultadas automáticamente</CardTitle>
            <ProviderRuns runs={report.provider_runs} />
          </Card>
          <Card>
            <CardTitle>Hallazgos ({findings.length})</CardTitle>
            <FindingList findings={findings} onDelete={(fid) => deleteFinding.bind(null, fid, report.id)} />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardTitle>Fuentes asistidas</CardTitle>
            <p className="mb-3 text-sm text-muted">Ábrelas en tu navegador y registra abajo lo que encuentres, con su enlace.</p>
            <ul className="flex flex-col gap-3">
              {ASSISTED_SOURCES.map((s) => (
                <li key={s.id} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted">{s.why}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {s.links(query).map((l) => (
                      <li key={l.url}>
                        <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-action-strong hover:underline">
                          {l.label} <ExternalLink className="size-3 shrink-0" aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>Registrar hallazgo manual</CardTitle>
            <ActionForm action={addManualFinding.bind(null, report.id)} submitLabel="Registrar hallazgo" resetOnSuccess>
              <Field label="Fuente" name="source_type">
                <select id="source_type" name="source_type" className="input" defaultValue="meta_ad_library">
                  {SOURCE_TYPES.filter((t) => t !== "business_data" && t !== "calendar").map((t) => (
                    <option key={t} value={t}>
                      {SOURCE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre de la fuente" name="source_name" hint="Ej. Página de Barbería X en la Biblioteca de anuncios">
                <input id="source_name" name="source_name" className="input" maxLength={160} />
              </Field>
              <FieldError name="source_name" />
              <Field label="Enlace (https)" name="url">
                <input id="url" name="url" className="input" inputMode="url" placeholder="https://…" />
              </Field>
              <FieldError name="url" />
              <Field label="Fecha de consulta" name="consulted_on" hint="Vacío = hoy">
                <input id="consulted_on" name="consulted_on" type="date" className="input" />
              </Field>
              <FieldError name="consulted_on" />
              <Field label="Hallazgo" name="summary">
                <textarea id="summary" name="summary" className="input" maxLength={2000} placeholder="Qué viste, en una o dos frases" />
              </Field>
              <FieldError name="summary" />
              <Field label="Evidencia" name="evidence" hint="Texto copiado, fecha del anuncio, número de reseñas…">
                <textarea id="evidence" name="evidence" className="input" maxLength={4000} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nivel de evidencia" name="evidence_level">
                  <select id="evidence_level" name="evidence_level" className="input" defaultValue="observation">
                    <option value="fact">Hecho comprobado</option>
                    <option value="observation">Observación</option>
                    <option value="hypothesis">Hipótesis</option>
                  </select>
                </Field>
                <Field label="Confianza" name="confidence">
                  <select id="confidence" name="confidence" className="input" defaultValue="medium">
                    <option value="high">Alta</option>
                    <option value="medium">Media</option>
                    <option value="low">Baja</option>
                  </select>
                </Field>
              </div>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
