"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import type { ActionState } from "@/lib/action-state";
import { MetaError } from "@/lib/meta/graph";
import { disconnectMeta, linkPage } from "@/lib/meta/service";

// La autorización por negocio se comprueba con la sesión del usuario (RLS)
// antes de tocar nada con la service_role.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_ID = /^\d{5,25}$/;

async function ownerSlug(businessId: string) {
  const supabase = await createClient();
  const [{ data: biz }, { data: isOwner }] = await Promise.all([
    supabase.from("mkt_businesses").select("slug").eq("id", businessId).maybeSingle(),
    supabase.rpc("mkt_is_owner", { p_business: businessId }),
  ]);
  return biz && isOwner ? (biz.slug as string) : null;
}

export async function linkMetaPage(sessionId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const pageId = String(form.get("page_id") ?? "");
  if (!UUID.test(sessionId)) return { message: "Sesión de autorización inválida." };
  if (!PAGE_ID.test(pageId)) return { message: "Elige una de tus páginas.", errors: { page_id: "Elige una página." } };
  if (form.get("confirm") !== "on") return { message: "Confirma que es la página correcta.", errors: { confirm: "Marca la casilla." } };
  let slug: string | null = null;
  try {
    const linked = await linkPage({ sessionId, userId: user.id, pageId });
    slug = await ownerSlug(linked.businessId);
    if (!slug) return { message: "Ya no eres dueño de este negocio." };
  } catch (e) {
    return { message: e instanceof MetaError ? e.message : "No se pudo vincular la página." };
  }
  revalidatePath(`/negocios/${slug}`);
  redirect(`/negocios/${slug}?tab=redes&meta=conectado`);
}

export async function disconnectMetaAccounts(businessId: string): Promise<void> {
  await requireUser();
  if (!UUID.test(businessId)) throw new Error("Identificador inválido");
  const slug = await ownerSlug(businessId);
  if (!slug) throw new Error("Solo el dueño del negocio puede desconectar.");
  await disconnectMeta(businessId);
  revalidatePath(`/negocios/${slug}`);
}
