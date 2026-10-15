"use client";

import { useActionForm } from "@/lib/use-action-form";
import { useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Button, Field } from "./ui";

export function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState<"" | "ok" | "error">("");
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        disabled={!text}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied("ok");
          } catch {
            setCopied("error");
          }
        }}
      >
        Copiar texto y hashtags
      </Button>
      <span role="status" className="text-xs text-muted">
        {copied === "ok" ? "Copiado" : copied === "error" ? "No se pudo copiar: selecciona el texto a mano." : ""}
      </span>
    </div>
  );
}

export function ManualPostForm({ action }: { action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, onSubmit, pending] = useActionForm(action);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <Field label="Enlace a la publicación (opcional)" name="manual_post_url" error={state.errors?.manual_post_url}>
        <input
          id="manual_post_url"
          name="manual_post_url"
          className="input"
          inputMode="url"
          placeholder="https://www.instagram.com/p/…"
          aria-invalid={state.errors?.manual_post_url ? true : undefined}
        />
      </Field>
      {state.message && (
        <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-positive" : "text-danger"}`}>
          {state.message}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Guardando…" : "Ya la publiqué manualmente"}
      </Button>
    </form>
  );
}
