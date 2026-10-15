import Link from "next/link";
import { Plus } from "lucide-react";
import { listBusinesses } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { LoadInitialButton } from "@/components/load-initial-button";

export const metadata = { title: "Negocios" };

export default async function BusinessesPage() {
  const user = await requireUser();
  const businesses = await listBusinesses();
  return (
    <>
      <PageHeader
        title="Negocios"
        description="Cada negocio tiene su identidad, servicios, perfiles y datos separados del resto."
        actions={
          user.isAdmin && (
            <ButtonLink href="/negocios/nuevo">
              <Plus className="size-4" aria-hidden /> Nuevo negocio
            </ButtonLink>
          )
        }
      />
      {businesses.length === 0 ? (
        <EmptyState title="Aún no hay negocios" action={user.isAdmin ? <LoadInitialButton /> : undefined}>
          Carga tus negocios iniciales o crea uno nuevo.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {businesses.map((b) => (
            <li key={b.id}>
              <Link href={`/negocios/${b.slug}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.name}</p>
                  <p className="truncate text-sm text-muted">
                    {[b.sector, b.city].filter(Boolean).join(" · ") || "Sin completar"}
                  </p>
                </div>
                <span className="text-sm text-action-strong">Abrir</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
