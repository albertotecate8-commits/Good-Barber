import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/data/session";
import { createClient } from "@/lib/supabase/server";
import { getActiveBusiness } from "@/lib/data/shell";
import { listBusinesses } from "@/lib/data/businesses";
import { todayInTz } from "@/lib/tz";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import type { WizardBusiness } from "@/components/ad-wizard";
import { AdWizardLoader } from "@/components/ad-wizard-loader";
import { saveAd } from "../actions";

export const metadata = { title: "Crear anuncio" };

export default async function NewAdPage() {
  const user = await requireUser();
  const [businesses, { active }] = await Promise.all([listBusinesses(), getActiveBusiness()]);
  if (!businesses.length)
    return (
      <>
        <PageHeader title="Crear anuncio" />
        <EmptyState
          icon={Building2}
          title="Primero agrega un negocio"
          action={<ButtonLink href={user.isAdmin ? "/" : "/negocios"}>{user.isAdmin ? "Cargar mis negocios" : "Ver negocios"}</ButtonLink>}
        >
          Los anuncios usan los servicios, precios e identidad de cada negocio.
        </EmptyState>
      </>
    );

  const ids = businesses.map((b) => b.id);
  const supabase = await createClient();
  const [offerings, promotions, socials, assets, brands] = await Promise.all([
    supabase.from("mkt_offerings").select("id,business_id,name,price_cents,kind,description").in("business_id", ids).eq("active", true).order("sort_order"),
    supabase.from("mkt_promotions").select("id,business_id,title,details,restrictions,ends_on").in("business_id", ids).eq("active", true),
    supabase.from("mkt_social_accounts").select("id,business_id,platform,handle,connection_status").in("business_id", ids),
    supabase.from("mkt_assets").select("id,business_id,title,kind,mime_type").in("business_id", ids).eq("upload_status", "ready").in("kind", ["image", "video"]).order("created_at", { ascending: false }).limit(300),
    supabase.from("mkt_brand_profiles").select("business_id,color_primary").in("business_id", ids),
  ]);
  const today = todayInTz();
  const color = new Map((brands.data ?? []).map((b) => [b.business_id as string, b.color_primary as string]));

  const data: WizardBusiness[] = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    city: b.city,
    sector: b.sector,
    color: color.get(b.id) ?? "#0e7c82",
    offerings: (offerings.data ?? []).filter((o) => o.business_id === b.id).map((o) => ({ id: o.id, name: o.name, priceCents: o.price_cents, kind: o.kind, description: o.description })),
    // Promociones vencidas no se ofrecen.
    promotions: (promotions.data ?? [])
      .filter((p) => p.business_id === b.id && (!p.ends_on || p.ends_on >= today))
      .map((p) => ({ id: p.id, title: p.title, details: p.details, restrictions: p.restrictions })),
    socials: (socials.data ?? []).filter((s) => s.business_id === b.id).map((s) => ({ platform: s.platform, handle: s.handle, status: s.connection_status })),
    assets: (assets.data ?? []).filter((a) => a.business_id === b.id).map((a) => ({ id: a.id, title: a.title, kind: a.kind, mime: a.mime_type })),
  }));

  return (
    <>
      <PageHeader eyebrow="Asistente" title="Crear anuncio" description="Siete pasos cortos. Tu avance se guarda solo en este dispositivo hasta que lo guardes en el calendario." />
      <AdWizardLoader businesses={data} activeId={active?.id ?? data[0].id} today={today} save={saveAd} />
    </>
  );
}
