import Link from "next/link";
import { listBusinesses } from "@/lib/data/businesses";
import { listAssetOptions } from "@/lib/data/assets";
import { isValidDateString } from "@/lib/tz";
import { ContentForm } from "@/components/content-form";
import { ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { createContent } from "../actions";

export const metadata = { title: "Nueva publicación" };

export default async function NewContentPage({ searchParams }: { searchParams: Promise<{ fecha?: string; negocio?: string }> }) {
  const sp = await searchParams;
  const [businesses, assets] = await Promise.all([listBusinesses(), listAssetOptions()]);
  const defaults = {
    business_id: businesses.find((b) => b.slug === sp.negocio)?.id,
    date: sp.fecha && isValidDateString(sp.fecha) ? sp.fecha : undefined,
  };
  return (
    <>
      <Link href="/calendario" className="text-sm text-muted hover:text-ink">
        ← Calendario
      </Link>
      <PageHeader title="Nueva publicación" />
      {businesses.length === 0 ? (
        <EmptyState title="No hay negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
      ) : (
        <>
          <Notice tone="gold">
            Guardar o programar no publica en redes sociales: la publicación se hace manualmente hasta que exista una
            integración oficial.
          </Notice>
          <Card className="mt-4">
            <ContentForm
              action={createContent}
              businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
              assets={assets}
              defaults={defaults}
              submitLabel="Guardar publicación"
            />
          </Card>
        </>
      )}
    </>
  );
}
