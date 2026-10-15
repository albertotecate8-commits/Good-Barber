"use client";

import { useActionState } from "react";
import { signIn } from "@/app/auth-actions";
import { Button, Field } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Correo" name="email">
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </Field>
      <Field label="Contraseña" name="password">
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </Field>
      {state.message && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
