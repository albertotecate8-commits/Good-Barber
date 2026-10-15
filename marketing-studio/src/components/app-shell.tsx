"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { LogOut, Menu, X } from "lucide-react";
import { NAV_ITEMS, isActive } from "./nav-items";

export function AppShell({
  children,
  email,
  signOut,
}: {
  children: ReactNode;
  email: string;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-gold-soft text-sm font-bold text-gold">
        M
      </span>
      <span>
        Marketing <span className="text-gold">AI</span> Studio
      </span>
    </Link>
  );

  const signOutForm = (
    <form action={signOut}>
      <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink">
        <LogOut className="size-4" aria-hidden /> Cerrar sesión
      </button>
    </form>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-action focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      {/* Barra lateral (escritorio) */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-2">{brand}</div>
        <nav aria-label="Principal" className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
                  active ? "bg-action-soft font-medium text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon className={clsx("size-4", active && "text-action-strong")} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line pt-3">
          <p className="truncate px-3 pb-2 text-xs text-faint" title={email}>
            {email}
          </p>
          {signOutForm}
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Barra superior (móvil) */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
          {brand}
        </header>

        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
          {children}
        </main>
      </div>

      {/* Navegación inferior (móvil) */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV_ITEMS.filter((i) => i.primary).map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]",
                    active ? "text-action-strong" : "text-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate px-1">{label.split(" ")[0]}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              aria-controls="menu-mas"
              className={clsx(
                "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]",
                moreOpen ? "text-action-strong" : "text-muted",
              )}
            >
              {moreOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
              Más
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMoreOpen(false)}>
          <div
            id="menu-mas"
            className="absolute inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] rounded-t-2xl border-t border-line bg-surface p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="grid grid-cols-2 gap-1">
              {NAV_ITEMS.filter((i) => !i.primary).map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={isActive(pathname, href) ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink aria-[current=page]:bg-action-soft aria-[current=page]:text-ink"
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-line pt-2">
              <p className="truncate px-3 pb-1 text-xs text-faint">{email}</p>
              {signOutForm}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
