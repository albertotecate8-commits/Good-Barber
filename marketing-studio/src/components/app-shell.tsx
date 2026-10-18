"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import clsx from "clsx";
import { Bell, ChevronDown, LogOut, Menu, Settings, X } from "lucide-react";
import { NAV_MAIN, NAV_MORE, isActive } from "./nav-items";
import type { ShellAlert, ShellBusiness } from "@/lib/data/shell";
import { setActiveBusiness } from "@/app/(app)/shell-actions";

interface ShellProps {
  children: ReactNode;
  email: string;
  signOut: () => Promise<void>;
  businesses: ShellBusiness[];
  activeId: string | null;
  alerts: ShellAlert[];
}

function Brand({ onDark = false, iconOnly = false }: { onDark?: boolean; iconOnly?: boolean }) {
  return (
    <Link href="/" aria-label={iconOnly ? "Marketing AI Studio: inicio" : undefined} className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#3cc3be] to-[#0e7c82] text-sm font-bold text-white shadow-raised">
        M
      </span>
      <span className={clsx(onDark ? "text-nav-text" : "text-ink", iconOnly && "sr-only")}>
        Marketing <span className={onDark ? "text-[#7fe0db]" : "text-action-strong"}>AI</span> Studio
      </span>
    </Link>
  );
}

/** Selector del negocio activo: siempre visible para no preparar contenido en la marca equivocada. */
function BusinessSwitcher({ businesses, activeId, compact = false }: { businesses: ShellBusiness[]; activeId: string | null; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const active = businesses.find((b) => b.id === activeId) ?? null;
  if (!businesses.length)
    return (
      <Link href="/negocios" className="pressable inline-flex min-h-11 items-center rounded-xl border border-dashed border-line-strong px-3 text-sm text-muted">
        Sin negocios
      </Link>
    );
  return (
    <label className={clsx("relative flex min-h-11 items-center rounded-xl border border-line bg-surface shadow-soft", compact ? "max-w-[46vw]" : "min-w-52")}>
      <span className="sr-only">Negocio activo</span>
      <span aria-hidden className="pointer-events-none absolute left-3 size-3 rounded-full ring-2 ring-surface" style={{ background: active?.color ?? "var(--faint)" }} />
      <select
        value={active?.id ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await setActiveBusiness(id);
            router.refresh();
          });
        }}
        className="h-11 w-full cursor-pointer appearance-none truncate rounded-xl bg-transparent pl-8 pr-8 text-sm font-semibold text-ink outline-none focus-visible:shadow-[var(--ring)]"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 size-4 text-muted" />
    </label>
  );
}

function Notifications({ alerts }: { alerts: ShellAlert[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="avisos"
        aria-label={alerts.length ? `Avisos: ${alerts.length}` : "Avisos: ninguno"}
        className="pressable relative grid size-11 place-items-center rounded-xl border border-line bg-surface text-muted shadow-soft hover:text-ink"
      >
        <Bell className="size-5" aria-hidden />
        {alerts.length > 0 && (
          <span aria-hidden className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div id="avisos" className="animate-rise surface-raised absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line p-2 shadow-float">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-faint">Avisos</p>
          {alerts.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted">Todo en orden: no hay publicaciones con error ni cuentas por reconectar.</p>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm hover:bg-surface-2">
                    <span aria-hidden className={clsx("size-2 shrink-0 rounded-full", a.tone === "danger" ? "bg-danger" : a.tone === "warn" ? "bg-warn" : "bg-action")} />
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children, email, signOut, businesses, activeId, alerts }: ShellProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const initial = (email[0] ?? "?").toUpperCase();
  const inMore = NAV_MORE.some((g) => g.items.some((i) => isActive(pathname, i.href)));
  // El chat (Crear) usa todo el ancho y alto disponible.
  const wide = pathname === "/";

  const signOutForm = (onDark: boolean) => (
    <form action={signOut}>
      <button
        className={clsx(
          "pressable flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm",
          onDark ? "text-nav-muted hover:bg-white/10 hover:text-nav-text" : "text-muted hover:bg-surface-2 hover:text-ink",
        )}
      >
        <LogOut className="size-4" aria-hidden /> Cerrar sesión
      </button>
    </form>
  );

  const moreList = (onDark: boolean, onPick?: () => void) =>
    NAV_MORE.map((group) => (
      <div key={group.label} className="mb-2">
        <p className={clsx("px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider", onDark ? "text-nav-muted/80" : "text-faint")}>{group.label}</p>
        <ul className={clsx(onDark ? "flex flex-col gap-0.5" : "grid grid-cols-2 gap-1")}>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={onPick}
                  className={clsx(
                    "pressable flex items-center gap-3 rounded-xl px-3 text-sm",
                    onDark
                      ? clsx("min-h-9", active ? "bg-white/15 font-semibold text-nav-text" : "text-nav-muted hover:bg-white/10 hover:text-nav-text")
                      : "min-h-12 text-muted hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-action-soft aria-[current=page]:font-semibold aria-[current=page]:text-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    ));

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-action focus:px-3 focus:py-2 focus:text-on-action">
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio): tres áreas principales y «Más» plegable */}
      <aside className="sticky top-0 hidden h-dvh p-3 lg:block">
        <div className="flex h-full flex-col rounded-3xl bg-gradient-to-b from-nav-2 to-nav px-3 py-5 shadow-float">
          <div className="px-2">
            <Brand onDark />
          </div>
          <nav aria-label="Principal" className="mt-6 flex flex-1 flex-col gap-1 overflow-y-auto pr-1">
            <ul className="flex flex-col gap-1">
              {NAV_MAIN.map(({ href, label, icon: Icon, description }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "pressable flex min-h-12 items-center gap-3 rounded-2xl px-3",
                        active ? "bg-nav-active text-nav-active-text shadow-raised" : "text-nav-muted hover:bg-white/10 hover:text-nav-text",
                      )}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      <span className="flex flex-col leading-tight">
                        <span className={clsx("text-sm", active && "font-semibold")}>{label}</span>
                        {description && <span className={clsx("text-[11px]", active ? "opacity-70" : "text-nav-muted/80")}>{description}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <details className="group mt-4 border-t border-white/10 pt-3" open={inMore || undefined}>
              <summary className="pressable flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-xl px-3 text-sm text-nav-muted hover:bg-white/10 hover:text-nav-text">
                <Menu className="size-4" aria-hidden /> Más
                <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="mt-2">{moreList(true)}</div>
            </details>
          </nav>
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="truncate px-3 pb-2 text-xs text-nav-muted" title={email}>
              {email}
            </p>
            {signOutForm(true)}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Barra superior: negocio activo, avisos y perfil */}
        <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur-md">
          <div className={clsx("mx-auto flex h-16 w-full items-center gap-2 px-4 sm:px-6 lg:px-8", wide ? "max-w-[1400px]" : "max-w-6xl")}>
            <div className="lg:hidden">
              <Brand iconOnly />
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <BusinessSwitcher businesses={businesses} activeId={activeId} compact />
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Notifications alerts={alerts} />
              <Link
                href="/configuracion"
                aria-label="Perfil y configuración"
                title={email}
                className="pressable hidden size-11 place-items-center rounded-xl bg-surface font-semibold text-action-strong shadow-soft ring-1 ring-line hover:ring-line-strong lg:grid"
              >
                {initial}
              </Link>
            </div>
          </div>
        </header>

        <main
          id="contenido"
          className={clsx(
            "animate-rise mx-auto w-full flex-1 px-4 sm:px-6 lg:px-8",
            wide ? "max-w-[1400px] pb-20 pt-3 lg:pb-6" : "max-w-6xl pb-32 pt-5 lg:pb-10 lg:pt-6",
          )}
        >
          {children}
        </main>
      </div>

      {/* Navegación inferior (móvil): las tres áreas y «Más» */}
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur-md lg:hidden">
        <ul className="grid grid-cols-4">
          {NAV_MAIN.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
                className={clsx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive(pathname, href) ? "text-action-strong" : "text-muted")}
              >
                <Icon className="size-5" aria-hidden />
                {label === "Estilos y memoria" ? "Estilos" : label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-controls="menu-mas"
              className={clsx("flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium", moreOpen || inMore ? "text-action-strong" : "text-muted")}
            >
              {moreOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              Más
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-[#0b1320]/50 backdrop-blur-[2px] lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            id="menu-mas"
            className="animate-rise absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] max-h-[75dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-3 shadow-float"
            onClick={(e) => e.stopPropagation()}
          >
            {moreList(false, () => setMoreOpen(false))}
            <div className="mt-1 border-t border-line pt-2">
              <p className="flex items-center gap-2 truncate px-3 pb-1 text-xs text-faint">
                <Settings className="size-3" aria-hidden /> {email}
              </p>
              {signOutForm(false)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
