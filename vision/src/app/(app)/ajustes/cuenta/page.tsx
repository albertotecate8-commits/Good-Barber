"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSite } from "@/lib/site/SiteProvider";
import { ROLE_LABELS } from "@/lib/domain/types";
import { BackToSettings } from "@/components/settings/common";
import { PasswordForm } from "@/components/settings/PasswordForm";
import { Button, Card, PageHeader, Section } from "@/components/ui/primitives";
import { IconLogout } from "@/components/ui/icons";

export default function CuentaPage() {
  const auth = useAuth();
  const { role, membership } = useSite();
  const [signingOut, setSigningOut] = useState(false);
  const email = auth.status === "signed_in" ? auth.session.user.email : "";
  return (
    <>
      <BackToSettings />
      <PageHeader title="Mi cuenta" />
      <Section title="Sesión">
        <Card>
          <dl className="kv">
            <div><dt>Correo</dt><dd className="break">{email}</dd></div>
            <div><dt>Rol</dt><dd>{ROLE_LABELS[role]}</dd></div>
            <div><dt>Establecimiento</dt><dd>{membership.site_name}</dd></div>
          </dl>
        </Card>
      </Section>
      <Section title="Cambiar contraseña">
        <Card><PasswordForm /></Card>
      </Section>
      <Button
        variant="danger"
        block
        icon={<IconLogout size={18} />}
        loading={signingOut}
        onClick={async () => {
          setSigningOut(true);
          await auth.signOut();
        }}
      >
        Cerrar sesión
      </Button>
    </>
  );
}
