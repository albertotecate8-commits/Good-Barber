"use client";

import type { ActionState } from "@/lib/action-state";
import { ActionForm, FieldError } from "./action-form";

export function AutoPublishForm({ action, when, platform }: { action: (s: ActionState, f: FormData) => Promise<ActionState>; when: string; platform: string }) {
  return (
    <ActionForm action={action} submitLabel="Aprobar publicación automática" pendingLabel="Verificando…" variant="primary">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1" />
        <span>
          Revisé el texto, la imagen, la red ({platform}) y la fecha ({when}). Autorizo que se publique sola.
        </span>
      </label>
      <FieldError name="confirm" />
    </ActionForm>
  );
}
