import { clsx } from "clsx";
import { useState } from "react";
import { api, enterDemo, friendlyError, supabaseConfigured } from "../api";
import { useToast } from "../components/toast";
import { Button, Drip, Field, inputClass } from "../components/ui";

type Mode = "signin" | "signup" | "reset";

export function LoginPage() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signin") await api.signIn(email.trim(), password);
      else if (mode === "signup") {
        const { needsConfirmation } = await api.signUp(email.trim(), password);
        if (needsConfirmation) setNotice("Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión.");
      } else {
        await api.resetPassword(email.trim());
        setNotice("Si el correo existe, te llegará un enlace para cambiar tu contraseña.");
      }
    } catch (err) {
      toast(friendlyError(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-to-b from-[#ff7b9c] via-pink to-[#ff9f7a]">
      <div className="sprinkles absolute inset-0 opacity-90 [background-size:180px_180px]" />
      <Drip className="relative h-20 text-[#fff7f2] drop-shadow-[0_6px_6px_rgba(160,30,70,0.25)]" />

      <div className="relative mx-auto flex min-h-[calc(100dvh-5rem)] max-w-md flex-col px-5 pb-8">
        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <span className="candy-emoji mb-3 text-7xl animate-float">🍭</span>
          <h1 className="font-display text-6xl font-bold leading-none text-white drop-shadow-[0_4px_0_rgba(190,40,80,0.45)]">
            Dulce<br />Control
          </h1>
          <p className="mt-4 max-w-[16rem] text-sm font-medium text-white/90">
            Cuenta tus dulces el sábado y sabe cuánto vendiste, ganaste y qué comprar.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-[2rem] bg-bg p-5 shadow-2xl animate-fade-up">
          {mode !== "reset" && (
            <div className="mb-5 grid grid-cols-2 rounded-full bg-surface-2 p-1 text-sm font-semibold">
              {(["signin", "signup"] as const).map((m) => (
                <button key={m} type="button" onClick={() => { setMode(m); setNotice(null); }}
                  className={clsx("h-10 rounded-full transition", mode === m ? "bg-surface text-pink shadow-card" : "text-ink-3")}>
                  {m === "signin" ? "Entrar" : "Crear cuenta"}
                </button>
              ))}
            </div>
          )}
          {mode === "reset" && <h2 className="mb-4 text-lg font-semibold">Recuperar contraseña</h2>}

          <div className="space-y-4">
            <Field label="Correo">
              {(id) => <input id={id} type="email" autoComplete="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />}
            </Field>
            {mode !== "reset" && (
              <Field label="Contraseña">
                {(id) => <input id={id} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />}
              </Field>
            )}
          </div>

          {notice && <p className="mt-4 rounded-2xl bg-mint-soft p-3 text-sm">{notice}</p>}

          <Button type="submit" block size="lg" className="mt-5" disabled={busy || !supabaseConfigured}>
            {busy ? "Un momento…" : mode === "signin" ? "Entrar" : mode === "signup" ? "Crear mi cuenta" : "Enviar enlace"}
          </Button>

          <div className="mt-3 flex items-center justify-between text-sm">
            {mode === "reset"
              ? <button type="button" className="font-medium text-pink" onClick={() => setMode("signin")}>← Volver</button>
              : <button type="button" className="font-medium text-ink-3" onClick={() => setMode("reset")}>¿Olvidaste tu contraseña?</button>}
            <button type="button" className="font-semibold text-pink" onClick={enterDemo}>Ver demo 🍬</button>
          </div>
          {!supabaseConfigured && (
            <p className="mt-3 text-xs text-ink-3">Falta configurar Supabase (VITE_SUPABASE_URL). Mientras tanto puedes usar el demo.</p>
          )}
        </form>
      </div>
    </div>
  );
}
