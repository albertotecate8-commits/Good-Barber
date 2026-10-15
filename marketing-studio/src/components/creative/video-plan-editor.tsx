"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MUSIC_LICENSES, MUSIC_LICENSE_LABELS, MAX_VIDEO_SECONDS, totalSeconds, type VideoPlan } from "@/lib/creative/video";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/use-action-form";
import { Badge, Button } from "../ui";
import { CopyTextButton } from "../content-extras";

type Option = { id: string; title: string; kind: string; mime: string };

export function VideoPlanEditor({
  action,
  initial,
  media,
  audio,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  initial: VideoPlan;
  media: Option[];
  audio: Option[];
}) {
  const [plan, setPlan] = useState<VideoPlan>(initial);
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const total = totalSeconds(plan);
  const setScene = (i: number, patch: Partial<VideoPlan["scenes"][number]>) =>
    setPlan((p) => ({ ...p, scenes: p.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, d: number) =>
    setPlan((p) => {
      const s = [...p.scenes];
      const [x] = s.splice(i, 1);
      s.splice(i + d, 0, x);
      return { ...p, scenes: s };
    });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 text-sm" noValidate>
      <input type="hidden" name="plan" value={JSON.stringify(plan)} />
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={total > MAX_VIDEO_SECONDS ? "danger" : "action"}>
          Duración: {total.toFixed(1)} s
        </Badge>
        <span className="text-xs text-faint">Máximo {MAX_VIDEO_SECONDS} s. Las escenas sin material quedan pendientes (graba o genera en Flow e impórtalas).</span>
      </p>
      <ol className="flex flex-col gap-3">
        {plan.scenes.map((s, i) => (
          <li key={s.id} className="rounded-xl border border-line bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-medium">
                Escena {i + 1} {s.asset_id ? <Badge tone="positive">Con material</Badge> : <Badge tone="warn">Pendiente de material</Badge>}
              </span>
              <span className="flex gap-1">
                <button type="button" aria-label={`Subir escena ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-surface-3 disabled:opacity-30">
                  <ArrowUp className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Bajar escena ${i + 1}`} disabled={i === plan.scenes.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-surface-3 disabled:opacity-30">
                  <ArrowDown className="size-4" aria-hidden />
                </button>
                <button type="button" aria-label={`Quitar escena ${i + 1}`} onClick={() => setPlan((p) => ({ ...p, scenes: p.scenes.filter((_, j) => j !== i) }))} className="rounded-lg p-2 text-danger hover:bg-surface-3">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_110px]">
              <label className="flex flex-col gap-1 text-xs text-muted">
                Material (foto o clip)
                <select className="input" value={s.asset_id ?? ""} onChange={(e) => setScene(i, { asset_id: e.target.value || null })} aria-label={`Material de la escena ${i + 1}`}>
                  <option value="">Pendiente</option>
                  {media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.mime.startsWith("video/") ? "video" : "foto"})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                Segundos
                <input type="number" min={1} max={15} step={0.5} className="input" value={s.duration} onChange={(e) => setScene(i, { duration: Math.min(15, Math.max(1, Number(e.target.value) || 1)) })} aria-label={`Duración de la escena ${i + 1}`} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                Texto en pantalla
                <input className="input" maxLength={120} value={s.on_screen_text} onChange={(e) => setScene(i, { on_screen_text: e.target.value })} aria-label={`Texto en pantalla de la escena ${i + 1}`} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                Guion / voz
                <input className="input" maxLength={400} value={s.voiceover} onChange={(e) => setScene(i, { voiceover: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                Qué se ve (notas de grabación)
                <input className="input" maxLength={400} value={s.notes} onChange={(e) => setScene(i, { notes: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
                Prompt para Google Flow (solo tomas de ambiente)
                <textarea className="input min-h-16" maxLength={1500} value={s.flow_prompt} onChange={(e) => setScene(i, { flow_prompt: e.target.value })} />
              </label>
              {s.flow_prompt && !s.asset_id && (
                <div className="sm:col-span-2">
                  <CopyTextButton text={s.flow_prompt} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="secondary"
        className="sm:self-start"
        disabled={plan.scenes.length >= 15}
        onClick={() => setPlan((p) => ({ ...p, scenes: [...p.scenes, { id: `escena-${Date.now().toString(36)}`, asset_id: null, duration: 3, on_screen_text: "", voiceover: "", notes: "", flow_prompt: "" }] }))}
      >
        <Plus className="size-4" aria-hidden /> Agregar escena
      </Button>

      <fieldset className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
        <legend className="px-1 font-medium">Cierre y música</legend>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Llamada a la acción final
          <input className="input" maxLength={80} value={plan.cta_text} onChange={(e) => setPlan((p) => ({ ...p, cta_text: e.target.value }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Segundos del cierre
          <input type="number" min={0} max={5} step={0.5} className="input" value={plan.end_card_seconds} onChange={(e) => setPlan((p) => ({ ...p, end_card_seconds: Math.min(5, Math.max(0, Number(e.target.value) || 0)) }))} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Música (de la Biblioteca)
          <select className="input" value={plan.music.asset_id ?? ""} onChange={(e) => setPlan((p) => ({ ...p, music: { ...p.music, asset_id: e.target.value || null, license: e.target.value ? (p.music.license === "none" ? "own" : p.music.license) : "none" } }))}>
            <option value="">Sin música</option>
            {audio.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Licencia de la música
          <select className="input" value={plan.music.license} disabled={!plan.music.asset_id} onChange={(e) => setPlan((p) => ({ ...p, music: { ...p.music, license: e.target.value as VideoPlan["music"]["license"] } }))}>
            {MUSIC_LICENSES.map((l) => (
              <option key={l} value={l}>
                {MUSIC_LICENSE_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        {plan.music.asset_id && (
          <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
            Origen de la licencia (enlace o descripción)
            <input className="input" maxLength={500} value={plan.music.license_detail} onChange={(e) => setPlan((p) => ({ ...p, music: { ...p.music, license_detail: e.target.value } }))} />
          </label>
        )}
        <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
          <input type="checkbox" className="size-4 accent-[var(--action)]" checked={plan.fade} onChange={(e) => setPlan((p) => ({ ...p, fade: e.target.checked }))} /> Fundido suave entre escenas
        </label>
      </fieldset>
      <p className="text-xs text-faint">
        No subas canciones comerciales sin licencia: las redes pueden silenciar o bloquear el video. Instagram y TikTok ofrecen música con licencia al publicar desde su app.
      </p>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}>
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending || !ready} className="sm:self-start">
        {pending ? "Guardando…" : "Guardar plan de video"}
      </Button>
    </form>
  );
}
