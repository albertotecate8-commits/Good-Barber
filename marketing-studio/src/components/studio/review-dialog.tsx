"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { CheckCircle2, CircleAlert, Clock, ExternalLink, Loader2, X } from "lucide-react";
import { MANUAL_CHECKS } from "@/lib/creative/qa";
import type { Proposal } from "@/lib/studio/propose";
import { approveAndPublish, type DestinationOutcome } from "@/app/(app)/_studio/actions";
import { formatCents } from "@/lib/money";
import { assetSrc, DESTINATION_LABELS, type Readiness, type StudioPublication } from "./types";

type Dest = "facebook_page" | "instagram";

const STATE_UI: Record<DestinationOutcome["state"], { icon: typeof CheckCircle2; tone: string; label: string }> = {
  published: { icon: CheckCircle2, tone: "text-positive", label: "Publicado" },
  approved_waiting: { icon: Clock, tone: "text-action-strong", label: "Aprobado, aún no publicado" },
  saved_not_published: { icon: CircleAlert, tone: "text-warn", label: "Guardado, no publicado" },
  error: { icon: CircleAlert, tone: "text-danger", label: "Error" },
};

/** Estado honesto de una publicación guardada. */
export function publicationLabel(p: StudioPublication) {
  if (p.external_post_id) return { text: "Publicado (confirmado por Meta)", tone: "text-positive" };
  if (p.status === "error") return { text: `Error: ${p.last_error ?? "sin detalle"}`, tone: "text-danger" };
  if (p.publish_mode === "api" && p.approved_at) return { text: p.scheduled_at ? `Aprobado para publicarse ${new Date(p.scheduled_at).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" })}; aún no publicado` : "Aprobado; aún no publicado", tone: "text-action-strong" };
  return { text: p.scheduled_at ? "En el calendario (manual); no publicado" : "Aprobado y guardado; no publicado", tone: "text-warn" };
}

export function ReviewDialog({
  versionId,
  assetId,
  proposal,
  readiness,
  prices,
  publications,
  onClose,
  onDone,
}: {
  versionId: string;
  assetId: string;
  proposal: Proposal | null;
  readiness: Readiness;
  prices: { name: string; cents: number }[];
  publications: StudioPublication[];
  onClose: () => void;
  onDone: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [caption, setCaption] = useState(proposal ? proposal.text : "");
  const [tags, setTags] = useState((proposal?.hashtags ?? []).map((t) => `#${t}`).join(" "));
  const [checks, setChecks] = useState<string[]>([]);
  const [dest, setDest] = useState<Dest[]>([]);
  const [mode, setMode] = useState<"now" | "schedule" | "save">("save");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<DestinationOutcome[] | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const allChecked = MANUAL_CHECKS.every((c) => checks.includes(c.id));
  const anyReady = dest.some((d) => readiness[d].ready);
  const label = dest.length === 2 ? "Facebook e Instagram" : dest.length === 1 ? DESTINATION_LABELS[dest[0]] : "";
  const submitLabel = mode === "save" ? `Aprobar y guardar${label ? ` para ${label}` : ""}` : mode === "now" ? `Aprobar y publicar ahora${label ? ` en ${label}` : ""}` : `Aprobar y programar${label ? ` en ${label}` : ""}`;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const hashtags = tags
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, ""))
      .filter(Boolean);
    const r = await approveAndPublish({ versionId, destinations: dest, mode, date, time, caption, hashtags, checks });
    setBusy(false);
    if (!r.ok) setError(r.message);
    else {
      setOutcomes(r.outcomes);
      onDone();
    }
  };

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="revisar-titulo"
      className="m-auto w-[min(56rem,calc(100vw-1rem))] max-h-[92dvh] overflow-hidden rounded-3xl border border-line bg-surface p-0 text-ink shadow-float backdrop:bg-[#0b1320]/60"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id="revisar-titulo" className="text-base font-semibold">
            Revisar y aprobar
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar" className="pressable grid size-10 place-items-center rounded-xl hover:bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="grid flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
          <img src={assetSrc(assetId)} alt="Imagen a aprobar" className="w-full rounded-2xl bg-surface-3 object-contain md:sticky md:top-0" />
          <div className="flex flex-col gap-4">
            {outcomes ? (
              <section aria-live="polite" className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Resultado por destino</h3>
                {outcomes.map((o) => {
                  const ui = STATE_UI[o.state];
                  return (
                    <div key={o.platform} className="rounded-2xl border border-line p-3">
                      <p className={clsx("flex items-center gap-2 text-sm font-semibold", ui.tone)}>
                        <ui.icon className="size-4" aria-hidden /> {DESTINATION_LABELS[o.platform]}: {ui.label}
                      </p>
                      <p className="mt-1 text-sm text-muted">{o.message}</p>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-action-strong underline">
                          Ver publicación <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                      )}
                      {o.contentId && (
                        <a href={`/calendario/${o.contentId}`} className="mt-1 block text-xs text-muted underline">
                          Abrir en el calendario
                        </a>
                      )}
                    </div>
                  );
                })}
                <button type="button" onClick={() => dialog.current?.close()} className="pressable mt-2 min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">
                  Listo
                </button>
              </section>
            ) : (
              <>
                {publications.length > 0 && (
                  <section className="rounded-2xl bg-surface-2 p-3 text-sm">
                    <p className="font-semibold">Ya aprobada antes</p>
                    {publications.map((p) => {
                      const l = publicationLabel(p);
                      return (
                        <p key={p.id} className={l.tone}>
                          {DESTINATION_LABELS[p.platform as Dest] ?? p.platform}: {l.text}
                        </p>
                      );
                    })}
                    <p className="mt-1 text-xs text-muted">Volver a aprobar actualiza la misma publicación: no se duplica.</p>
                  </section>
                )}
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Texto de la publicación
                  <textarea className="input min-h-28" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Hashtags
                  <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
                </label>
                <p className="text-xs text-muted">
                  Precios registrados: {prices.length ? prices.map((p) => `${p.name} ${formatCents(p.cents)}`).join(" · ") : "ninguno (no menciones precios)"}.
                </p>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">Revisión obligatoria</legend>
                  {MANUAL_CHECKS.map((c) => (
                    <label key={c.id} className="flex min-h-11 items-start gap-2 rounded-xl px-1 text-sm">
                      <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--action)]" checked={checks.includes(c.id)} onChange={() => setChecks((l) => toggle(l, c.id))} />
                      {c.label}
                    </label>
                  ))}
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">¿Dónde se publica? (cada destino se aprueba por separado)</legend>
                  {(["facebook_page", "instagram"] as Dest[]).map((d) => {
                    const r = readiness[d];
                    return (
                      <label key={d} className={clsx("flex min-h-14 items-start gap-3 rounded-2xl border p-3 text-sm", dest.includes(d) ? "border-action bg-action-soft" : "border-line")}>
                        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-[var(--action)]" checked={dest.includes(d)} onChange={() => setDest((l) => toggle(l, d))} />
                        <span>
                          <span className="font-semibold">{d === "facebook_page" ? "Página de Facebook" : "Instagram profesional"}</span>
                          <span className={clsx("block text-xs", r.ready ? "text-positive" : "text-warn")}>
                            {r.ready ? `Conectada: ${r.accountName ?? "cuenta verificada"}${r.publishingOn ? "" : " · publicación automática apagada en el servidor"}` : `No conectada: ${r.reason ?? "sin verificar"}`}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </fieldset>

                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-sm font-semibold">¿Cuándo?</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["save", "Solo guardar", "Queda aprobada en el calendario"],
                        ["now", "Publicar ahora", "Requiere la cuenta conectada"],
                        ["schedule", "Programar", "Fecha y hora de CDMX"],
                      ] as const
                    ).map(([k, t, d]) => (
                      <label key={k} className={clsx("flex min-h-14 cursor-pointer flex-col rounded-2xl border p-3 text-sm", mode === k ? "border-action bg-action-soft" : "border-line")}>
                        <span className="flex items-center gap-2 font-semibold">
                          <input type="radio" name="cuando" className="size-4 accent-[var(--action)]" checked={mode === k} onChange={() => setMode(k)} />
                          {t}
                        </span>
                        <span className="text-xs text-muted">{d}</span>
                      </label>
                    ))}
                  </div>
                  {mode === "schedule" && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Fecha
                        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
                      </label>
                      <label className="flex flex-col gap-1 text-sm font-medium">
                        Hora (Ciudad de México)
                        <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
                      </label>
                    </div>
                  )}
                  {mode !== "save" && dest.length > 0 && !anyReady && (
                    <p className="text-xs text-warn">Ningún destino elegido está conectado: se aprobará y guardará en el calendario, pero NO se publicará.</p>
                  )}
                </fieldset>

                {error && (
                  <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  disabled={busy || !allChecked || !dest.length || !caption.trim() || (mode === "schedule" && !date)}
                  onClick={submit}
                  className="pressable inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-on-action shadow-raised hover:bg-action-strong disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {submitLabel}
                </button>
                {!allChecked && <p className="text-xs text-muted">Marca todas las casillas de revisión para aprobar.</p>}
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
