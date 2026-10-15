import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  isAdmin: boolean;
}

// Verifica la sesión contra el servidor de Auth (getUser, no getSession) una
// vez por petición.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("mkt_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return { id: user.id, email: user.email ?? "", isAdmin: Boolean(data) };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
