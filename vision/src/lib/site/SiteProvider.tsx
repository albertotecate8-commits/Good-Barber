"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchBusinesses, fetchMyMemberships } from "../data/queries";
import { friendlyError } from "../domain/errors";
import type { Business, Membership, Role } from "../domain/types";

type SiteState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** Sesión válida pero sin fila en vision.members: sin acceso. */
  | { status: "no_access" }
  | { status: "ready"; membership: Membership; businesses: Business[] };

type SiteContextValue = {
  membership: Membership;
  businesses: Business[];
  activeBusinesses: Business[];
  role: Role;
  canManage: boolean;
  isOwner: boolean;
  reloadBusinesses: () => Promise<void>;
};

const SiteContext = createContext<SiteContextValue | null>(null);

export function SiteProvider({
  children,
  renderLoading,
  renderError,
  renderNoAccess,
}: {
  children: ReactNode;
  renderLoading: () => ReactNode;
  renderError: (message: string, retry: () => void) => ReactNode;
  renderNoAccess: () => ReactNode;
}) {
  const [state, setState] = useState<SiteState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const memberships = await fetchMyMemberships();
      const membership = memberships[0];
      if (!membership) {
        setState({ status: "no_access" });
        return;
      }
      const businesses = await fetchBusinesses(membership.site_id);
      setState({ status: "ready", membership, businesses });
    } catch (e) {
      setState({ status: "error", message: friendlyError(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadBusinesses = useCallback(async () => {
    if (state.status !== "ready") return;
    const businesses = await fetchBusinesses(state.membership.site_id);
    setState({ ...state, businesses });
  }, [state]);

  const value = useMemo<SiteContextValue | null>(() => {
    if (state.status !== "ready") return null;
    const role = state.membership.role;
    return {
      membership: state.membership,
      businesses: state.businesses,
      activeBusinesses: state.businesses.filter((b) => b.active),
      role,
      canManage: role === "owner" || role === "admin",
      isOwner: role === "owner",
      reloadBusinesses,
    };
  }, [state, reloadBusinesses]);

  if (state.status === "loading") return <>{renderLoading()}</>;
  if (state.status === "error") return <>{renderError(state.message, () => void load())}</>;
  if (state.status === "no_access" || !value) return <>{renderNoAccess()}</>;
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error("useSite debe usarse dentro de <SiteProvider>.");
  return ctx;
}
