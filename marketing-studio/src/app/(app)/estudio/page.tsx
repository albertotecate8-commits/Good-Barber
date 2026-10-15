import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listBusinessesWithColor } from "@/lib/data/businesses";
import { listCreativeProjects } from "@/lib/data/creative";
import { MATERIAL_LABELS, formatByKey } from "@/lib/creative/formats";
import { formatDateTime } from "@/lib/dates";
import { NewProjectForm } from "@/components/creative/new-project-form";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, Notice, PageHeader } from "@/components/ui";
import { createProject } from "./actions";

export const metadata = { title: "Estudio creativo" };

const STATUS = { draft: "Borrador", in_review: "En revisión", approved: "Aprobado", archived: "Archivado" } as const;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ negocio?: string; campana?: string; eliminado?: string }> }) {
  const sp = await searchParams;
  const businesses = await listBusinessesWithColor();
  const selected = businesses.find((b) => b.slug === sp.negocio);
  const projects = await listCreativeProjects(selected?.id);
  const supabase = await createClient();
  const [{ data: campaigns }, { data: refs }] = await Promise.all([
    supabase.from("mkt_campaigns").select("id,business_id,name").order("created_at", { ascending: false }).limit(200),
    supabase.from("mkt_assets").select("id,business_id,title,kind").eq("upload_status", "ready").in("kind", ["image", "logo"]).order("created_at", { ascending: false }).limit(300),
  ]);
  const biz = new Map(businesses.map((b) => [b.id, b]));

  return (
    <>
      <PageHeader title="Estudio creativo" description="Conceptos, prompts para tus herramientas, edición real por código, video y revisión de calidad." />
      <Notice tone="gold" title="Qué es real y qué es asistido">
        Real en la app: conceptos y prompts, editor gráfico (recortar, textos y precios exactos, logotipo, formatos), montaje de video con
        FFmpeg y control de calidad. Asistido: la generación de imágenes y video con IA se hace en ChatGPT, Gemini o Google Flow con tus
        suscripciones, y el resultado se importa. La app no genera imágenes con IA por sí sola.
      </Notice>
      {sp.eliminado === "1" && (
        <div className="mt-4" role="status">
          <Notice tone="positive">Proyecto eliminado. Sus archivos siguen en la Biblioteca.</Notice>
        </div>
      )}
      {businesses.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Primero agrega tus negocios" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_420px]">
          <Card>
            <CardTitle>Proyectos</CardTitle>
            <form method="get" className="mb-3 flex gap-2" aria-label="Filtrar por negocio">
              <select name="negocio" defaultValue={selected?.slug ?? ""} className="input min-h-10 py-1.5 text-sm" aria-label="Negocio">
                <option value="">Todos los negocios</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.slug}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button className="rounded-xl border border-line-strong px-3 text-sm">Filtrar</button>
            </form>
            {projects.length === 0 ? (
              <EmptyState title="Aún no hay proyectos">Crea uno a la derecha; puedes partir de una campaña del Director.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {projects.map((p) => (
                  <li key={p.id}>
                    <Link href={`/estudio/${p.id}`} className="block py-3 hover:text-action-strong" style={{ borderLeft: `3px solid ${biz.get(p.business_id)?.color}`, paddingLeft: 10 }}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{p.title}</span>
                        <Badge tone="action">{STATUS[p.status]}</Badge>
                      </span>
                      <span className="block text-xs text-muted">
                        {biz.get(p.business_id)?.name} · {MATERIAL_LABELS[p.material_type]} · {formatByKey(p.format_key)?.label ?? p.format_key} · {formatDateTime(p.updated_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Nuevo proyecto</CardTitle>
            <NewProjectForm
              action={createProject}
              businesses={businesses.map((b) => ({ id: b.id, name: b.name }))}
              campaigns={(campaigns ?? []).map((c) => ({ id: c.id, business_id: c.business_id, title: c.name }))}
              references={(refs ?? []).map((r) => ({ id: r.id, business_id: r.business_id, title: r.title, kind: r.kind }))}
              defaultBusinessId={selected?.id}
              defaultCampaignId={sp.campana}
            />
          </Card>
        </div>
      )}
    </>
  );
}
