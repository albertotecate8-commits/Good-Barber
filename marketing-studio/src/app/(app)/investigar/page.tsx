import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { getActiveBusiness } from "@/lib/data/shell";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { ASSISTED_SOURCES } from "@/lib/research/providers/assisted";
import { defaultKeywords } from "@/lib/research/keywords";
import { SOURCE_LABELS, type SourceType } from "@/lib/research/types";
import { ActionForm, FieldError } from "@/components/action-form";
import { ButtonLink, Card, CardTitle, EmptyState, Field, PageHeader } from "@/components/ui";
import { ReferenceAnalyzer } from "@/components/studio/reference-analyzer";
import { FindingActions } from "@/components/studio/finding-actions";
import { createReport } from "../investigacion/actions";

export const metadata = { title: "Investigar" };

// Cómo se etiqueta cada conclusión (lo verificado nunca se mezcla con lo interpretado).
const LEVEL = {
  fact: { label: "Verificado", tone: "bg-positive-soft text-positive", hint: "Dato con fuente comprobable" },
  observation: { label: "Interpretación", tone: "bg-warn-soft text-warn", hint: "Lo que se observó o se deduce de la fuente" },
  hypothesis: { label: "Hipótesis", tone: "bg-surface-3 text-muted", hint: "Idea por comprobar" },
} as const;

export default async function InvestigatePage({ searchParams }: { searchParams: Promise<{ q?: string; informe?: string }> }) {
  const [, sp, { active }] = await Promise.all([requireUser(), searchParams, getActiveBusiness()]);
  if (!active)
    return (
      <>
        <PageHeader title="Investigar" />
        <EmptyState icon={Building2} title="Primero agrega un negocio" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
      </>
    );
  const supabase = await createClient();
  const [{ data: biz }, { data: findings }, { data: reports }, { data: saved }] = await Promise.all([
    supabase.from("mkt_businesses").select("name,sector,city").eq("id", active.id).maybeSingle(),
    supabase
      .from("mkt_research_findings")
      .select("id,report_id,source_type,source_name,url,consulted_at,summary,evidence_level,confidence")
      .eq("business_id", active.id)
      .order("consulted_at", { ascending: false })
      .limit(40),
    supabase.from("mkt_research_reports").select("id,title,created_at").eq("business_id", active.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("mkt_memory").select("source_ref").eq("business_id", active.id).eq("kind", "research_insight"),
  ]);
  const savedIds = new Set((saved ?? []).map((m) => m.source_ref));
  const keywords = defaultKeywords(biz?.sector ?? "");
  const query = { businessName: active.name, sector: biz?.sector ?? "", city: biz?.city || "Durango", keywords, start: "", end: "" };
  const fresh = sp.informe ? (findings ?? []).filter((f) => f.report_id === sp.informe).length : null;

  return (
    <>
      <PageHeader
        eyebrow={active.name}
        title="Investigar"
        description="Tendencias, anuncios de la competencia y mercado local, con enlace y fecha. Lo verificado, lo interpretado y lo recomendado van siempre separados."
      />

      {fresh !== null && (
        <p role="status" className="mb-4 rounded-2xl bg-action-soft p-3 text-sm text-action-strong">
          Investigación terminada: {fresh} conclusión(es) nuevas abajo. Las fuentes que no respondieron se ven en el{" "}
          <Link className="underline" href={`/investigacion/${sp.informe}`}>
            informe completo
          </Link>
          .
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card aria-labelledby="mercado">
          <CardTitle>
            <span id="mercado">Investigar el mercado</span>
          </CardTitle>
          <ActionForm action={createReport} submitLabel="Investigar ahora" pendingLabel="Consultando fuentes…">
            <input type="hidden" name="business_id" value={active.id} />
            <input type="hidden" name="volver" value="investigar" />
            <Field label="Qué quieres saber" name="title">
              <input id="title" name="title" className="input" defaultValue={sp.q ? sp.q.slice(0, 160) : `Tendencias y competencia de ${active.name}`} maxLength={160} />
            </Field>
            <FieldError name="title" />
            <Field label="Palabras clave" name="keywords" hint="Separadas por comas. Vacío = según el giro.">
              <input id="keywords" name="keywords" className="input" placeholder={keywords.join(", ")} />
            </Field>
            <Field label="Periodo (días)" name="days">
              <input id="days" name="days" type="number" min={1} max={90} defaultValue={30} className="input" />
            </Field>
            <FieldError name="days" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="automatic" defaultChecked className="size-4 accent-[var(--action)]" /> Consultar fuentes automáticas gratuitas
            </label>
          </ActionForm>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">Anuncios de la competencia y fuentes para revisar a mano</summary>
            <p className="mt-2 text-xs text-muted">Se abren en tu navegador (sin extraer datos de esas páginas). Registra lo que veas con su enlace en el informe.</p>
            <ul className="mt-2 flex flex-col gap-2">
              {ASSISTED_SOURCES.map((s) => (
                <li key={s.id} className="rounded-xl border border-line p-2.5">
                  <p className="font-medium">{s.name}</p>
                  {s.links(query).map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-xs text-action-strong hover:underline">
                      {l.label} <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ))}
                </li>
              ))}
            </ul>
            {reports?.[0] && (
              <Link href={`/investigacion/${reports[0].id}`} className="mt-3 inline-block text-sm font-medium text-action-strong underline">
                Registrar un hallazgo manual en «{reports[0].title}»
              </Link>
            )}
          </details>
        </Card>

        <Card aria-labelledby="diseno">
          <CardTitle>
            <span id="diseno">Analizar un diseño</span>
          </CardTitle>
          <p className="mb-3 text-sm text-muted">
            Sube un anuncio que te guste. Se mide su paleta, luz y composición; tú (o ChatGPT) describes la tipografía, el estilo y el enfoque comercial. Guárdalo como estilo y crea algo así para {active.name}.
          </p>
          <ReferenceAnalyzer businessId={active.id} businessName={active.name} />
        </Card>
      </div>

      <section aria-labelledby="conclusiones" className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 id="conclusiones" className="text-lg font-semibold">
            Conclusiones con fuente
          </h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {Object.values(LEVEL).map((l) => (
              <li key={l.label} className={`rounded-full px-2 py-0.5 font-medium ${l.tone}`} title={l.hint}>
                {l.label}: {l.hint.toLowerCase()}
              </li>
            ))}
            <li className="rounded-full bg-action-soft px-2 py-0.5 font-medium text-action-strong">Recomendación: lo que propone el estudio, por probar</li>
          </ul>
        </div>
        {findings?.length ? (
          <ul className="grid gap-3 md:grid-cols-2">
            {findings.map((f) => {
              const lv = LEVEL[f.evidence_level as keyof typeof LEVEL] ?? LEVEL.hypothesis;
              return (
                <li key={f.id} className="surface-raised flex flex-col gap-2 rounded-2xl border border-line/70 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${lv.tone}`}>{lv.label}</span>
                    <span className="text-muted">
                      {SOURCE_LABELS[f.source_type as SourceType] ?? f.source_name} · consultado {String(f.consulted_at).slice(0, 10)} · confianza {f.confidence === "high" ? "alta" : f.confidence === "medium" ? "media" : "baja"}
                    </span>
                  </div>
                  <p className="text-sm">{f.summary}</p>
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-action-strong hover:underline">
                      {f.source_name} <ExternalLink className="size-3 shrink-0" aria-hidden />
                    </a>
                  ) : (
                    <p className="text-xs text-muted">Fuente: {f.source_name}</p>
                  )}
                  <FindingActions findingId={f.id} saved={savedIds.has(f.id)} idea={`Haz tres anuncios para ${active.name} basados en esta conclusión (${lv.label.toLowerCase()}): ${f.summary}`.slice(0, 480)} />
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState title="Aún no hay conclusiones">Investiga el mercado arriba: cada conclusión llega con su fuente, enlace y fecha.</EmptyState>
        )}
      </section>
    </>
  );
}
