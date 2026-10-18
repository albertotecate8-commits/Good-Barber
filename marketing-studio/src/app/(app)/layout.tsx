import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/data/session";
import { getActiveBusiness, getShellAlerts } from "@/lib/data/shell";
import { signOut } from "@/app/auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [{ businesses, active }, alerts] = await Promise.all([getActiveBusiness(), getShellAlerts()]);
  return (
    <AppShell email={user.email} signOut={signOut} businesses={businesses} activeId={active?.id ?? null} alerts={alerts}>
      {children}
    </AppShell>
  );
}
