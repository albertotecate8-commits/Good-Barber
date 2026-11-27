"use client";

import { useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase/client";
import { firstIssue, newPasswordSchema } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import { Button, Field, Notice, TextInput, FormError } from "../ui/primitives";
import { useToast } from "../ui/Toast";

export function PasswordForm({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = newPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: parsed.data.password });
      if (error) return setError(friendlyError(error));
      setPassword("");
      setConfirm("");
      toast.success("Contraseña actualizada.");
      onDone?.();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="stack">
      <Field label="Contraseña nueva" hint="Mínimo 10 caracteres.">
        {(id) => <TextInput id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Field label="Confirmar contraseña">
        {(id) => <TextInput id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
      </Field>
      <FormError message={error} />
      <Button type="submit" block loading={busy}>Guardar contraseña</Button>
    </form>
  );
}
