import Link from "next/link";
import clsx from "clsx";
import type { Metadata } from "next";
import { getBusinessBySlug, getBusinessDetail } from "@/lib/data/businesses";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/dates";
import { PLATFORM_LABELS } from "@/lib/validation/business";
import { Badge, Card, CardTitle, EmptyState, Notice } from "@/components/ui";
import { ConnectionBadge } from "@/components/connection-badge";
import { MetaConnectCard } from "@/components/meta-connect-card";
import { createClient } from "@/lib/supabase/server";
import { metaConfig } from "@/lib/meta/config";
import {
  BrandForm,
  BusinessForm,
  ConfirmButton,
  OfferingForm,
  PromotionForm,
  SocialForm,
} from "@/components/business-forms";
import {
  addOffering,
  addPromotion,
  addSocial,
  archiveBusiness,
  deleteOffering,
  deletePromotion,
  deleteSocial,
  togglePromotion,
  updateBrand,
  updateBusiness,
  updateOffering,
} from "../actions";

const TABS = [
  ["datos", "Datos"],
  ["marca", "Identidad de marca"],
  ["servicios", "Servicios y precios"],
  ["promociones", "Promociones"],
  ["redes", "Redes sociales"],
  ["historial", "Historial"],
] as const;
type Tab = (typeof TABS)[number][0];

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; meta?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await getBusinessBySlug(slug);
  return { title: b.name };
}

const ENTITY_LABELS: Record<string, string> = {
  mkt_businesses: "Negocio",
  mkt_brand_profiles: "Identidad de marca",
  mkt_offerings: "Servicio",
  mkt_promotions: "Promoción",
  mkt_social_accounts: "Perfil social",
  mkt_campaigns: "Campaña",
  mkt_content_items: "Publicación",
};
const ACTION_LABELS: Record<string, string> = { insert: "Creado", update: "Editado", delete: "Eliminado" };

export default async function BusinessPage({ params, searchParams }: Props) {
  const [{ slug }, { tab: rawTab, meta: metaResult }] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "datos";
  const { business, brand, offerings, promotions, socials, audit } = await getBusinessDetail(slug);
  const accent = brand?.color_primary ?? "#C9A227";

  return (
    <>
      <div className="mb-5">
        <Link href="/negocios" className="text-sm text-muted hover:text-ink">
          ← Negocios
        </Link>
        <div className="mt-3 flex items-center gap-4">
          {brand?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL externa definida por el usuario
            <img src={brand.logo_url} alt={`Logotipo de ${business.name}`} className="size-14 rounded-2xl object-cover" />
          ) : (
            <div
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-2xl text-xl font-bold"
              style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}
            >
              {business.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{business.name}</h1>
            <p className="truncate text-sm text-muted">{[business.sector, business.city].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
      </div>

      <nav aria-label="Secciones del negocio" className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {TABS.map(([key, label]) => (
            <li key={key}>
              <Link
                href={`/negocios/${business.slug}?tab=${key}`}
                aria-current={tab === key ? "page" : undefined}
                className={clsx(
                  "-mb-px flex min-h-11 items-center border-b-2 px-3 text-sm",
                  tab === key ? "font-medium text-ink" : "border-transparent text-muted hover:text-ink",
                )}
                style={tab === key ? { borderColor: accent } : undefined}
                scroll={false}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "datos" && (
        <div className="grid gap-4">
          <Card>
            <CardTitle>Datos del negocio</CardTitle>
            <BusinessForm action={updateBusiness.bind(null, business.id)} business={business} submitLabel="Guardar cambios" />
          </Card>
          <Card>
            <CardTitle>Archivar</CardTitle>
            <p className="mb-3 text-sm text-muted">
              Oculta el negocio del panel sin borrar su información. Solo puede reactivarse desde la base de datos por
              ahora.
            </p>
            <ConfirmButton
              action={archiveBusiness.bind(null, business.id)}
              confirmText={`¿Archivar ${business.name}? Sus datos se conservan.`}
            >
              Archivar negocio
            </ConfirmButton>
          </Card>
        </div>
      )}

      {tab === "marca" &&
        (brand ? (
          <Card>
            <CardTitle>Identidad de marca</CardTitle>
            <p className="mb-4 text-sm text-muted">
              La IA usará estos datos para que cada pieza respete los colores, el tono y las reglas de {business.name}.
            </p>
            <div className="mb-5 flex h-16 overflow-hidden rounded-xl border border-line" aria-label="Vista previa de colores">
              {[brand.color_background, brand.color_secondary, brand.color_primary, brand.color_accent].map((c, i) => (
                <div key={i} className="flex-1" style={{ background: c }} title={c} />
              ))}
            </div>
            <BrandForm action={updateBrand.bind(null, business.id)} brand={brand} />
          </Card>
        ) : (
          <Notice tone="danger">No se encontró el perfil de marca de este negocio.</Notice>
        ))}

      {tab === "servicios" && (
        <div className="grid gap-4">
          <Card>
            <CardTitle>Servicios y precios</CardTitle>
            {offerings.length === 0 ? (
              <EmptyState title="Sin servicios registrados">
                Los anuncios solo usarán precios que estén aquí: la IA no inventa precios.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {offerings.map((o) => (
                  <li key={o.id} className="py-3">
                    <details className="group">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{o.name}</span>
                          <span className="text-xs text-muted">
                            {o.kind === "package" ? "Paquete" : o.kind === "product" ? "Producto" : "Servicio"}
                            {!o.active && " · inactivo"}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums">{formatCents(o.price_cents, o.currency)}</span>
                          <span className="text-xs text-action-strong group-open:hidden">Editar</span>
                        </span>
                      </summary>
                      <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
                        <OfferingForm action={updateOffering.bind(null, o.id)} offering={o} submitLabel="Guardar" />
                        <div className="mt-3 border-t border-line pt-3">
                          <ConfirmButton action={deleteOffering.bind(null, o.id)} confirmText={`¿Eliminar «${o.name}»?`} variant="ghost">
                            Eliminar
                          </ConfirmButton>
                        </div>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Agregar servicio o producto</CardTitle>
            <OfferingForm action={addOffering.bind(null, business.id)} submitLabel="Agregar" />
          </Card>
        </div>
      )}

      {tab === "promociones" && (
        <div className="grid gap-4">
          <Card>
            <CardTitle>Promociones</CardTitle>
            {promotions.length === 0 ? (
              <EmptyState title="Sin promociones">Registra las promociones vigentes y sus restricciones.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {promotions.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.title} {p.active ? <Badge tone="positive">Activa</Badge> : <Badge>Pausada</Badge>}
                      </p>
                      {p.details && <p className="text-sm text-muted">{p.details}</p>}
                      {p.restrictions && <p className="text-xs text-faint">Restricciones: {p.restrictions}</p>}
                      <p className="text-xs text-faint">
                        {formatDate(p.starts_on)} – {formatDate(p.ends_on)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <ConfirmButton
                        action={togglePromotion.bind(null, p.id, !p.active)}
                        confirmText={p.active ? "¿Pausar esta promoción?" : "¿Activar esta promoción?"}
                        variant="secondary"
                      >
                        {p.active ? "Pausar" : "Activar"}
                      </ConfirmButton>
                      <ConfirmButton action={deletePromotion.bind(null, p.id)} confirmText="¿Eliminar esta promoción?" variant="ghost">
                        Eliminar
                      </ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Nueva promoción</CardTitle>
            <PromotionForm action={addPromotion.bind(null, business.id)} />
          </Card>
        </div>
      )}

      {tab === "redes" && (
        <div className="grid gap-4">
          <Notice tone="gold" title="Registrar no es conectar">
            Aquí anotas los perfiles del negocio. Un perfil solo aparece como «Conectado» después de que autorizas la
            app en el diálogo oficial de Meta y Meta lo confirma. La app todavía <strong>no</strong> publica. Nunca se
            guardan contraseñas.
          </Notice>
          <MetaConnectCard
            businessId={business.id}
            isOwner={await isOwnerOf(business.id)}
            missing={metaConfig().missing}
            connected={socials.some((s) => s.connection_status === "connected")}
            result={metaResult}
          />
          <Card>
            <CardTitle>Perfiles</CardTitle>
            {socials.length === 0 ? (
              <EmptyState title="Sin perfiles registrados" />
            ) : (
              <ul className="divide-y divide-line">
                {socials.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {PLATFORM_LABELS[s.platform]}
                        {s.handle && (
                          <span className="text-muted">
                            {" "}
                            · {s.platform === "instagram" || s.platform === "tiktok" ? "@" : ""}
                            {s.handle}
                          </span>
                        )}
                      </p>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="break-all text-xs text-action-strong hover:underline">
                          {s.url}
                        </a>
                      )}
                      {s.notes && <p className="text-xs text-faint">{s.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <ConnectionBadge status={s.connection_status} />
                      <ConfirmButton action={deleteSocial.bind(null, s.id)} confirmText="¿Quitar este perfil de la app? (No afecta a la red social)" variant="ghost">
                        Quitar
                      </ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>Registrar perfil</CardTitle>
            <SocialForm action={addSocial.bind(null, business.id)} />
          </Card>
        </div>
      )}

      {tab === "historial" && (
        <Card>
          <CardTitle>Últimos cambios</CardTitle>
          {audit.length === 0 ? (
            <EmptyState title="Sin cambios registrados" />
          ) : (
            <ul className="divide-y divide-line text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span>
                    <span className="font-medium">{ACTION_LABELS[a.action] ?? a.action}</span>{" "}
                    <span className="text-muted">{ENTITY_LABELS[a.entity] ?? a.entity}</span>
                    {typeof a.details?.name === "string" && <span className="text-muted"> · {a.details.name}</span>}
                  </span>
                  <span className="text-xs text-faint">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}

async function isOwnerOf(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("mkt_is_owner", { p_business: businessId });
  return Boolean(data);
}
