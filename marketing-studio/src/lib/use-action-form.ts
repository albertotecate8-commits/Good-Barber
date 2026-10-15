"use client";

import { useActionState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import type { ActionState } from "./action-state";

const noop = () => () => {};
/** true solo en el navegador ya hidratado (false en el servidor y antes de hidratar). */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * Como useActionState, pero SIN el reinicio automático que React 19 aplica a
 * los <form action={…}>: si el servidor devuelve un error de validación, lo
 * que la persona escribió o eligió se conserva. Los formularios de alta que
 * deban limpiarse al guardar lo hacen explícitamente (state.ok).
 *
 * `ready` es false hasta que la página termina de cargar: el botón de envío
 * debe deshabilitarse mientras tanto, o un toque temprano haría un envío
 * nativo del navegador y la acción se perdería.
 */
export function useActionForm(action: (state: ActionState, form: FormData) => Promise<ActionState>, initial: ActionState = {}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const [transitioning, startTransition] = useTransition();
  const ready = useHydrated();
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return [state, onSubmit, pending || transitioning, ready] as const;
}
