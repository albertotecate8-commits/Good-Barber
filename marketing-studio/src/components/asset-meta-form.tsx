"use client";

import { useActionForm } from "@/lib/use-action-form";

import type { ActionState } from "@/lib/action-state";
import type { Asset } from "@/lib/data/types";
import { ASSET_KINDS, ASSET_KIND_LABELS } from "@/lib/content-labels";
import { Button, Field } from "./ui";

export function AssetMetaForm({
  action,
  asset,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  asset: Asset;
}) {
  const [state, onSubmit, pending] = useActionForm(action);
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Título" name="title" error={e.title}>
        <input id="title" name="title" className="input" defaultValue={asset.title} maxLength={160} aria-invalid={e.title ? true : undefined} />
      </Field>
      <Field label="Tipo de recurso" name="kind" error={e.kind}>
        <select id="kind" name="kind" className="input" defaultValue={asset.kind} aria-invalid={e.kind ? true : undefined}>
          {ASSET_KINDS.map((k) => (
            <option key={k} value={k}>
              {ASSET_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Fecha del recurso" name="asset_date" error={e.asset_date}>
        <input id="asset_date" name="asset_date" type="date" className="input" defaultValue={asset.asset_date ?? ""} />
      </Field>
      <Field label="Etiquetas" name="tags" hint="Separadas por comas">
        <input id="tags" name="tags" className="input" defaultValue={asset.tags.join(", ")} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Descripción" name="description" error={e.description}>
          <textarea id="description" name="description" className="input" defaultValue={asset.description} maxLength={2000} />
        </Field>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2">
        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}>
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending} className="sm:self-start">
          {pending ? "Guardando…" : "Guardar datos"}
        </Button>
      </div>
    </form>
  );
}
