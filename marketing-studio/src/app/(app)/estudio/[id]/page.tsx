import Link from "next/link";
import clsx from "clsx";
import { Download, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCreativeProject } from "@/lib/data/creative";
import { listBusinesses } from "@/lib/data/businesses";
import { MATERIAL_LABELS, formatByKey, formatsFor, isVideoMaterial } from "@/lib/creative/formats";
import { defaultDesign, designSchema, type Design } from "@/lib/creative/design";
import type { Concept } from "@/lib/creative/concepts";
import { MANUAL_CHECKS } from "@/lib/creative/qa";
import { buildFfmpegArgs, commandText, renderBlocker, videoPlanSchema } from "@/lib/creative/video";
import { ffmpegStatus } from "@/lib/creative/render";
import { ASSISTED_TOOLS } from "@/lib/director/prompts";
import { formatDateTime } from "@/lib/dates";
import { todayInTz } from "@/lib/tz";
import { ActionForm, FieldError } from "@/components/action-form";
import { ConfirmButton } from "@/components/business-forms";
import { CopyTextButton } from "@/components/content-extras";
import { AssetPreview, assetUrl } from "@/components/asset-preview";
import { CreativeEditor } from "@/components/creative/editor";
import { ImportResult } from "@/components/creative/import-result";
import { QaList } from "@/components/creative/qa-list";
import { VideoPlanEditor } from "@/components/creative/video-plan-editor";
import { Badge, Card, CardTitle, EmptyState, Field, Notice } from "@/components/ui";
import {
  addVersionToCalendar,
  createConcepts,
  deleteProject,
  deleteVersion,
  renderVideoVersion,
  reviewVersion,
  saveVideoPlan,
  unfinalizeVersion,
  updateProject,
} from "../actions";

export const metadata = { title: "Proyecto creativo" };

const KIND_LABELS = { concept: "Concepto (sin imagen)", imported_result: "Resultado importado", code_edit: "Editado con código", video_render: "Montaje FFmpeg" } as const;
const QA_LABELS = { pending: "Sin revisar", passed: "Revisión correcta", passed_with_warnings: "Con advertencias", failed: "Con errores" } as const;
const QA_TONES = { pending: "neutral", passed: "positive", passed_with_warnings: "warn", failed: "danger" } as const;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; desde?: string; concepto?: string; v?: string; comparar?: string | string[] }> };

export default async function ProjectPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { project, versions, assets, campaign, content } = await getCreativeProject(id);
  const businesses = await listBusinesses();
  const business = businesses.find((b) => b.id === project.business_id)!;
  const format = formatByKey(project.format_key)!;
  const video = isVideoMaterial(project.material_type);
  const TABS = [
    ["conceptos", "Conceptos"],
    ["editor", "Editor"],
    ["asistido", "Herramientas externas"],
    ...(video ? [["video", "Video"] as const] : []),
    ["versiones", "Versiones y revisión"],
    ["ajustes", "Ajustes"],
  ] as const;
  const tab = TABS.some(([t]) => t === sp.tab) ? (sp.tab as string) : "conceptos";
  const concepts = versions.filter((v) => v.kind === "concept");
  const withFile = versions.filter((v) => v.asset_id);
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const refs = project.reference_asset_ids.map((rid) => assetById.get(rid)).filter((a): a is NonNullable<typeof a> => Boolean(a));

  // Diseño inicial del editor: versión elegida, concepto elegido o predeterminado.
  let initialDesign: Design | null = null;
  let parentVersionId: string | null = null;
  if (tab === "editor") {
    const from = versions.find((v) => v.id === sp.desde) ?? concepts[0];
    const supabase = await createClient();
    const { data: brand } = await supabase.from("mkt_brand_profiles").select("color_primary,color_background,font_heading,font_body").eq("business_id", project.business_id).maybeSingle();
    const parsed = from?.kind === "code_edit" ? designSchema.safeParse(from.design) : null;
    initialDesign =
      parsed?.success && parsed.data.format_key === format.key
        ? parsed.data
        : defaultDesign({
            format,
            brand,
            concept: from?.kind === "concept" ? (from.concept as Partial<Concept>) : null,
            backgroundAssetId:
              from?.kind === "imported_result" && from.asset_id && assetById.get(from.asset_id)?.mime_type.startsWith("image/")
                ? from.asset_id
                : (refs.find((r) => r.kind === "image" && r.mime_type !== "image/svg+xml")?.id ?? null),
            logoAssetId: assets.find((a) => a.kind === "logo")?.id ?? null,
          });
    parentVersionId = from?.id ?? null;
  }

  const selectedConcept = concepts.find((c) => c.id === sp.concepto) ?? concepts[0];
  const compare = (Array.isArray(sp.comparar) ? sp.comparar : sp.comparar ? [sp.comparar] : []).map((cid) => versions.find((v) => v.id === cid)).filter(Boolean).slice(0, 3) as typeof versions;
  const selected = versions.find((v) => v.id === sp.v);
  const ff = video ? await ffmpegStatus() : null;
  const plan = video ? videoPlanSchema.safeParse(project.video_plan) : null;

  return (
    <>
      <Link href="/estudio" className="text-sm text-muted hover:text-ink">
        ← Estudio creativo
      </Link>
      <header className="mb-4 mt-3">
        <p className="text-xs font-medium uppercase tracking-wider text-gold">
          {business.name} · {MATERIAL_LABELS[project.material_type]}
          {campaign && (
            <>
              {" · "}
              <Link href={`/campanas/${campaign.id}`} className="hover:underline">
                {campaign.name}
              </Link>
            </>
          )}
        </p>
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {format.label} · {format.width}×{format.height} px · {versions.length} versión(es)
        </p>
        {project.instruction && <p className="mt-1 break-words text-sm italic text-muted">«{project.instruction}»</p>}
      </header>

      <nav aria-label="Secciones del proyecto" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={`/estudio/${project.id}?tab=${key}`}
                aria-current={tab === key ? "page" : undefined}
                scroll={false}
                className={clsx("-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm", tab === key ? "border-gold font-medium text-ink" : "border-transparent text-muted hover:text-ink")}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------------- Conceptos ---------------- */}
      {tab === "conceptos" && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>Conceptos creativos</CardTitle>
            <p className="mb-3 text-sm text-muted">
              Parten de {campaign ? "la estrategia de la campaña" : "tus precios, promociones y marca"}. Son ideas con textos exactos y prompts: no son imágenes.
            </p>
            <ActionForm action={createConcepts.bind(null, project.id)} submitLabel={concepts.length ? "Generar 3 conceptos más" : "Generar conceptos"} pendingLabel="Generando…" variant={concepts.length ? "secondary" : "primary"}>
              <span className="sr-only">Generar conceptos</span>
            </ActionForm>
          </Card>
          {concepts.length === 0 ? (
            <EmptyState title="Sin conceptos todavía" />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {concepts.map((v) => {
                const c = v.concept as unknown as Concept;
                return (
                  <li key={v.id} className="min-w-0">
                    <Card className="flex h-full flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold">
                          v{v.version_no} · {c.angle}
                        </h3>
                        <Badge tone={c.basis === "hypothesis" ? "warn" : "gold"}>{c.basis === "hypothesis" ? "Hipótesis" : "Recomendación por probar"}</Badge>
                      </div>
                      <p className="break-words text-lg font-semibold">{c.headline}</p>
                      {c.price && <p className="text-gold">{c.price}</p>}
                      <p className="text-sm">{c.cta}</p>
                      <p className="text-xs text-muted">{c.visual_direction}</p>
                      <div className="mt-auto flex flex-wrap gap-2 pt-2">
                        <Link href={`/estudio/${project.id}?tab=editor&desde=${v.id}`} className="rounded-xl bg-action px-3 py-2 text-sm font-medium text-on-action hover:bg-action-strong">
                          Diseñar en el editor
                        </Link>
                        <Link href={`/estudio/${project.id}?tab=asistido&concepto=${v.id}`} className="rounded-xl border border-line-strong px-3 py-2 text-sm hover:bg-surface-2">
                          Prompts para IA
                        </Link>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- Editor ---------------- */}
      {tab === "editor" && initialDesign && (
        <Card>
          <CardTitle>Editor gráfico</CardTitle>
          <p className="mb-4 text-sm text-muted">
            Recorta, agrega textos y precios exactos, coloca el logotipo sin deformarlo y exporta en alta resolución. Es edición por código en tu navegador, no
            generación con IA.
          </p>
          <CreativeEditor
            projectId={project.id}
            projectTitle={project.title}
            businessId={project.business_id}
            format={format}
            otherFormats={formatsFor(project.material_type).filter((f) => f.key !== format.key && !f.video)}
            initialDesign={initialDesign}
            images={assets.filter((a) => (a.kind === "image" || a.kind === "logo") && a.mime_type !== "image/svg+xml").map((a) => ({ id: a.id, title: a.title, kind: a.kind, width: a.width, height: a.height }))}
            parentVersionId={parentVersionId}
          />
        </Card>
      )}

      {/* ---------------- Herramientas externas ---------------- */}
      {tab === "asistido" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>1–3. Copia el prompt y abre la herramienta</CardTitle>
            {!selectedConcept ? (
              <EmptyState title="Primero genera conceptos">Los prompts se arman con el concepto, tu marca y tus precios.</EmptyState>
            ) : (
              <div className="flex flex-col gap-4 text-sm">
                {concepts.length > 1 && (
                  <form method="get" className="flex gap-2">
                    <input type="hidden" name="tab" value="asistido" />
                    <select name="concepto" defaultValue={selectedConcept.id} className="input min-h-10 py-1.5 text-sm" aria-label="Concepto">
                      {concepts.map((c) => (
                        <option key={c.id} value={c.id}>
                          v{c.version_no} · {(c.concept as unknown as Concept).angle}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-xl border border-line-strong px-3 text-sm">Ver</button>
                  </form>
                )}
                {(() => {
                  const c = selectedConcept.concept as unknown as Concept;
                  const blocks: [string, string, string[]][] = video
                    ? [["Video de ambiente (Google Flow)", c.prompts.video, ["flow"]], ["Textos (Claude o ChatGPT)", c.prompts.copy, ["claude", "chatgpt"]]]
                    : [["Imagen (ChatGPT o Gemini)", c.prompts.image, ["chatgpt", "gemini"]], ["Textos (Claude o ChatGPT)", c.prompts.copy, ["claude", "chatgpt"]]];
                  return blocks.map(([label, prompt, tools]) => (
                    <div key={label} className="rounded-xl border border-line bg-surface-2 p-3">
                      <p className="mb-2 font-medium">{label}</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-muted">{prompt}</pre>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <CopyTextButton text={prompt} />
                        {ASSISTED_TOOLS.filter((t) => tools.includes(t.id)).map((t) => (
                          <a key={t.id} href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line-strong px-3 text-sm hover:bg-surface-3">
                            Abrir {t.name} <ExternalLink className="size-3" aria-hidden />
                          </a>
                        ))}
                        {tools.includes("chatgpt") && prompt.length < 1800 && (
                          <a href={`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-action-strong hover:underline">
                            Abrir ChatGPT con el texto (función no oficial; puede enviarse sola)
                          </a>
                        )}
                      </div>
                    </div>
                  ));
                })()}
                <p className="text-xs text-faint">
                  Recomendación: pide la imagen SIN texto ni precios y agrégalos después con el editor, para que salgan exactos. Ninguna suscripción incluye
                  una API: la app no envía nada a esas herramientas por ti.
                </p>
              </div>
            )}
            {refs.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">Referencias para adjuntar en la herramienta</p>
                <ul className="flex flex-col gap-1">
                  {refs.map((r) => (
                    <li key={r.id}>
                      <a href={assetUrl(r.id, true)} className="inline-flex items-center gap-1 text-sm text-action-strong hover:underline">
                        <Download className="size-3.5" aria-hidden /> {r.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>4. Importa el resultado</CardTitle>
            <p className="mb-3 text-sm text-muted">Se guarda en la Biblioteca como «Generado con IA» y como nueva versión del proyecto. Después pásalo por el editor y la revisión.</p>
            <ImportResult
              projectId={project.id}
              businessId={project.business_id}
              businessName={business.name}
              projectTitle={project.title}
              video={video}
              conceptOptions={concepts.map((c) => ({ id: c.id, label: `v${c.version_no} · ${(c.concept as unknown as Concept).angle}` }))}
            />
          </Card>
        </div>
      )}

      {/* ---------------- Video ---------------- */}
      {tab === "video" && video && plan && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card>
            <CardTitle>Escenas, textos y música</CardTitle>
            {plan.success ? (
              <VideoPlanEditor
                action={saveVideoPlan.bind(null, project.id)}
                initial={plan.data}
                media={assets.filter((a) => (a.mime_type.startsWith("image/") && a.mime_type !== "image/svg+xml") || a.mime_type.startsWith("video/")).map((a) => ({ id: a.id, title: a.title, kind: a.kind, mime: a.mime_type }))}
                audio={assets.filter((a) => a.mime_type.startsWith("audio/")).map((a) => ({ id: a.id, title: a.title, kind: a.kind, mime: a.mime_type }))}
              />
            ) : (
              <Notice tone="danger">El plan de video guardado no es válido.</Notice>
            )}
          </Card>
          <Card>
            <CardTitle>Montaje con FFmpeg</CardTitle>
            <p className="mb-3 text-sm text-muted">Une tus fotos y clips reales, pone los textos en la zona segura, agrega la música con licencia y exporta MP4 H.264 para redes. No genera video con IA.</p>
            {ff?.available ? (
              <>
                <p className="mb-2 text-xs text-positive">FFmpeg disponible en este servidor{ff.font ? "" : " (sin fuente para textos: se montará sin texto en pantalla)"}.</p>
                {plan.success && renderBlocker(plan.data) ? (
                  <Notice tone="warn">{renderBlocker(plan.data)}</Notice>
                ) : (
                  <ActionForm action={renderVideoVersion.bind(null, project.id)} submitLabel="Montar video" pendingLabel="Montando… (puede tardar un minuto)">
                    <span className="text-xs text-faint">Guarda el plan antes de montar.</span>
                  </ActionForm>
                )}
              </>
            ) : (
              <>
                <Notice tone="warn">{ff?.reason}</Notice>
                {plan.success && plan.data.scenes.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1 text-sm font-medium">Comando para tu computadora</p>
                    <p className="mb-2 text-xs text-muted">Descarga cada archivo de la escena con el nombre indicado (escena1, escena2…) y ejecuta en esa carpeta:</p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 text-[11px] text-muted">
                      {commandText(
                        buildFfmpegArgs({
                          inputs: plan.data.scenes.map((s, i) => ({ path: `escena${i + 1}${assetById.get(s.asset_id ?? "")?.mime_type.startsWith("video/") ? ".mp4" : ".jpg"}`, kind: assetById.get(s.asset_id ?? "")?.mime_type.startsWith("video/") ? "video" : "image", duration: s.duration, textFile: null })),
                          endCard: null,
                          music: plan.data.music.asset_id ? "musica.mp3" : null,
                          width: format.width,
                          height: format.height,
                          safeBottom: format.safe.bottom,
                          background: plan.data.background_color,
                          fade: plan.data.fade,
                          font: null,
                          output: "video.mp4",
                        }),
                      )}
                    </pre>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* ---------------- Versiones y revisión ---------------- */}
      {tab === "versiones" && (
        <div className="flex flex-col gap-4">
          {compare.length >= 2 && (
            <Card>
              <CardTitle>Comparación</CardTitle>
              <ul className={clsx("grid grid-cols-1 gap-3", compare.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
                {compare.map((v) => {
                  const a = v.asset_id ? assetById.get(v.asset_id) : null;
                  return (
                    <li key={v.id} className="min-w-0">
                      {a ? <AssetPreview asset={a} large /> : <EmptyState title="Concepto sin imagen" />}
                      <p className="mt-2 text-sm font-medium">
                        v{v.version_no} · {KIND_LABELS[v.kind]}
                      </p>
                      <Badge tone={QA_TONES[v.qa_status]}>{QA_LABELS[v.qa_status]}</Badge>
                      <div className="mt-2">
                        <QaList checks={v.qa} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {withFile.length === 0 ? (
            <EmptyState title="Aún no hay versiones con archivo">Exporta un diseño en el Editor, importa un resultado o monta un video.</EmptyState>
          ) : (
            <form method="get" aria-label="Comparar versiones">
              <input type="hidden" name="tab" value="versiones" />
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {withFile.map((v) => {
                  const a = assetById.get(v.asset_id!);
                  return (
                    <li key={v.id} className="min-w-0 rounded-2xl border border-line bg-surface p-2">
                      <Link href={`/estudio/${project.id}?tab=versiones&v=${v.id}`} className="block">
                        {a ? <AssetPreview asset={a} /> : <EmptyState title="Archivo eliminado" />}
                        <p className="mt-2 truncate text-sm font-medium">
                          v{v.version_no} · {KIND_LABELS[v.kind]}
                        </p>
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={QA_TONES[v.qa_status]}>{QA_LABELS[v.qa_status]}</Badge>
                        {v.is_final && <Badge tone="positive">Definitiva</Badge>}
                      </div>
                      <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                        <input type="checkbox" name="comparar" value={v.id} className="size-4 accent-[var(--action)]" /> Comparar
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button className="mt-3 rounded-xl border border-line-strong px-3 py-2 text-sm hover:bg-surface-2">Comparar seleccionadas</button>
            </form>
          )}

          {selected && selected.asset_id && (
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]" id="detalle">
              <Card>
                <CardTitle>
                  v{selected.version_no} · {KIND_LABELS[selected.kind]}
                </CardTitle>
                {assetById.get(selected.asset_id) && <AssetPreview asset={assetById.get(selected.asset_id)!} large />}
                <p className="mt-2 text-xs text-faint">
                  {formatDateTime(selected.created_at)}
                  {selected.tool ? ` · ${selected.tool}` : ""}
                  {selected.format_key ? ` · ${formatByKey(selected.format_key)?.label ?? selected.format_key}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={assetUrl(selected.asset_id, true)} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line-strong px-3 text-sm">
                    <Download className="size-4" aria-hidden /> Descargar
                  </a>
                  {(selected.kind === "code_edit" || selected.kind === "imported_result") && !video && (
                    <Link href={`/estudio/${project.id}?tab=editor&desde=${selected.id}`} className="inline-flex min-h-10 items-center rounded-xl border border-line-strong px-3 text-sm">
                      {selected.kind === "code_edit" ? "Editar una copia" : "Usar en el editor"}
                    </Link>
                  )}
                  <ConfirmButton action={deleteVersion.bind(null, selected.id, project.id)} confirmText="¿Eliminar esta versión? El archivo sigue en la Biblioteca." variant="ghost">
                    Eliminar versión
                  </ConfirmButton>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Control de calidad</p>
                  <QaList checks={selected.qa} />
                </div>
              </Card>
              <div className="flex flex-col gap-4">
                <Card>
                  <CardTitle>Revisión antes de definitivo</CardTitle>
                  {selected.is_final ? (
                    <div className="flex flex-col gap-2 text-sm">
                      <p role="status" className="rounded-lg bg-positive-soft px-3 py-2 text-positive">
                        Revisión completada: versión marcada como definitiva.
                      </p>
                      <Badge tone="positive">Definitiva · revisada {selected.qa_reviewed_at ? formatDateTime(selected.qa_reviewed_at) : ""}</Badge>
                      <ConfirmButton action={unfinalizeVersion.bind(null, selected.id, project.id)} confirmText="¿Quitar la marca de definitiva?" variant="ghost">
                        Quitar «definitiva»
                      </ConfirmButton>
                    </div>
                  ) : selected.qa.some((c) => c.level === "error" && c.source !== "manual") ? (
                    <Notice tone="danger">Hay errores automáticos. Corrígelos en el editor y exporta una nueva versión.</Notice>
                  ) : (
                    <ActionForm action={reviewVersion.bind(null, selected.id, project.id)} submitLabel="Marcar como definitiva">
                      <fieldset className="flex flex-col gap-2">
                        <legend className="mb-1 text-xs text-muted">Confirma cada punto (revisión humana):</legend>
                        {MANUAL_CHECKS.map((c) => (
                          <label key={c.id} className="flex items-start gap-2 text-sm">
                            <input type="checkbox" name={`check_${c.id}`} className="mt-1 size-4 shrink-0 accent-[var(--action)]" />
                            {c.label}
                          </label>
                        ))}
                        {selected.qa.some((c) => c.level === "warning") && (
                          <label className="mt-2 flex items-start gap-2 text-sm text-warn">
                            <input type="checkbox" name="ack_warnings" className="mt-1 size-4 shrink-0 accent-[var(--action)]" />
                            Revisé las advertencias y las acepto.
                          </label>
                        )}
                      </fieldset>
                    </ActionForm>
                  )}
                </Card>
                <Card>
                  <CardTitle>Agregar al calendario</CardTitle>
                  {!selected.is_final ? (
                    <p className="text-sm text-muted">Disponible cuando la versión es definitiva.</p>
                  ) : (
                    <ActionForm action={addVersionToCalendar.bind(null, selected.id, project.id)} submitLabel="Agregar al calendario" variant="secondary">
                      <Field label="Destino" name="content_id">
                        <select id="content_id" name="content_id" className="input" defaultValue="new">
                          <option value="new">Nuevo borrador</option>
                          {content.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title || "Sin título"}
                              {c.campaign_id && c.campaign_id === project.campaign_id ? " (de esta campaña)" : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Fecha" name="date">
                          <input id="date" name="date" type="date" className="input" defaultValue={todayInTz()} />
                        </Field>
                        <Field label="Hora (CDMX)" name="time">
                          <input id="time" name="time" type="time" className="input" defaultValue="18:30" />
                        </Field>
                      </div>
                      <FieldError name="date" />
                      <p className="text-xs text-faint">Se crea como borrador: no se publica automáticamente.</p>
                    </ActionForm>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------------- Ajustes ---------------- */}
      {tab === "ajustes" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle>Datos del proyecto</CardTitle>
            <ActionForm action={updateProject.bind(null, project.id)} submitLabel="Guardar">
              <Field label="Título" name="title">
                <input id="title" name="title" className="input" defaultValue={project.title} maxLength={160} />
              </Field>
              <FieldError name="title" />
              <Field label="Instrucción" name="instruction">
                <textarea id="instruction" name="instruction" className="input" defaultValue={project.instruction} maxLength={2000} />
              </Field>
              <Field label="Estado" name="status">
                <select id="status" name="status" className="input" defaultValue={project.status}>
                  <option value="draft">Borrador</option>
                  <option value="in_review">En revisión</option>
                  <option value="approved">Aprobado</option>
                  <option value="archived">Archivado</option>
                </select>
              </Field>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Referencias</legend>
                <ul className="flex flex-col gap-1">
                  {assets
                    .filter((a) => a.kind === "image" || a.kind === "logo")
                    .map((a) => (
                      <li key={a.id}>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name="reference_asset_ids" value={a.id} defaultChecked={project.reference_asset_ids.includes(a.id)} className="size-4 accent-[var(--action)]" />
                          {a.title}
                        </label>
                      </li>
                    ))}
                </ul>
              </fieldset>
              <FieldError name="reference_asset_ids" />
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Eliminar proyecto</CardTitle>
            <p className="mb-3 text-sm text-muted">Se borran el proyecto y sus versiones. Los archivos se conservan en la Biblioteca.</p>
            <ConfirmButton action={deleteProject.bind(null, project.id)} confirmText="¿Eliminar este proyecto?">
              Eliminar proyecto
            </ConfirmButton>
          </Card>
        </div>
      )}
    </>
  );
}
