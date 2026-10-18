"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { MEMORY_KINDS, MEMORY_LABELS, type MemoryItem } from "@/lib/studio/styles";
import { addMemory, deleteMemory, updateMemory } from "@/app/(app)/_studio/actions";

const SOURCE_LABELS = { chat: "Desde el chat", manual: "Agregado a mano", research: "Desde Investigar", approval: "Al aprobar" } as const;

function Row({ item, onError }: { item: MemoryItem; onError: (m: string) => void }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState(item.kind);
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
  return (
    <li className={clsx("flex flex-col gap-2 rounded-2xl border border-line p-3", !item.active && "opacity-60")}>
      {editing ? (
        <>
          <select className="input h-10 w-fit" aria-label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as MemoryItem["kind"])}>
            {MEMORY_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <textarea className="input min-h-20" aria-label="Texto del dato" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => updateMemory(item.id, { text, kind }))} className="pressable min-h-10 rounded-xl bg-action px-3 text-sm font-semibold text-on-action">
              Guardar corrección
            </button>
            <button type="button" onClick={() => setEditing(false)} className="pressable min-h-10 rounded-xl px-3 text-sm">
              Cancelar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">
              <span className="mr-2 inline-flex rounded-full bg-action-soft px-2 py-0.5 text-[11px] font-semibold text-action-strong">{MEMORY_LABELS[item.kind]}</span>
              {item.text}
            </p>
            <div className="flex shrink-0 gap-1">
              <button type="button" onClick={() => setEditing(true)} aria-label={`Corregir: ${item.text}`} className="pressable grid size-9 place-items-center rounded-lg hover:bg-surface-2">
                <Pencil className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirm("¿Borrar este dato de la memoria?") && run(() => deleteMemory(item.id))}
                aria-label={`Borrar: ${item.text}`}
                className="pressable grid size-9 place-items-center rounded-lg text-danger hover:bg-danger-soft"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>
              {SOURCE_LABELS[item.source]} · {item.created_at.slice(0, 10)}
            </span>
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                Fuente <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
            <label className="ml-auto inline-flex min-h-9 items-center gap-1.5">
              <input type="checkbox" checked={item.active} disabled={pending} onChange={(e) => run(() => updateMemory(item.id, { active: e.target.checked }))} className="size-4 accent-[var(--action)]" />
              Usar al crear
            </label>
          </div>
        </>
      )}
    </li>
  );
}

export function MemoryManager({ businessId, items }: { businessId: string; items: MemoryItem[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<MemoryItem["kind"]>("preference");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <form
        className="surface-raised flex flex-col gap-2 rounded-2xl border border-line/70 p-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addMemory({ businessId, kind, text });
            if (!r.ok) setError(r.message);
            else {
              setText("");
              setError(null);
              router.refresh();
            }
          });
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo
          <select className="input h-11" value={kind} onChange={(e) => setKind(e.target.value as MemoryItem["kind"])}>
            {MEMORY_KINDS.filter((k) => k.key !== "research_insight").map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          Dato para recordar
          <input className="input h-11" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ej.: Preferimos fotos reales del local, sin modelos" />
        </label>
        <button type="submit" disabled={pending || text.trim().length < 3} className="pressable inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-action px-4 text-sm font-semibold text-on-action disabled:opacity-50">
          <Plus className="size-4" aria-hidden /> Guardar en memoria
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {items.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((i) => (
            <Row key={`${i.id}-${i.text}-${i.kind}-${i.active}`} item={i} onError={setError} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Sin datos guardados todavía.</p>
      )}
    </div>
  );
}
