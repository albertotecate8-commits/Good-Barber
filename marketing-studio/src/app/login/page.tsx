import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div aria-hidden className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gold-soft text-lg font-bold text-gold">
            M
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Marketing <span className="text-gold">AI</span> Studio
          </h1>
          <p className="mt-1 text-sm text-muted">Centro de marketing de tus negocios</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-5">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-xs text-faint">
          Acceso privado. No hay registro público: las cuentas las crea el administrador.
        </p>
      </div>
    </main>
  );
}
