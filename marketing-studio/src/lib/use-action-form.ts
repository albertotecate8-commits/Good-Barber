"use client";

import { useActionState, useTransition, type FormEvent } from "react";
import type { ActionState } from "./action-state";

/**
 * Como useActionState, pero SIN el reinicio automático que React 19 aplica a
 * los <form action={…}>: si el servidor devuelve un error de validación, lo
 * que la persona escribió o eligió se conserva. Los formularios de alta que
 * deban limpiarse al guardar lo hacen explícitamente (state.ok).
 */
export function useActionForm(action: (state: ActionState, form: FormData) => Promise<ActionState>, initial: ActionState = {}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [transitioning, startTransition] = useTransition();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return [state, onSubmit, pending || transitioning] as const;
}
