"use client";

import { useState } from "react";
import { GOALS, GOAL_LABELS, type Goal } from "@/lib/director/plan";
import { parseInstruction } from "@/lib/director/intent";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/use-action-form";
import { Badge, Button, Field } from "../ui";

const EXAMPLE =
  "Prepara una campaña para Good Barber que consiga más citas esta semana. Investiga la competencia de Durango, propón cinco anuncios distintos y crea un Reel.";

export function DirectorForm({
  action,
  businesses,
  today,
  geminiReason,
  defaultBusinessId,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  businesses: { id: string; name: string; sector: string }[];
  today: string;
  geminiReason: string | null;
  defaultBusinessId?: string;
}) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const [instruction, setInstruction] = useState("");
  const [goal, setGoal] = useState<Goal>("appointments");
  const [goalTouched, setGoalTouched] = useState(false);
  const intent = instruction.trim().length >= 10 ? parseInstruction(instruction, today) : null;
  const e = state.errors ?? {};

  const onInstruction = (v: string) => {
    setInstruction(v);
    const suggested = v.trim().length >= 10 ? parseInstruction(v, today).suggestedGoal : null;
    if (suggested && !goalTouched) setGoal(suggested);
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2" aria-describedby={e.business_ids ? "business_ids-error" : undefined}>
          <legend className="mb-1 text-sm font-medium">Negocio(s)</legend>
          <div className="flex flex-wrap gap-2">
            {businesses.map((b) => (
              <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm has-[:checked]:border-action has-[:checked]:bg-action-soft">
                <input type="checkbox" name="business_ids" value={b.id} defaultChecked={b.id === defaultBusinessId} className="size-4 accent-[var(--action)]" />
                {b.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-faint">Si eliges varios, se crea una campaña separada por negocio (los datos no se mezclan).</p>
          {e.business_ids && (
            <p id="business_ids-error" role="alert" className="text-xs text-danger">
              {e.business_ids}
            </p>
          )}
        </fieldset>

        <Field label="Objetivo" name="goal" error={e.goal}>
          <select
            id="goal"
            name="goal"
            className="input"
            value={goal}
            onChange={(ev) => {
              setGoal(ev.target.value as Goal);
              setGoalTouched(true);
            }}
          >
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <Field label="¿Qué necesitas?" name="instruction" error={e.instruction}>
            <textarea
              id="instruction"
              name="instruction"
              className="input min-h-32"
              value={instruction}
              onChange={(ev) => onInstruction(ev.target.value)}
              maxLength={2000}
              placeholder={EXAMPLE}
              aria-invalid={e.instruction ? true : undefined}
            />
          </Field>
          <button type="button" className="mt-1 text-xs text-action-strong hover:underline" onClick={() => onInstruction(EXAMPLE)}>
            Usar el ejemplo
          </button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Cómo redactar la estrategia</legend>
          <label className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm">
            <input type="radio" name="engine" value="template" defaultChecked className="mt-0.5 size-4 accent-[var(--action)]" />
            <span>
              <span className="font-medium">Motor de plantillas de la app</span>
              <span className="block text-xs text-muted">Sin IA y sin costo. Usa solo tus datos y los hallazgos con fuente.</span>
            </span>
          </label>
          <label className={`flex items-start gap-2 rounded-xl border border-line bg-surface-2 p-3 text-sm ${geminiReason ? "opacity-60" : ""}`}>
            <input type="radio" name="engine" value="gemini" disabled={Boolean(geminiReason)} className="mt-0.5 size-4 accent-[var(--action)]" />
            <span>
              <span className="font-medium">Gemini API (nivel gratuito)</span>
              <span className="block text-xs text-muted">
                {geminiReason ? `No disponible: ${geminiReason}` : "Redacta con IA usando el mismo contexto; si falla, se usa el motor de plantillas."}
              </span>
            </span>
          </label>
        </fieldset>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="research" defaultChecked className="size-4 accent-[var(--action)]" />
          Investigar fuentes públicas automáticas (OpenStreetMap, búsqueda web y tendencias, si están disponibles)
        </label>

        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}>
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Investigando y preparando la campaña…" : "Preparar campaña"}
        </Button>
      </div>

      <aside aria-label="Tareas detectadas" className="rounded-2xl border border-line bg-surface-2 p-4">
        <h2 className="mb-2 text-sm font-semibold">Tareas detectadas</h2>
        {intent ? (
          <>
            <ol className="list-inside list-decimal space-y-1 text-sm text-muted">
              {intent.tasks.map((t) => (
                <li key={t.kind}>{t.label}</li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="action">{intent.adsCount} anuncios</Badge>
              {intent.wantsReel && <Badge tone="action">Reel</Badge>}
              {intent.wantsCompetitors && <Badge tone="action">Competencia</Badge>}
              <Badge>
                {intent.start} a {intent.end}
              </Badge>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Escribe la instrucción para ver cómo se convierte en tareas.</p>
        )}
        <p className="mt-3 text-xs text-faint">
          La app no publica nada ni genera imágenes o videos: prepara la estrategia, los textos y los prompts para tus herramientas.
        </p>
      </aside>
    </form>
  );
}
