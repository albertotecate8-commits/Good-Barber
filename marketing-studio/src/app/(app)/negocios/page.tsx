import Link from "next/link";
import { Plus } from "lucide-react";
import { listBusinesses } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { ButtonLink, EmptyState, Notice, PageHeader } from "@/components/ui";
import { LoadInitialButton } from "@/components/load-initial-button";

export const metadata = { title: "Negocios" };

const META_MESSAGES: Record<string, string> = {
  "sin-configurar": "La conexión con Meta no está configurada en el servidor. No se conectó nada.",
  "estado-invalido": "La respuesta de Meta no coincidió con tu solicitud (protección contra falsificación). No se conectó nada.",
  "sin-permiso": "Solo el dueño de un negocio puede conectarlo con Meta. No se conectó nada.",
  invalido: "Solicitud de conexión inválida. No se conectó nada.",
};

export default async function BusinessesPage({ searchParams }: { searchParams: Promise<{ meta?: string }> }) {
  const user = await requireUser();
  const { meta } = await searchParams;
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
      {meta && META_MESSAGES[meta] && (
        <div className="mb-4">
          <Notice tone="warn" title="Conexión con Meta">
            {META_MESSAGES[meta]}
          </Notice>
        </div>
      )}
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
