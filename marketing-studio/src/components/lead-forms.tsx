"use client";

import type { ActionState } from "@/lib/action-state";
import { ATTRIBUTIONS, ATTRIBUTION_LABELS, LEAD_SOURCES, LEAD_SOURCE_LABELS, LEAD_STATUSES, LEAD_STATUS_LABELS } from "@/lib/validation/lead";
import { ActionForm, FieldError } from "./action-form";

type Action = (s: ActionState, f: FormData) => Promise<ActionState>;

function L({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
      </label>
      {children}
      <FieldError name={htmlFor.replace("lead-", "")} />
    </div>
  );
}

export function NewLeadForm({ action, businessId, campaigns, today }: { action: Action; businessId: string; campaigns: { id: string; name: string }[]; today: string }) {
  return (
    <ActionForm action={action} submitLabel="Registrar prospecto" resetOnSuccess className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input type="hidden" name="business_id" value={businessId} />
      <L label="Fecha" htmlFor="lead-occurred_on">
        <input id="lead-occurred_on" name="occurred_on" type="date" defaultValue={today} className="input" required />
      </L>
      <L label="Origen" htmlFor="lead-source">
        <select id="lead-source" name="source" className="input" defaultValue="instagram_dm">
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </L>
      <L label="Nombre (opcional)" htmlFor="lead-contact_name">
        <input id="lead-contact_name" name="contact_name" className="input" maxLength={120} />
      </L>
      <L label="Contacto (usuario o últimos dígitos; opcional)" htmlFor="lead-contact_hint">
        <input id="lead-contact_hint" name="contact_hint" className="input" maxLength={120} placeholder="@usuario o ••42" />
      </L>
      <L label="Estado" htmlFor="lead-status">
        <select id="lead-status" name="status" className="input" defaultValue="new">
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </L>
      <L label="Monto de la venta (solo si compró)" htmlFor="lead-value">
        <input id="lead-value" name="value" className="input" inputMode="decimal" placeholder="$170" />
      </L>
      <L label="Campaña" htmlFor="lead-campaign_id">
        <select id="lead-campaign_id" name="campaign_id" className="input" defaultValue="">
          <option value="">Ninguna</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </L>
      <L label="¿Cómo sabes que vino de esa campaña?" htmlFor="lead-attribution">
        <select id="lead-attribution" name="attribution" className="input" defaultValue="unknown">
          {ATTRIBUTIONS.map((a) => (
            <option key={a} value={a}>
              {ATTRIBUTION_LABELS[a]}
            </option>
          ))}
        </select>
      </L>
      <div className="sm:col-span-2">
        <L label="Notas" htmlFor="lead-notes">
          <textarea id="lead-notes" name="notes" className="input min-h-16" maxLength={2000} />
        </L>
      </div>
    </ActionForm>
  );
}

export function LeadStatusForm({ action, status, label }: { action: Action; status: string; label: string }) {
  return (
    <ActionForm action={action} submitLabel="Guardar" variant="secondary" className="flex flex-wrap items-end gap-2">
      <select name="status" aria-label={`Estado de ${label}`} className="input min-h-10 py-1 text-sm" defaultValue={status}>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {LEAD_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      <input name="value" aria-label={`Monto de ${label}`} className="input min-h-10 w-28 py-1 text-sm" inputMode="decimal" placeholder="Monto" />
    </ActionForm>
  );
}

export function ImportLeadsForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} submitLabel="Importar CSV" pendingLabel="Validando…" variant="secondary">
      <input type="file" name="file" accept=".csv,text/csv" aria-label="Archivo CSV" className="text-sm" required />
    </ActionForm>
  );
}
