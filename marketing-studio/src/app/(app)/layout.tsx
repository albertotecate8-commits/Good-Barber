import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/data/session";
import { signOut } from "@/app/auth-actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell email={user.email} signOut={signOut}>
      {children}
    </AppShell>
  );
}
