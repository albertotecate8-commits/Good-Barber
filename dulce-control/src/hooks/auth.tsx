import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type SessionUser } from "../api";
import { useQueryClient } from "@tanstack/react-query";

const Ctx = createContext<SessionUser | null | undefined>(undefined);
export const useUser = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const qc = useQueryClient();
  useEffect(() => {
    api.getUser().then(setUser).catch(() => setUser(null));
    return api.onAuthChange((u) => {
      setUser((prev) => {
        if (prev?.id !== u?.id) qc.clear();
        return u;
      });
    });
  }, [qc]);
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}
