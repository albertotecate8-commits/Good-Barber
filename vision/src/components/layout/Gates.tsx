"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { envProblems } from "@/lib/env";
import { SiteProvider } from "@/lib/site/SiteProvider";
import { APP_NAME } from "@/lib/config";
import { Button, Notice, Spinner } from "../ui/primitives";
import { AppShell } from "./AppShell";

export function FullscreenLoading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="fullscreen">
      <Spinner label={label} />
      <p className="muted">{label}</p>
    </div>
  );
}

/** Pantalla cuando faltan variables de entorno: nunca se finge una conexión. */
export function SetupRequired() {
  const problems = envProblems();
  return (
    <div className="fullscreen">
      <div className="auth-card">
        <h1 className="auth-title">{APP_NAME}</h1>
        <Notice tone="warning" title="Configuración requerida">
          La aplicación todavía no está conectada a Supabase. No se muestra ningún dato hasta que exista una conexión real.
        </Notice>
        <ul className="plain-list">
          {problems.map((p) => (
            <li key={p.variable}>
              <code>{p.variable}</code> — {p.message}
            </li>
          ))}
        </ul>
        <p className="muted small">
          Copia <code>vision/.env.example</code> a <code>vision/.env.local</code>, completa los valores y vuelve a compilar. Ver{" "}
          <code>vision/README.md</code>.
        </p>
      </div>
    </div>
  );
}

function NoAccess() {
  const auth = useAuth();
  const userId = auth.status === "signed_in" ? auth.session.user.id : "";
  const email = auth.status === "signed_in" ? auth.session.user.email : "";
  return (
    <div className="fullscreen">
      <div className="auth-card">
        <h1 className="auth-title">Sin acceso</h1>
        <p>
          La cuenta <strong>{email}</strong> inició sesión correctamente, pero todavía no tiene permiso en {APP_NAME}.
        </p>
        <p className="muted small">
          El propietario debe darle acceso desde Ajustes → Usuarios. Si eres el propietario y es la primera vez, sigue el paso
          «Primer propietario» de <code>vision/docs/BASE-DE-DATOS.md</code>.
        </p>
        <p className="muted small">
          Identificador de la cuenta: <code className="break">{userId}</code>
        </p>
        <Button variant="secondary" block onClick={() => void auth.signOut()}>
          Cerrar sesión
        </Button>
      </div>
    </div>
  );
}

function SiteError({ message, retry }: { message: string; retry: () => void }) {
  const auth = useAuth();
  return (
    <div className="fullscreen">
      <div className="auth-card">
        <Notice tone="danger" title="No se pudo cargar el establecimiento">
          {message}
        </Notice>
        <Button block onClick={retry}>Reintentar</Button>
        <Button variant="ghost" block onClick={() => void auth.signOut()}>Cerrar sesión</Button>
      </div>
    </div>
  );
}

/** Protege las pantallas internas: sesión → membresía → shell. */
export function ProtectedApp({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.status === "signed_out") router.replace("/login/");
    if (auth.status === "recovery") router.replace("/restablecer/");
  }, [auth.status, router]);

  if (auth.status === "unconfigured") return <SetupRequired />;
  if (auth.status !== "signed_in") return <FullscreenLoading />;

  return (
    <SiteProvider
      key={auth.session.user.id}
      renderLoading={() => <FullscreenLoading label="Cargando establecimiento…" />}
      renderError={(m, retry) => <SiteError message={m} retry={retry} />}
      renderNoAccess={() => <NoAccess />}
    >
      <AppShell>{children}</AppShell>
    </SiteProvider>
  );
}
