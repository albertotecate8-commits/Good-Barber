"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/use-action-form";
import { Button, type ButtonVariant } from "./ui";

const StateContext = createContext<ActionState>({});

/**
 * Formulario genérico conectado a una acción de servidor: conserva lo escrito
 * si hay error, muestra el mensaje y los errores por campo (<FieldError />).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Guardando…",
  resetOnSuccess = false,
  variant = "primary",
  className = "flex flex-col gap-4",
  confirmText,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  resetOnSuccess?: boolean;
  variant?: ButtonVariant;
  className?: string;
  confirmText?: string;
}) {
  const [state, onSubmit, pending, ready] = useActionForm(action);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <StateContext value={state}>
      <form
        ref={ref}
        noValidate
        className={className}
        onSubmit={(e) => {
          if (confirmText && !window.confirm(confirmText)) {
            e.preventDefault();
            return;
          }
          onSubmit(e);
        }}
      >
        {children}
        {state.message && (
          <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-positive-soft text-positive" : "bg-danger-soft text-danger"}`}>
            {state.message}
          </p>
        )}
        <Button type="submit" variant={variant} disabled={pending || !ready} className="sm:self-start">
          {pending ? pendingLabel : submitLabel}
        </Button>
      </form>
    </StateContext>
  );
}

export function FieldError({ name }: { name: string }) {
  const state = useContext(StateContext);
  const error = state.errors?.[name];
  if (!error) return null;
  return (
    <p id={`${name}-error`} role="alert" className="text-xs text-danger">
      {error}
    </p>
  );
}
