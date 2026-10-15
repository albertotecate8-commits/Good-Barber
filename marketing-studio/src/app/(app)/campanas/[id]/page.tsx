import Link from "next/link";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCampaignDetail } from "@/lib/data/director";
import { listBusinesses } from "@/lib/data/businesses";
import { listAssetOptions } from "@/lib/data/assets";
import { BASIS_LABELS, GOAL_LABELS, PLAN_SOURCE_LABELS, reelScriptText, type Basis } from "@/lib/director/plan";
import { ASSISTED_TOOLS, imagePrompt, reelPrompt, strategyPrompt } from "@/lib/director/prompts";
import { geminiUnavailableReason } from "@/lib/director/gemini";
import { loadBusinessContext } from "@/lib/director/server";
import { recommendations, totals } from "@/lib/director/experiments";
import { CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from "@/lib/campaign-labels";
import { CONTENT_STATUS_LABELS, CONTENT_STATUS_TONES, FORMAT_LABELS } from "@/lib/content-labels";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { todayInTz } from "@/lib/tz";
import { ActionForm, FieldError } from "@/components/action-form";
import { ConfirmButton } from "@/components/business-forms";
import { CopyTextButton } from "@/components/content-extras";
import { BasisBadge } from "@/components/director/badges";
import { FindingList } from "@/components/director/finding-list";
import { ProviderRuns } from "@/components/director/provider-runs";
import { Badge, Card, CardTitle, EmptyState, Field, Notice } from "@/components/ui";
import {
  addExperiment,
  createDraftsFromPlan,
  deleteCampaign,
  deleteExperiment,
  importPlan,
  regenerateWithGemini,
  updateCampaignMeta,
  updatePlanText,
} from "../actions";

export const metadata = { title: "Campaña" };

const TABS = [
  ["resumen", "Estrategia"],
  ["anuncios", "Anuncios y Reel"],
  ["calendario", "Calendario"],
  ["ia", "IA asistida"],
  ["experimentos", "Experimentos"],
  ["editar", "Editar"],
] as const;
type Tab = (typeof TABS)[number][0];

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; nueva?: string }> };

function Section({ title, basis, text }: { title: string; basis: Basis; text: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <BasisBadge basis={basis} />
      </div>
      <p className="whitespace-pre-line break-words text-sm text-muted">{text}</p>
    </div>
  );
}

export default async function CampaignPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as Tab) : "resumen";
  const detail = await getCampaignDetail(id);
  const { campaign, plan, error: planError, findings, linkedFindingIds, experiments, content, report } = detail;
  const [businesses, assetOptions] = await Promise.all([listBusinesses(), listAssetOptions()]);
  const business = businesses.find((b) => b.id === campaign.business_id);
  const assets = assetOptions.filter((a) => a.business_id === campaign.business_id);
  const geminiReason = geminiUnavailableReason(process.env);

  // Contexto para los prompts asistidos (solo en la pestaña que los muestra).
  const ctx = tab === "ia" || tab === "anuncios" ? await loadBusinessContext(await createClient(), campaign.business_id, todayInTz()) : null;
  const t = totals(experiments);
  const byVariant = [...new Set(experiments.map((e) => e.variant || "Sin variante"))].map((label) => ({
    label,
    rows: experiments.filter((e) => (e.variant || "Sin variante") === label),
  }));

  return (
    <>
      <Link href="/campanas" className="text-sm text-muted hover:text-ink">
        ← Campañas
      </Link>
      <header className="mb-4 mt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gold">
          {business?.name} · {campaign.goal ? GOAL_LABELS[campaign.goal] : campaign.objective}
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{campaign.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone="action">{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
          {formatDate(campaign.starts_on)} – {formatDate(campaign.ends_on)}
          <Badge>{PLAN_SOURCE_LABELS[campaign.plan_source]}</Badge>
          {campaign.plan_version > 1 && <Badge>Versión {campaign.plan_version}</Badge>}
        </p>
        {campaign.instruction && <p className="mt-2 break-words text-sm italic text-muted">«{campaign.instruction}»</p>}
      </header>

      {sp.nueva === "1" && (
        <div className="mb-4" role="status">
          <Notice tone="positive" title="Campaña preparada como borrador">
            Revisa la estrategia y las advertencias. Nada se publicó ni se generaron imágenes o videos: los prompts están en
            «IA asistida».
          </Notice>
        </div>
      )}

      <nav aria-label="Secciones de la campaña" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={`/campanas/${campaign.id}?tab=${key}`}
                aria-current={tab === key ? "page" : undefined}
                scroll={false}
                className={clsx(
                  "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm",
                  tab === key ? "border-gold font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {planError && (
        <Notice tone="danger" title="El plan guardado no es válido">
          {planError}. Puedes reemplazarlo importando un plan en «IA asistida».
        </Notice>
      )}
      {!plan && !planError && tab !== "editar" && tab !== "experimentos" && (
        <EmptyState title="Esta campaña no tiene plan">Créala con el Director o importa un plan en «IA asistida».</EmptyState>
      )}

      {/* ---------------- Estrategia ---------------- */}
      {tab === "resumen" && plan && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            {plan.warnings.length > 0 && (
              <Notice tone="warn" title="Advertencias">
                <ul className="list-inside list-disc space-y-1">
                  {plan.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <Card>
              <CardTitle>Estrategia</CardTitle>
              <div className="flex flex-col gap-3">
                <Section title="Problema u oportunidad" basis={plan.opportunity.basis} text={plan.opportunity.text} />
                <Section title="Público objetivo" basis={plan.audience.basis} text={plan.audience.text} />
                <Section title="Oferta propuesta" basis={plan.offer.basis} text={plan.offer.text} />
                <Section title="Concepto visual" basis={plan.visual_concept.basis} text={plan.visual_concept.text} />
              </div>
            </Card>
            <Card>
              <CardTitle>Indicadores de éxito y medición</CardTitle>
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {plan.kpis.map((k) => (
                  <li key={k.name} className="rounded-xl border border-line bg-surface-2 p-3">
                    <p className="font-medium">{k.name}</p>
                    {k.how_to_measure && <p className="text-muted">{k.how_to_measure}</p>}
                    {k.target_note && <p className="text-xs text-faint">{k.target_note}</p>}
                  </li>
                ))}
              </ul>
              <p className="whitespace-pre-line text-sm text-muted">{plan.measurement}</p>
            </Card>
            <Card>
              <CardTitle>Evidencia ({findings.length} hallazgos)</CardTitle>
              <p className="mb-3 text-xs text-faint">
                Niveles: {Object.values(BASIS_LABELS).join(" · ")}. Los hallazgos citados por la estrategia están marcados.
              </p>
              <FindingList findings={findings} highlight={linkedFindingIds} />
            </Card>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardTitle>Tareas</CardTitle>
              <ol className="flex flex-col gap-2 text-sm">
                {plan.tasks.map((task) => (
                  <li key={task.kind + task.label} className="flex flex-col gap-1">
                    <span className="flex items-start justify-between gap-2">
                      <span>{task.label}</span>
                      <Badge tone={task.status === "done" ? "positive" : task.status === "manual_pending" ? "warn" : "neutral"}>
                        {task.status === "done" ? "Hecho" : task.status === "manual_pending" ? "Pendiente manual" : "Omitido"}
                      </Badge>
                    </span>
                    {task.note && <span className="text-xs text-faint">{task.note}</span>}
                  </li>
                ))}
              </ol>
            </Card>
            {report && (
              <Card>
                <CardTitle>
                  <Link href={`/investigacion/${report.id}`} className="hover:text-action-strong">
                    Fuentes consultadas
                  </Link>
                </CardTitle>
                <ProviderRuns runs={report.provider_runs} />
                <Link href={`/investigacion/${report.id}`} className="mt-2 inline-block text-sm text-action-strong hover:underline">
                  Agregar hallazgos manuales →
                </Link>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Anuncios y Reel ---------------- */}
      {tab === "anuncios" && plan && (
        <div className="flex flex-col gap-4">
          <ol className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {plan.ads.map((ad, i) => (
              <li key={i} className="min-w-0">
                <Card className="h-full">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                      Anuncio {i + 1}: {ad.angle}
                    </h3>
                    <BasisBadge basis={ad.basis} />
                  </div>
                  <p className="text-xs text-faint">
                    {PLATFORM_LABELS[ad.platform as keyof typeof PLATFORM_LABELS] ?? ad.platform} · {FORMAT_LABELS[ad.format]}
                  </p>
                  <dl className="mt-2 flex flex-col gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Título</dt>
                      <dd className="break-words font-medium">{ad.headline}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Texto principal</dt>
                      <dd className="whitespace-pre-line break-words">{ad.primary_text}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Llamada a la acción</dt>
                      <dd>{ad.cta}</dd>
                    </div>
                    {ad.asset_hint && (
                      <div>
                        <dt className="text-xs text-muted">Recurso</dt>
                        <dd className="text-muted">{ad.asset_hint}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyTextButton text={`${ad.headline}\n\n${ad.primary_text}`} />
                  </div>
                  {ad.visual_prompt && ctx && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer text-action-strong">Prompt de imagen (solo texto, no se generó ninguna imagen)</summary>
                      <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-xs text-muted">{imagePrompt(ctx, plan, i)}</p>
                      <div className="mt-2">
                        <CopyTextButton text={imagePrompt(ctx, plan, i)} />
                      </div>
                    </details>
                  )}
                </Card>
              </li>
            ))}
          </ol>
          {plan.reel && (
            <Card>
              <CardTitle>Guion de Reel ({plan.reel.duration_seconds} s)</CardTitle>
              <p className="mb-3 text-sm">
                <span className="text-muted">Gancho:</span> {plan.reel.hook}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-2 font-medium">Segundos</th>
                      <th className="px-2 font-medium">Toma</th>
                      <th className="px-2 font-medium">Texto en pantalla</th>
                      <th className="px-2 font-medium">Voz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.reel.scenes.map((s, i) => (
                      <tr key={i} className="border-b border-line align-top last:border-0">
                        <td className="py-2 pr-2 tabular-nums">{s.seconds}</td>
                        <td className="px-2">{s.shot}</td>
                        <td className="px-2">{s.on_screen_text}</td>
                        <td className="px-2">{s.voiceover}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">
                <span className="text-muted">Texto de la publicación:</span> {plan.reel.caption}
              </p>
              <p className="mt-2 text-xs text-faint">{plan.reel.footage_note}</p>
              <div className="mt-3">
                <CopyTextButton text={`${plan.reel.hook}\n\n${reelScriptText(plan.reel)}\n\n${plan.reel.caption}`} />
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------------- Calendario ---------------- */}
      {tab === "calendario" && plan && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardTitle>Calendario sugerido</CardTitle>
            <Notice tone="gold">
              Crear borradores los agrega al calendario como «Borrador». No se publica nada: la publicación sigue siendo manual.
            </Notice>
            <div className="mt-4">
              <ActionForm action={createDraftsFromPlan.bind(null, campaign.id)} submitLabel="Crear borradores seleccionados" pendingLabel="Creando…">
                <ul className="flex flex-col gap-2">
                  {plan.schedule.map((s, i) => {
                    const ad = s.ad_index !== null ? plan.ads[s.ad_index] : null;
                    return (
                      <li key={i} className="rounded-xl border border-line bg-surface-2 p-3 text-sm">
                        <label className="flex items-start gap-2">
                          <input type="checkbox" name="items" value={i} defaultChecked={!s.content_id} disabled={Boolean(s.content_id)} className="mt-1 size-4 accent-[var(--action)]" />
                          <span className="min-w-0">
                            <span className="block font-medium">
                              {formatDate(s.date)} · {s.time} — {ad ? ad.angle : "Reel"}
                            </span>
                            <span className="block text-xs text-muted">
                              {PLATFORM_LABELS[s.platform as keyof typeof PLATFORM_LABELS] ?? s.platform} · {FORMAT_LABELS[s.is_reel ? "reel" : s.format]} · {s.note}
                            </span>
                          </span>
                        </label>
                        {s.content_id ? (
                          <Link href={`/calendario/${s.content_id}`} className="mt-1 inline-block text-xs text-action-strong hover:underline">
                            Borrador creado → abrir
                          </Link>
                        ) : (
                          <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
                            Recurso de la biblioteca ({business?.name})
                            <select name={`asset_${i}`} className="input min-h-10 py-1.5 text-sm" defaultValue="">
                              <option value="">Sin recurso</option>
                              {assets.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </ActionForm>
            </div>
          </Card>
          <Card>
            <CardTitle>Publicaciones de esta campaña</CardTitle>
            {content.length === 0 ? (
              <p className="text-sm text-muted">Aún no hay borradores.</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {content.map((c) => (
                  <li key={c.id}>
                    <Link href={`/calendario/${c.id}`} className="flex items-center justify-between gap-2 py-2 hover:text-action-strong">
                      <span className="min-w-0">
                        <span className="block truncate">{c.title}</span>
                        <span className="text-xs text-muted">{c.scheduled_at ? formatDateTime(c.scheduled_at) : "Sin fecha"}</span>
                      </span>
                      <Badge tone={CONTENT_STATUS_TONES[c.status]}>{CONTENT_STATUS_LABELS[c.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ---------------- IA asistida ---------------- */}
      {tab === "ia" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>1. Copia el prompt de estrategia</CardTitle>
            <p className="mb-3 text-sm text-muted">
              Incluye tus precios, promociones, marca y hallazgos con fuente. Pégalo en la herramienta que ya pagas; la app no lo
              envía a ningún lado.
            </p>
            {ctx && plan ? (
              <>
                <details>
                  <summary className="cursor-pointer text-sm text-action-strong">Ver prompt</summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface-2 p-3 text-xs text-muted">
                    {strategyPrompt(ctx, findings, campaign.goal ?? "customers", campaign.instruction, plan.ads.length, {
                      start: campaign.starts_on ?? "",
                      end: campaign.ends_on ?? "",
                    })}
                  </pre>
                </details>
                <div className="mt-3">
                  <CopyTextButton
                    text={strategyPrompt(ctx, findings, campaign.goal ?? "customers", campaign.instruction, plan.ads.length, {
                      start: campaign.starts_on ?? "",
                      end: campaign.ends_on ?? "",
                    })}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">Disponible cuando la campaña tiene plan.</p>
            )}
            <ul className="mt-4 flex flex-wrap gap-2">
              {ASSISTED_TOOLS.map((tool) => (
                <li key={tool.id}>
                  <a href={tool.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-2">
                    Abrir {tool.name} <ExternalLink className="size-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
            {ctx && plan?.reel && (
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer text-action-strong">Prompt para Google Flow (toma de ambiente del Reel)</summary>
                <p className="mt-2 whitespace-pre-line break-words rounded-lg bg-surface-2 p-3 text-xs text-muted">{reelPrompt(ctx, plan)}</p>
                <div className="mt-2">
                  <CopyTextButton text={reelPrompt(ctx, plan)} />
                </div>
              </details>
            )}
          </Card>
          <div className="flex flex-col gap-4">
            <Card>
              <CardTitle>2. Importa la respuesta</CardTitle>
              <p className="mb-3 text-sm text-muted">
                Pega aquí lo que respondió la IA. Se valida con el mismo formato y se marcan los precios que no coincidan con los
                registrados.
              </p>
              <ActionForm action={importPlan.bind(null, campaign.id)} submitLabel="Importar y validar" variant="secondary" confirmText="Esto reemplaza el plan actual (se conservan los borradores ya creados). ¿Continuar?">
                <Field label="Respuesta en JSON" name="plan_json">
                  <textarea id="plan_json" name="plan_json" className="input min-h-40 font-mono text-xs" />
                </Field>
                <FieldError name="plan_json" />
              </ActionForm>
            </Card>
            <Card>
              <CardTitle>3. Imágenes y videos generados</CardTitle>
              <p className="text-sm text-muted">
                Súbelos a la Biblioteca indicando su origen «Generado con IA», y después elígelos al crear los borradores.
              </p>
              <Link href={`/biblioteca?negocio=${business?.slug ?? ""}`} className="mt-3 inline-block text-sm text-action-strong hover:underline">
                Ir a la Biblioteca de {business?.name} →
              </Link>
            </Card>
            <Card>
              <CardTitle>Gemini API (opcional)</CardTitle>
              {geminiReason ? (
                <p className="text-sm text-muted">No disponible: {geminiReason} Se configura en el servidor; nunca se activa facturación.</p>
              ) : (
                <ActionForm action={regenerateWithGemini.bind(null, campaign.id)} submitLabel="Regenerar plan con Gemini" variant="secondary" pendingLabel="Consultando Gemini…" confirmText="Esto reemplaza el plan actual. ¿Continuar?">
                  <p className="text-sm text-muted">Usa el nivel gratuito con el tope diario de la app. Si falla, el plan actual no cambia.</p>
                </ActionForm>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ---------------- Experimentos ---------------- */}
      {tab === "experimentos" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardTitle>Resultados registrados</CardTitle>
              {experiments.length === 0 ? (
                <EmptyState title="Sin resultados todavía">Registra lo que pasó con cada variante después de publicarla.</EmptyState>
              ) : (
                <>
                  <dl className="mb-4 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                    {[
                      ["Mensajes", t.messages],
                      ["Citas", t.appointments],
                      ["Clientes", t.customers],
                      ["Ventas", t.sales_count],
                      ["Ingresos", formatCents(t.revenue_cents)],
                      ["Inversión", formatCents(t.ad_spend_cents)],
                    ].map(([label, n]) => (
                      <div key={label} className="rounded-lg bg-surface-2 px-1 py-2">
                        <dd className="text-base font-semibold tabular-nums">{n}</dd>
                        <dt className="text-[11px] text-faint">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <ul className="divide-y divide-line text-sm">
                    {experiments.map((e) => (
                      <li key={e.id} className="flex flex-col gap-1 py-3">
                        <span className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{e.variant || "Sin variante"}</span>
                          <span className="text-xs text-muted">
                            {formatDate(e.published_on)}
                            {e.period_end ? ` – ${formatDate(e.period_end)}` : ""}
                          </span>
                        </span>
                        <span className="text-xs text-muted">Hipótesis: {e.hypothesis}</span>
                        <span className="text-xs tabular-nums">
                          {e.messages} mensajes · {e.appointments} citas · {e.customers} clientes · {e.sales_count} ventas · {formatCents(e.revenue_cents)} ingresos · {formatCents(e.ad_spend_cents)} inversión
                        </span>
                        {e.notes && <span className="text-xs text-faint">{e.notes}</span>}
                        <span>
                          <ConfirmButton action={deleteExperiment.bind(null, e.id, campaign.id)} confirmText="¿Eliminar este registro?" variant="ghost">
                            Eliminar
                          </ConfirmButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
            <Card>
              <CardTitle>Qué probar después</CardTitle>
              <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                {recommendations(byVariant).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Card>
          </div>
          <Card>
            <CardTitle>Registrar resultado</CardTitle>
            <ActionForm action={addExperiment.bind(null, campaign.id)} submitLabel="Registrar" resetOnSuccess>
              <Field label="Hipótesis" name="hypothesis" hint="Ej. Mostrar el precio exacto genera más citas que no mostrarlo">
                <textarea id="hypothesis" name="hypothesis" className="input min-h-20" maxLength={1000} />
              </Field>
              <FieldError name="hypothesis" />
              <Field label="Variante creativa" name="variant">
                <input id="variant" name="variant" className="input" list="variants" maxLength={300} />
              </Field>
              <datalist id="variants">{plan?.ads.map((a) => <option key={a.angle} value={a.angle} />)}</datalist>
              <Field label="Publicación (opcional)" name="content_id">
                <select id="content_id" name="content_id" className="input" defaultValue="">
                  <option value="">Ninguna</option>
                  {content.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Publicada el" name="published_on">
                  <input id="published_on" name="published_on" type="date" className="input" />
                </Field>
                <Field label="Medido hasta" name="period_end">
                  <input id="period_end" name="period_end" type="date" className="input" />
                </Field>
              </div>
              <FieldError name="period_end" />
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["messages", "Mensajes"],
                  ["appointments", "Citas"],
                  ["customers", "Clientes nuevos"],
                  ["sales_count", "Ventas"],
                ].map(([name, label]) => (
                  <div key={name}>
                    <Field label={label} name={name}>
                      <input id={name} name={name} inputMode="numeric" className="input" placeholder="0" />
                    </Field>
                    <FieldError name={name} />
                  </div>
                ))}
                <div>
                  <Field label="Ingresos (MXN)" name="revenue">
                    <input id="revenue" name="revenue" inputMode="decimal" className="input" placeholder="0" />
                  </Field>
                  <FieldError name="revenue" />
                </div>
                <div>
                  <Field label="Inversión en anuncios (MXN)" name="ad_spend">
                    <input id="ad_spend" name="ad_spend" inputMode="decimal" className="input" placeholder="0" />
                  </Field>
                  <FieldError name="ad_spend" />
                </div>
              </div>
              <Field label="Observaciones" name="notes">
                <textarea id="notes" name="notes" className="input" maxLength={4000} />
              </Field>
            </ActionForm>
          </Card>
        </div>
      )}

      {/* ---------------- Editar ---------------- */}
      {tab === "editar" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Datos de la campaña</CardTitle>
            <ActionForm action={updateCampaignMeta.bind(null, campaign.id)} submitLabel="Guardar">
              <Field label="Nombre" name="name">
                <input id="name" name="name" className="input" defaultValue={campaign.name} maxLength={120} />
              </Field>
              <FieldError name="name" />
              <Field label="Estado" name="status">
                <select id="status" name="status" className="input" defaultValue={campaign.status}>
                  {CAMPAIGN_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CAMPAIGN_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Inicio" name="starts_on">
                  <input id="starts_on" name="starts_on" type="date" className="input" defaultValue={campaign.starts_on ?? ""} />
                </Field>
                <Field label="Fin" name="ends_on">
                  <input id="ends_on" name="ends_on" type="date" className="input" defaultValue={campaign.ends_on ?? ""} />
                </Field>
              </div>
              <FieldError name="ends_on" />
              <Field label="Notas" name="notes">
                <textarea id="notes" name="notes" className="input" defaultValue={campaign.notes} maxLength={4000} />
              </Field>
            </ActionForm>
            <div className="mt-6 border-t border-line pt-4">
              <p className="mb-2 text-sm text-muted">Eliminar la campaña borra su plan y sus experimentos. Los borradores del calendario se conservan.</p>
              <ConfirmButton action={deleteCampaign.bind(null, campaign.id)} confirmText="¿Eliminar esta campaña? No se puede deshacer.">
                Eliminar campaña
              </ConfirmButton>
            </div>
          </Card>
          {plan && (
            <Card>
              <CardTitle>Textos del plan</CardTitle>
              <ActionForm action={updatePlanText.bind(null, campaign.id)} submitLabel="Guardar plan">
                {(
                  [
                    ["opportunity", "Problema u oportunidad", plan.opportunity.text],
                    ["audience", "Público objetivo", plan.audience.text],
                    ["offer", "Oferta propuesta", plan.offer.text],
                    ["visual_concept", "Concepto visual", plan.visual_concept.text],
                  ] as const
                ).map(([name, label, value]) => (
                  <Field key={name} label={label} name={name}>
                    <textarea id={name} name={name} className="input min-h-24" defaultValue={value} maxLength={3000} />
                  </Field>
                ))}
                {plan.ads.map((ad, i) => (
                  <fieldset key={i} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <legend className="px-1 text-sm font-medium">
                      Anuncio {i + 1}: {ad.angle}
                    </legend>
                    <Field label="Título" name={`ad_${i}_headline`}>
                      <input id={`ad_${i}_headline`} name={`ad_${i}_headline`} className="input" defaultValue={ad.headline} maxLength={150} />
                    </Field>
                    <Field label="Texto principal" name={`ad_${i}_primary_text`}>
                      <textarea id={`ad_${i}_primary_text`} name={`ad_${i}_primary_text`} className="input" defaultValue={ad.primary_text} maxLength={2200} />
                    </Field>
                    <Field label="Llamada a la acción" name={`ad_${i}_cta`}>
                      <input id={`ad_${i}_cta`} name={`ad_${i}_cta`} className="input" defaultValue={ad.cta} maxLength={80} />
                    </Field>
                    <Field label="Prompt de imagen" name={`ad_${i}_visual_prompt`}>
                      <textarea id={`ad_${i}_visual_prompt`} name={`ad_${i}_visual_prompt`} className="input" defaultValue={ad.visual_prompt} maxLength={3000} />
                    </Field>
                  </fieldset>
                ))}
                {plan.reel && (
                  <fieldset className="flex flex-col gap-2 rounded-xl border border-line p-3">
                    <legend className="px-1 text-sm font-medium">Reel</legend>
                    <Field label="Gancho" name="reel_hook">
                      <input id="reel_hook" name="reel_hook" className="input" defaultValue={plan.reel.hook} maxLength={300} />
                    </Field>
                    <Field label="Escenas" name="reel_script" hint="Una por línea: segundos | toma | texto en pantalla | voz">
                      <textarea id="reel_script" name="reel_script" className="input min-h-32 font-mono text-xs" defaultValue={reelScriptText(plan.reel)} />
                    </Field>
                    <Field label="Texto de la publicación" name="reel_caption">
                      <textarea id="reel_caption" name="reel_caption" className="input" defaultValue={plan.reel.caption} maxLength={2200} />
                    </Field>
                  </fieldset>
                )}
                <Field label="Método de medición" name="measurement">
                  <textarea id="measurement" name="measurement" className="input min-h-32" defaultValue={plan.measurement} maxLength={3000} />
                </Field>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
