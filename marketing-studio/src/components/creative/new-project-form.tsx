"use client";

import { useState } from "react";
import { MATERIAL_LABELS, MATERIAL_TYPES, formatsFor, type MaterialType } from "@/lib/creative/formats";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/use-action-form";
import { Button, Field } from "../ui";

type Opt = { id: string; business_id: string; title: string };

export function NewProjectForm({
  action,
  businesses,
  campaigns,
  references,
  defaultBusinessId,
  defaultCampaignId,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  businesses: { id: string; name: string }[];
  campaigns: Opt[];
  references: (Opt & { kind: string })[];
  defaultBusinessId?: string;
  defaultCampaignId?: string;
}) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const [businessId, setBusinessId] = useState(defaultBusinessId ?? businesses[0]?.id ?? "");
  const [material, setMaterial] = useState<MaterialType>("ad");
  const formats = formatsFor(material);
  const refs = references.filter((r) => r.business_id === businessId);
  const e = state.errors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Field label="Negocio" name="np-business" error={e.business_id}>
        <select id="np-business" name="business_id" className="input" value={businessId} onChange={(ev) => setBusinessId(ev.target.value)}>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Campaña" name="np-campaign" error={e.campaign_id} hint="Opcional: usa su estrategia, textos y Reel.">
        <select id="np-campaign" name="campaign_id" className="input" defaultValue={defaultCampaignId ?? ""} key={businessId}>
          <option value="">Empezar sin campaña</option>
          {campaigns
            .filter((c) => c.business_id === businessId)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Tipo de material" name="np-material" error={e.material_type}>
        <select id="np-material" name="material_type" className="input" value={material} onChange={(ev) => setMaterial(ev.target.value as MaterialType)}>
          {MATERIAL_TYPES.map((m) => (
            <option key={m} value={m}>
              {MATERIAL_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Formato y dimensiones" name="np-format" error={e.format_key}>
        <select id="np-format" name="format_key" className="input" key={material}>
          {formats.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label} — {f.width}×{f.height}
            </option>
          ))}
        </select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="Título" name="np-title" error={e.title}>
          <input id="np-title" name="title" className="input" maxLength={160} placeholder="Ej. Promo corte octubre" />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="¿Qué necesitas?" name="np-instruction" error={e.instruction}>
          <textarea id="np-instruction" name="instruction" className="input" maxLength={2000} placeholder="Ej. Un anuncio con el precio del corte y una foto real del local" />
        </Field>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Fotos reales y diseños de referencia</legend>
        {refs.length === 0 ? (
          <p className="text-xs text-muted">Este negocio no tiene imágenes en la Biblioteca todavía. Súbelas en Biblioteca y vuelve.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {refs.map((r) => (
              <li key={r.id}>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" name="reference_asset_ids" value={r.id} className="size-4 accent-[var(--action)]" />
                  <span className="truncate">{r.title}</span>
                  <span className="text-xs text-faint">{r.kind === "logo" ? "logotipo" : "imagen"}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {e.reference_asset_ids && <p className="text-xs text-danger">{e.reference_asset_ids}</p>}
      </fieldset>
      <div className="flex flex-col gap-3 sm:col-span-2">
        {state.message && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        )}
        <Button type="submit" disabled={pending || !ready} className="sm:self-start">
          {pending ? "Creando…" : "Crear proyecto"}
        </Button>
      </div>
    </form>
  );
}
