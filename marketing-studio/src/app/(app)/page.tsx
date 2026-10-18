import Link from "next/link";
import { Building2 } from "lucide-react";
import { getActiveBusiness } from "@/lib/data/shell";
import { destinationsReadiness, getStudio } from "@/lib/data/studio";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { StudioChat } from "@/components/studio/chat";
import { EmptyState, ButtonLink } from "@/components/ui";

export const metadata = { title: "Crear" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ c?: string; nueva?: string; estilo?: string; idea?: string }> }) {
  const [, sp, { active }] = await Promise.all([requireUser(), searchParams, getActiveBusiness()]);
  if (!active)
    return (
      <>
        <h1 className="sr-only">Crear</h1>
        <EmptyState icon={Building2} title="Primero agrega un negocio" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>}>
          El estudio crea imágenes y anuncios para cada negocio con su propia identidad y memoria.
        </EmptyState>
      </>
    );
  const fresh = sp.nueva === "1";
  const threadId = !fresh && sp.c && UUID.test(sp.c) ? sp.c : null;
  const supabase = await createClient();
  const [studio, readiness, { data: offerings }] = await Promise.all([
    getStudio(active.id, fresh ? "00000000-0000-0000-0000-000000000000" : threadId),
    destinationsReadiness(active.id),
    supabase.from("mkt_offerings").select("name,price_cents").eq("business_id", active.id).eq("active", true).order("sort_order"),
  ]);
  const thread = fresh ? null : studio.thread;
  return (
    <>
      <h1 className="sr-only">Crear</h1>
      <StudioChat
        key={`${active.id}-${thread?.id ?? "nueva"}`}
        business={{ id: active.id, name: active.name, slug: active.slug, color: active.color }}
        thread={thread ? { id: thread.id, title: thread.title, styleId: thread.style_id } : null}
        threads={studio.threads.map((t) => ({ id: t.id, title: t.title, updatedAt: t.updated_at }))}
        messages={thread ? studio.messages : []}
        versions={thread ? studio.versions : []}
        publications={thread ? studio.publications : []}
        styles={studio.styles.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name, palette: s.attributes.measured?.palette.slice(0, 4).map((p) => p.hex) ?? [], createdAt: s.created_at }))}
        memoryCount={studio.memory.filter((m) => m.active).length}
        recentImages={studio.recentImages}
        hasLogo={studio.hasLogo}
        logo={studio.logo}
        prices={(offerings ?? []).filter((o) => o.price_cents !== null).map((o) => ({ name: o.name, cents: o.price_cents as number }))}
        readiness={{
          facebook_page: { ready: readiness.facebook_page.ready, reason: readiness.facebook_page.reason, accountName: readiness.facebook_page.accountName, publishingOn: readiness.facebook_page.publishingOn },
          instagram: { ready: readiness.instagram.ready, reason: readiness.instagram.reason, accountName: readiness.instagram.accountName, publishingOn: readiness.instagram.publishingOn },
        }}
        initialStyleId={sp.estilo && UUID.test(sp.estilo) ? sp.estilo : null}
        initialText={typeof sp.idea === "string" ? sp.idea.slice(0, 500) : ""}
      />
      <p className="sr-only">
        <Link href="/resumen">Ver resumen del negocio</Link>
      </p>
    </>
  );
}
