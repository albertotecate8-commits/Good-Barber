"use client";

import { Suspense, type ReactNode } from "react";
import { useSite } from "@/lib/site/SiteProvider";
import { APP_NAME } from "@/lib/config";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: ReactNode }) {
  const { membership } = useSite();
  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-brand">
          <span className="brand-dot" aria-hidden />
          <div>
            <strong>{APP_NAME}</strong>
            <small>{membership.site_name}</small>
          </div>
        </div>
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
