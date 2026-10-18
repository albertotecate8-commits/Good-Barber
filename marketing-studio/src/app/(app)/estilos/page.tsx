import Link from "next/link";
import { Building2 } from "lucide-react";
import { getActiveBusiness } from "@/lib/data/shell";
import { listMemory, listStyles } from "@/lib/data/studio";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { formatCents } from "@/lib/money";
import { ButtonLink, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { StylesManager } from "@/components/studio/styles-manager";
import { MemoryManager } from "@/components/studio/memory-manager";
import { LogoUploader } from "@/components/studio/logo-uploader";

export const metadata = { title: "Estilos y memoria" };

export default async function StylesPage() {
  const [, { active }] = await Promise.all([requireUser(), getActiveBusiness()]);
  if (!active)
    return (
      <>
        <PageHeader title="Estilos y memoria" />
        <EmptyState icon={Building2} title="Primero agrega un negocio" action={<ButtonLink href="/negocios">Ir a Negocios</ButtonLink>} />
      </>
    );
  const supabase = await createClient();
  const [styles, memory, brand, offerings, promotions, logos, approved, biz] = await Promise.all([
    listStyles(active.id),
    listMemory(active.id),
    supabase.from("mkt_brand_profiles").select("*").eq("business_id", active.id).maybeSingle(),
    supabase.from("mkt_offerings").select("name,price_cents,currency").eq("business_id", active.id).eq("active", true).order("sort_order"),
    supabase.from("mkt_promotions").select("title,ends_on").eq("business_id", active.id).eq("active", true),
    supabase.from("mkt_assets").select("id,title").eq("business_id", active.id).eq("kind", "logo").eq("upload_status", "ready").order("created_at", { ascending: false }).limit(4),
    supabase
      .from("mkt_creative_versions")
      .select("id,asset_id,title,qa_reviewed_at")
      .eq("business_id", active.id)
      .eq("is_final", true)
      .not("asset_id", "is", null)
      .order("qa_reviewed_at", { ascending: false })
      .limit(12),
    supabase.from("mkt_businesses").select("target_audience,sector,city").eq("id", active.id).maybeSingle(),
  ]);
  const b = brand.data;
  const colors = b ? [b.color_primary, b.color_secondary, b.color_accent, b.color_background] : [];

  return (
    <>
      <PageHeader
        eyebrow={active.name}
        title="Estilos y memoria"
        description={`Todo lo que el estudio usa al crear para ${active.name}. Es solo de este negocio: precios, logotipos y promociones nunca pasan a otra marca.`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card aria-labelledby="identidad">
          <CardTitle action={<Link href={`/negocios/${active.slug}?tab=marca`} className="text-sm font-medium text-action-strong underline">Editar</Link>}>
            <span id="identidad">Identidad</span>
          </CardTitle>
          {b ? (
            <dl className="grid gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted">Colores</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {colors.map((c, i) => (
                    <span key={`${c}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 font-mono text-xs">
                      <span aria-hidden className="size-4 rounded-full ring-1 ring-line" style={{ background: c }} /> {c}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted">Tipografías</dt>
                  <dd>{[b.font_heading, b.font_body].filter(Boolean).join(" / ") || "Sin definir"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Tono</dt>
                  <dd>{b.tone_of_voice || "Sin definir"}</dd>
                </div>
              </div>
              {(b.dos.length > 0 || b.donts.length > 0) && (
                <div>
                  <dt className="text-xs text-muted">Reglas</dt>
                  <dd>
                    {b.dos.map((d: string) => `✓ ${d}`).join(" · ")} {b.donts.map((d: string) => `✕ ${d}`).join(" · ")}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-muted">Público</dt>
                <dd>{biz.data?.target_audience || "Sin definir"}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted">Este negocio aún no tiene colores, tipografías ni tono guardados.</p>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-sm font-semibold">Logotipo</p>
            <LogoUploader businessId={active.id} businessName={active.name} logos={logos.data ?? []} />
          </div>
        </Card>

        <Card aria-labelledby="servicios">
          <CardTitle action={<Link href={`/negocios/${active.slug}?tab=servicios`} className="text-sm font-medium text-action-strong underline">Editar</Link>}>
            <span id="servicios">Servicios, precios y promociones</span>
          </CardTitle>
          <p className="mb-2 text-xs text-muted">El estudio solo usa estos precios. Si un anuncio menciona otro monto, se marca antes de aprobar.</p>
          {offerings.data?.length ? (
            <ul className="divide-y divide-line text-sm">
              {offerings.data.map((o) => (
                <li key={o.name} className="flex justify-between py-1.5">
                  <span>{o.name}</span>
                  <span className="font-semibold tabular-nums">{o.price_cents === null ? "Sin precio" : formatCents(o.price_cents, o.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sin servicios registrados: las propuestas no mencionarán precios.</p>
          )}
          {promotions.data?.length ? <p className="mt-3 text-sm">Promociones activas: {promotions.data.map((p) => p.title).join(" · ")}</p> : null}
        </Card>
      </div>

      <section id="estilos" aria-labelledby="estilos-titulo" className="mt-8">
        <h2 id="estilos-titulo" className="mb-1 text-lg font-semibold">
          Estilos
        </h2>
        <p className="mb-4 text-sm text-muted">Crea un estilo con nombre a partir de una imagen de referencia. La app mide la paleta, la luz y la composición; tú describes lo que no se puede medir.</p>
        <StylesManager businessId={active.id} businessName={active.name} styles={styles} />
      </section>

      <section id="memoria" aria-labelledby="memoria-titulo" className="mt-8">
        <h2 id="memoria-titulo" className="mb-1 text-lg font-semibold">
          Memoria
        </h2>
        <p className="mb-4 text-sm text-muted">
          Lo que el estudio recuerda de {active.name}. Solo se guarda cuando tú lo pides (aquí o con «Recuerda que…» en el chat). El estudio no dice que «aprendió» nada que no esté en esta lista.
        </p>
        <MemoryManager businessId={active.id} items={memory} />
      </section>

      <section aria-labelledby="aprobados-titulo" className="mt-8">
        <h2 id="aprobados-titulo" className="mb-3 text-lg font-semibold">
          Diseños aprobados
        </h2>
        {approved.data?.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {approved.data.map((v) => (
              <li key={v.id} className="flex flex-col gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
                <img src={`/api/biblioteca/archivo/${v.asset_id}`} alt={v.title || "Diseño aprobado"} className="aspect-[4/5] w-full rounded-xl bg-surface-3 object-cover" loading="lazy" />
                <span className="truncate text-xs text-muted">{v.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aún no hay diseños aprobados. Se agregan al usar «Revisar y aprobar» en el chat.</p>
        )}
      </section>
    </>
  );
}
