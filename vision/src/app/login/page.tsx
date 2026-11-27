"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getSupabase } from "@/lib/supabase/client";
import { emailSchema, firstIssue, loginSchema } from "@/lib/domain/validation";
import { friendlyError } from "@/lib/domain/errors";
import { APP_NAME } from "@/lib/config";
import { Button, Field, Notice, TextInput, FormError } from "@/components/ui/primitives";
import { FullscreenLoading, SetupRequired } from "@/components/layout/Gates";

export default function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.status === "signed_in") router.replace("/inicio/");
    if (auth.status === "recovery") router.replace("/restablecer/");
  }, [auth.status, router]);

  if (auth.status === "unconfigured") return <SetupRequired />;
  if (auth.status === "loading" || auth.status === "signed_in") return <FullscreenLoading />;

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signInWithPassword(parsed.data);
      if (error) setError(friendlyError(error));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const parsed = emailSchema.safeParse({ email });
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: `${window.location.origin}/restablecer/`,
      });
      if (error) setError(friendlyError(error));
      // Mismo mensaje exista o no la cuenta (no revela qué correos existen).
      else setInfo("Si el correo tiene una cuenta, recibirás un enlace para crear una contraseña nueva. Ábrelo en este mismo navegador.");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fullscreen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-dot brand-dot-lg" aria-hidden />
          <h1 className="auth-title">{APP_NAME}</h1>
          <p className="muted">Good Barber · Glamour Studio</p>
        </div>

        {mode === "login" ? (
          <form onSubmit={onLogin} noValidate className="stack">
            <Field label="Correo">
              {(id) => <TextInput id={id} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Contraseña">
              {(id) => <TextInput id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            <FormError message={error} />
            <Button type="submit" block loading={busy}>Iniciar sesión</Button>
            <Button type="button" variant="ghost" block onClick={() => { setMode("forgot"); setError(null); }}>
              ¿Olvidaste tu contraseña?
            </Button>
          </form>
        ) : (
          <form onSubmit={onForgot} noValidate className="stack">
            <p className="muted small">Te enviaremos un enlace para crear una contraseña nueva.</p>
            <Field label="Correo">
              {(id) => <TextInput id={id} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <FormError message={error} />
            {info && <Notice tone="success">{info}</Notice>}
            <Button type="submit" block loading={busy}>Enviar enlace</Button>
            <Button type="button" variant="ghost" block onClick={() => { setMode("login"); setError(null); setInfo(null); }}>
              Volver a iniciar sesión
            </Button>
          </form>
        )}

        <p className="muted small center">
          Las cuentas las crea el propietario. No hay registro público.
        </p>
      </div>
    </div>
  );
}
