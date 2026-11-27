"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { envProblems } from "../env";
import { getSupabase } from "../supabase/client";

type AuthState =
  | { status: "unconfigured" }
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; session: Session }
  /** Llegó desde el enlace de recuperación: debe fijar una contraseña nueva. */
  | { status: "recovery"; session: Session };

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    envProblems().length > 0 ? { status: "unconfigured" } : { status: "loading" },
  );

  useEffect(() => {
    if (state.status === "unconfigured") return;
    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setState((prev) => {
        if (prev.status === "recovery") return prev;
        return data.session ? { status: "signed_in", session: data.session } : { status: "signed_out" };
      });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setState({ status: "recovery", session });
        return;
      }
      setState((prev) => {
        if (!session) return { status: "signed_out" };
        if (prev.status === "recovery" && event !== "USER_UPDATED") return { status: "recovery", session };
        return { status: "signed_in", session };
      });
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signOut: async () => {
        if (state.status === "unconfigured") return;
        await getSupabase().auth.signOut();
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
