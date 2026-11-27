"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FullscreenLoading, SetupRequired } from "@/components/layout/Gates";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { Button, Notice } from "@/components/ui/primitives";

export default function ResetPasswordPage() {
  const auth = useAuth();
  const router = useRouter();
  const [waited, setWaited] = useState(false);

  // El SDK tarda un instante en canjear el código del enlace por una sesión.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (auth.status === "unconfigured") return <SetupRequired />;
  if (auth.status === "loading" || (auth.status === "signed_out" && !waited)) return <FullscreenLoading label="Verificando enlace…" />;

  return (
    <div className="fullscreen">
      <div className="auth-card">
        <h1 className="auth-title">Nueva contraseña</h1>
        {auth.status === "signed_out" ? (
          <>
            <Notice tone="warning" title="Enlace no válido o vencido">
              Pide un enlace nuevo desde «¿Olvidaste tu contraseña?» y ábrelo en este mismo navegador.
            </Notice>
            <Button block onClick={() => router.replace("/login/")}>Ir a iniciar sesión</Button>
          </>
        ) : (
          <PasswordForm onDone={() => router.replace("/inicio/")} />
        )}
      </div>
    </div>
  );
}
