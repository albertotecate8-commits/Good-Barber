import { publicEnv } from "@/lib/env";

export default function SetupPage() {
  const { configured } = publicEnv();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold">Configuración inicial</h1>
      {configured ? (
        <p className="mt-3 text-muted">La conexión con Supabase ya está configurada. <a className="text-action-strong underline" href="/login">Ir a iniciar sesión</a>.</p>
      ) : (
        <div className="mt-4 space-y-3 text-sm text-muted">
          <p>
            Falta conectar la base de datos. Define estas variables de entorno (en <code>.env.local</code> o en tu
            hosting) y reinicia la app:
          </p>
          <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-4 text-xs text-ink">
{`NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_clave_publica`}
          </pre>
          <p>Las instrucciones completas están en <code>marketing-studio/docs/DESPLIEGUE.md</code>.</p>
        </div>
      )}
    </main>
  );
}
