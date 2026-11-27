"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSite } from "@/lib/site/SiteProvider";
import { ROLE_LABELS } from "@/lib/domain/types";
import { APP_VERSION } from "@/lib/config";
import { env } from "@/lib/env";
import { Badge, Card, PageHeader, Section } from "@/components/ui/primitives";
import { IconCamera, IconChair, IconChevronRight, IconClock, IconStore, IconUser, IconUsers } from "@/components/ui/icons";

function Item({ href, icon, title, desc }: { href: string; icon: ReactNode; title: string; desc: string }) {
  return (
    <Link href={href} className="list-row list-link">
      <span className="list-icon">{icon}</span>
      <div className="list-main">
        <strong>{title}</strong>
        <small className="muted">{desc}</small>
      </div>
      <IconChevronRight size={18} />
    </Link>
  );
}

export default function AjustesPage() {
  const auth = useAuth();
  const { membership, role } = useSite();
  const email = auth.status === "signed_in" ? auth.session.user.email : "";
  let host = "";
  try {
    host = new URL(env.supabaseUrl).host;
  } catch {
    host = "—";
  }
  return (
    <>
      <PageHeader title="Ajustes" subtitle={membership.site_name} />
      <Section title="Configuración">
        <div className="list">
          <Item href="/ajustes/negocios/" icon={<IconStore size={18} />} title="Negocios" desc="Nombres, colores y permanencia por defecto" />
          <Item href="/ajustes/camaras/" icon={<IconCamera size={18} />} title="Cámaras" desc="Una Tapo C100 por negocio" />
          <Item href="/ajustes/estaciones/" icon={<IconChair size={18} />} title="Estaciones" desc="Sillas, mesas y zonas de cada negocio" />
          <Item href="/ajustes/horarios/" icon={<IconClock size={18} />} title="Horarios" desc="Horario comercial por negocio" />
          <Item href="/ajustes/usuarios/" icon={<IconUsers size={18} />} title="Usuarios" desc="Quién puede entrar y con qué rol" />
          <Item href="/ajustes/cuenta/" icon={<IconUser size={18} />} title="Mi cuenta" desc={email ?? ""} />
        </div>
      </Section>
      <Section title="Sistema">
        <Card>
          <dl className="kv">
            <div><dt>Tu rol</dt><dd><Badge tone="accent">{ROLE_LABELS[role]}</Badge></dd></div>
            <div><dt>Zona horaria</dt><dd>{membership.timezone}</dd></div>
            <div><dt>Base de datos</dt><dd className="break">{host} · esquema {env.supabaseSchema}</dd></div>
            <div><dt>Versión</dt><dd>{APP_VERSION}</dd></div>
          </dl>
        </Card>
      </Section>
    </>
  );
}
