"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { POSTING_MODES, POSTING_MODE_LABELS } from "@/lib/distribution/core";
import { markOpened } from "@/app/(app)/distribucion/actions";
import { ActionForm, FieldError } from "./action-form";
import { Button, buttonClass } from "./ui";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

export interface GroupValues {
  name: string;
  url: string;
  posting_mode: string;
  page_can_participate: string;
  requires_approval: boolean;
  rules: string;
  min_days_between: number;
  notes: string;
}

function F({ label, name, children, hint }: { label: string; name: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
      <FieldError name={name.replace(/^g-[^-]+-/, "")} />
    </div>
  );
}

/** Alta o edición de un grupo. `idPrefix` evita ids repetidos cuando hay varios formularios. */
export function GroupForm({ action, values, idPrefix, submitLabel }: { action: Action; values?: GroupValues; idPrefix: string; submitLabel: string }) {
  const id = (n: string) => `g-${idPrefix}-${n}`;
  return (
    <ActionForm action={action} submitLabel={submitLabel} resetOnSuccess={!values} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <F label="Nombre del grupo" name={id("name")}>
        <input id={id("name")} name="name" className="input" defaultValue={values?.name} maxLength={160} required />
      </F>
      <F label="Dirección del grupo" name={id("url")} hint="https://www.facebook.com/groups/…">
        <input id={id("url")} name="url" className="input" defaultValue={values?.url} inputMode="url" required />
      </F>
      <F label="Forma de publicación" name={id("posting_mode")}>
        <select id={id("posting_mode")} name="posting_mode" className="input" defaultValue={values?.posting_mode ?? "share_page_post"}>
          {POSTING_MODES.map((m) => (
            <option key={m} value={m}>
              {POSTING_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </F>
      <F label="¿La página puede participar como página?" name={id("page_can_participate")} hint="Compruébalo en el grupo: las páginas solo pueden solicitar unirse y el administrador decide.">
        <select id={id("page_can_participate")} name="page_can_participate" className="input" defaultValue={values?.page_can_participate ?? "unknown"}>
          <option value="unknown">Sin comprobar</option>
          <option value="yes">Sí, comprobado</option>
          <option value="no">No, solo perfiles</option>
        </select>
      </F>
      <F label="Días mínimos entre publicaciones en este grupo" name={id("min_days_between")}>
        <input id={id("min_days_between")} name="min_days_between" type="number" min={1} max={90} className="input" defaultValue={values?.min_days_between ?? 7} />
      </F>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:mt-5">
        <input type="checkbox" name="requires_approval" defaultChecked={values?.requires_approval} /> Los administradores aprueban cada publicación
      </label>
      <div className="sm:col-span-2">
        <F label="Reglas o requisitos del grupo" name={id("rules")}>
          <textarea id={id("rules")} name="rules" className="input min-h-16" defaultValue={values?.rules} maxLength={2000} placeholder="Ej.: anuncios solo los lunes; sin enlaces externos." />
        </F>
      </div>
      <div className="sm:col-span-2">
        <F label="Notas" name={id("notes")}>
          <input id={id("notes")} name="notes" className="input" defaultValue={values?.notes} maxLength={1000} />
        </F>
      </div>
    </ActionForm>
  );
}

export interface SelectableGroup {
  id: string;
  name: string;
  mode: string;
  blockedReason: string | null;
  lastActivity: string | null;
}

export function DistributeForm({ action, groups, submitLabel, preselected = [], pendingLabel = "Creando la cola…" }: { action: Action; groups: SelectableGroup[]; submitLabel: string; preselected?: string[]; pendingLabel?: string }) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} pendingLabel={pendingLabel}>
      <fieldset className="grid gap-2">
        <legend className="sr-only">Grupos</legend>
        {groups.map((g) => (
          <label key={g.id} className="flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-action">
            <input type="checkbox" name="group_ids" value={g.id} disabled={Boolean(g.blockedReason)} defaultChecked={preselected.includes(g.id)} className="mt-1" />
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{g.name}</span>
              <span className="block text-xs text-muted">{g.mode}</span>
              <span className="block text-xs text-faint">{g.lastActivity ? `Última distribución: ${g.lastActivity}` : "Sin distribuciones previas"}</span>
              {g.blockedReason && <span className="block text-xs text-warn">{g.blockedReason}</span>}
            </span>
          </label>
        ))}
      </fieldset>
      <FieldError name="group_ids" />
    </ActionForm>
  );
}

/**
 * Abre Facebook en una pestaña nueva (en el mismo clic, para que el navegador no
 * lo bloquee) y registra la tarea como «abierta». No marca nada como publicado.
 */
export function OpenInFacebook({ taskId, href, label, variant = "primary" }: { taskId: string; href: string; label: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        onClick={() => {
          // Pestaña en blanco en el mismo clic (si no, el navegador la bloquea); solo
          // se dirige a Facebook si el servidor lo permite (tope diario, cola activa).
          const w = window.open("about:blank", "_blank");
          if (w) w.opener = null;
          start(async () => {
            const r = await markOpened(taskId);
            if (!r.ok) {
              w?.close();
              setError(r.message ?? "No se pudo abrir.");
            } else {
              setError(null);
              if (w) w.location.href = href;
              else window.location.href = href;
            }
            router.refresh();
          });
        }}
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TaskActionForm({ action, label, variant = "secondary", withUrl = false, withNote = false, confirmText }: { action: Action; label: string; variant?: "primary" | "secondary" | "ghost" | "danger"; withUrl?: boolean; withNote?: boolean; confirmText?: string }) {
  return (
    <ActionForm action={action} submitLabel={label} variant={variant} className="flex flex-col gap-2" confirmText={confirmText}>
      {withUrl && (
        <input name="group_post_url" aria-label="Enlace de la publicación en el grupo (opcional)" className="input text-sm" inputMode="url" placeholder="Enlace de la publicación en el grupo (opcional)" />
      )}
      {withNote && <input name="note" aria-label="Qué falló" className="input text-sm" placeholder="¿Qué falló? (p. ej., el grupo no permite enlaces)" />}
    </ActionForm>
  );
}

export function ExternalLink({ href, children, variant = "secondary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant)}>
      {children}
    </a>
  );
}
