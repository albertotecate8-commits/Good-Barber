import { listBusinesses } from "@/lib/data/businesses";
import { geminiUnavailableReason } from "@/lib/director/gemini";
import { todayInTz } from "@/lib/tz";
import { DirectorForm } from "@/components/director/director-form";
import { ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { runDirector } from "./actions";

export const metadata = { title: "Director de Marketing" };

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ negocio?: string }> }) {
  const sp = await searchParams;
  const businesses = await listBusinesses();
  return (
    <>
      <PageHeader
        eyebrow="Crear con IA"
        title="Director de Marketing"
        description="Escribe lo que necesitas, elige el negocio y recibe una campaña basada en tus datos y en fuentes con enlace."
      />
      {businesses.length === 0 ? (
        <EmptyState title="Primero agrega tus negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
      ) : (
        <>
          <Notice tone="gold" title="Qué hace y qué no">
            Investiga fuentes públicas permitidas, arma la estrategia y deja todo listo para revisar. No inventa precios ni
            datos de competidores, no promete ventas y no publica en redes.
          </Notice>
          <Card className="mt-4">
            <DirectorForm
              action={runDirector}
              businesses={businesses.map((b) => ({ id: b.id, name: b.name, sector: b.sector }))}
              today={todayInTz()}
              geminiReason={geminiUnavailableReason(process.env)}
              defaultBusinessId={businesses.find((b) => b.slug === sp.negocio)?.id}
            />
          </Card>
        </>
      )}
    </>
  );
}
