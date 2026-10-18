"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { INTERPRETED_FIELDS, type Interpreted, type Style } from "@/lib/studio/styles";
import { deleteStyle, saveStyle, setStyleActive } from "@/app/(app)/_studio/actions";
import { MeasuredView, ReferenceAnalyzer } from "./reference-analyzer";
import { assetSrc } from "./types";

function StyleCard({ s, businessId, businessName, onError }: { s: Style; businessId: string; businessName: string; onError: (m: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const [description, setDescription] = useState(s.description);
  const [interp, setInterp] = useState<Interpreted>(s.attributes.interpreted);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) onError(r.message ?? "No se pudo guardar.");
      else {
        setEditing(false);
        router.refresh();
      }
    });
  const palette = s.attributes.measured?.palette ?? [];
  return (
    <li className={clsx("surface-raised flex flex-col gap-3 rounded-2xl border border-line/70 p-3", !s.active && "opacity-60")}>
      <div className="flex gap-3">
        {s.reference_asset_ids[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada
          <img src={assetSrc(s.reference_asset_ids[0])} alt={`Referencia de ${s.name}`} className="size-20 shrink-0 rounded-xl bg-surface-3 object-cover" />
        ) : (
          <div aria-hidden className="size-20 shrink-0 rounded-xl bg-surface-3" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{s.name}</h3>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full" aria-hidden>
            {palette.map((p) => (
              <span key={p.hex} style={{ background: p.hex, flexGrow: Math.max(p.share, 0.05) }} />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">
            {s.source === "reference_image" ? "Desde imagen de referencia" : "Creado a mano"} · {s.created_at.slice(0, 10)}
          </p>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Nombre
            <input className="input h-10" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Nota
            <input className="input h-10" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </label>
          {INTERPRETED_FIELDS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1 text-xs font-medium">
              {f.label}
              <input className="input h-10" value={interp[f.key] ?? ""} onChange={(e) => setInterp((c) => ({ ...c, [f.key]: e.target.value }))} maxLength={600} />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveStyle({ id: s.id, businessId, name, description, attributes: { measured: s.attributes.measured, interpreted: interp }, referenceAssetIds: s.reference_asset_ids, source: s.source }))}
              className="pressable min-h-10 rounded-xl bg-action px-3 text-sm font-semibold text-on-action"
            >
              Guardar
            </button>
            <button type="button" onClick={() => setEditing(false)} className="pressable min-h-10 rounded-xl px-3 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-0.5 text-xs">
            {INTERPRETED_FIELDS.filter((f) => s.attributes.interpreted[f.key]).map((f) => (
              <li key={f.key}>
                <span className="text-muted">{f.label}:</span> {s.attributes.interpreted[f.key]}
              </li>
            ))}
            {s.description && <li className="text-muted">{s.description}</li>}
          </ul>
          {s.attributes.measured && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">Ver lo medido</summary>
              <div className="mt-2">
                <MeasuredView m={s.attributes.measured} />
              </div>
            </details>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/?nueva=1&estilo=${s.id}&idea=${encodeURIComponent(`Crea algo con el estilo ${s.name} para ${businessName}`)}`}
              className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-action px-3 text-sm font-semibold text-on-action"
            >
              <Sparkles className="size-4" aria-hidden /> Crear con este estilo
            </Link>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Editar ${s.name}`} className="pressable grid size-10 place-items-center rounded-xl border border-line hover:bg-surface-2">
              <Pencil className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => confirm(`¿Borrar el estilo «${s.name}»? La imagen de referencia se queda en la Biblioteca.`) && run(() => deleteStyle(s.id))}
              aria-label={`Borrar ${s.name}`}
              className="pressable grid size-10 place-items-center rounded-xl border border-line text-danger hover:bg-danger-soft"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
            <label className="ml-auto inline-flex min-h-10 items-center gap-1.5 text-xs">
              <input type="checkbox" checked={s.active} disabled={pending} onChange={(e) => run(() => setStyleActive(s.id, e.target.checked))} className="size-4 accent-[var(--action)]" />
              Disponible en el chat
            </label>
          </div>
        </>
      )}
    </li>
  );
}

export function StylesManager({ businessId, businessName, styles }: { businessId: string; businessName: string; styles: Style[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(styles.length === 0);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {creating ? (
        <div className="surface-raised rounded-2xl border border-line/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Nuevo estilo desde una imagen</h3>
            {styles.length > 0 && (
              <button type="button" onClick={() => setCreating(false)} aria-label="Cerrar" className="pressable grid size-9 place-items-center rounded-lg hover:bg-surface-2">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <ReferenceAnalyzer businessId={businessId} businessName={businessName} onSaved={() => router.refresh()} />
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="pressable inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold shadow-soft hover:bg-surface-2">
          <Plus className="size-4" aria-hidden /> Nuevo estilo desde una imagen
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {styles.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {styles.map((s) => (
            <StyleCard key={`${s.id}-${s.updated_at}`} s={s} businessId={businessId} businessName={businessName} onError={setError} />
          ))}
        </ul>
      )}
    </div>
  );
}
