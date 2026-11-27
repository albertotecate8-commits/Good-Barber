"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { IconHome, IconSettings, IconShield, IconStore } from "../ui/icons";
import { BusinessMark } from "./BusinessMark";

type Item = { href: string; label: string; icon: ReactNode; active: boolean; accent?: string };

/** Máximo de negocios con pestaña propia; con más, se agrupan en "Negocios". */
const MAX_BUSINESS_TABS = 2;

export function BottomNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { activeBusinesses } = useSite();
  const currentSlug = params.get("n");
  const onBusiness = pathname.startsWith("/negocio");

  const businessItems: Item[] =
    activeBusinesses.length <= MAX_BUSINESS_TABS
      ? activeBusinesses.map((b) => ({
          href: `/negocio/?n=${encodeURIComponent(b.slug)}`,
          label: b.name,
          icon: <BusinessMark name={b.name} color={b.accent_color} small />,
          active: onBusiness && currentSlug === b.slug,
          accent: b.accent_color,
        }))
      : [{ href: "/negocio/", label: "Negocios", icon: <IconStore />, active: onBusiness }];

  const items: Item[] = [
    { href: "/inicio/", label: "Inicio", icon: <IconHome />, active: pathname.startsWith("/inicio") },
    ...businessItems,
    { href: "/seguridad/", label: "Seguridad", icon: <IconShield />, active: pathname.startsWith("/seguridad") },
    { href: "/ajustes/", label: "Ajustes", icon: <IconSettings />, active: pathname.startsWith("/ajustes") },
  ];

  return (
    <nav className="nav" aria-label="Navegación principal">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={it.active ? "nav-item active" : "nav-item"}
          aria-current={it.active ? "page" : undefined}
          style={it.accent ? ({ "--biz": it.accent } as React.CSSProperties) : undefined}
        >
          <span className="nav-icon">{it.icon}</span>
          <span className="nav-label">{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
