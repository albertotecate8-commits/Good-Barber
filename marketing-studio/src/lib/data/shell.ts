import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { listBusinessesWithColor } from "./businesses";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/validation/business";

// Datos de la barra superior: negocio activo y avisos reales (nada inventado).
// El negocio activo se guarda en una cookie solo como preferencia de
// presentación; los permisos los sigue decidiendo RLS en cada consulta.

export const ACTIVE_BUSINESS_COOKIE = "mkt_negocio";

export interface ShellBusiness {
  id: string;
  name: string;
  slug: string;
  color: string;
}

export interface ShellAlert {
  id: string;
  tone: "warn" | "danger" | "action";
  text: string;
  href: string;
}

/** Negocio activo: el de la cookie si el usuario lo puede ver; si no, el primero. */
export const getActiveBusiness = cache(async (): Promise<{ businesses: ShellBusiness[]; active: ShellBusiness | null }> => {
  const businesses = (await listBusinessesWithColor()).map((b) => ({ id: b.id, name: b.name, slug: b.slug, color: b.color }));
  const wanted = (await cookies()).get(ACTIVE_BUSINESS_COOKIE)?.value;
  const active = businesses.find((b) => b.id === wanted) ?? businesses[0] ?? null;
  return { businesses, active };
});

export const getShellAlerts = cache(async (): Promise<ShellAlert[]> => {
  const supabase = await createClient();
  const [review, failed, socials] = await Promise.all([
    supabase.from("mkt_content_items").select("id", { count: "exact", head: true }).eq("status", "review"),
    supabase.from("mkt_content_items").select("id", { count: "exact", head: true }).eq("status", "error"),
    supabase.from("mkt_social_accounts").select("id, platform, business_id, connection_status").in("connection_status", ["expired", "error"]),
  ]);
  const alerts: ShellAlert[] = [];
  if (failed.count) alerts.push({ id: "error", tone: "danger", text: `${failed.count} publicación(es) con error al publicar`, href: "/calendario?estado=error" });
  if (review.count) alerts.push({ id: "review", tone: "warn", text: `${review.count} publicación(es) esperan tu revisión`, href: "/calendario?estado=review" });
  for (const s of socials.data ?? [])
    alerts.push({ id: `s-${s.id}`, tone: "danger", text: `${PLATFORM_LABELS[s.platform as SocialPlatform]}: hay que volver a conectar la cuenta`, href: "/negocios" });
  return alerts;
});
