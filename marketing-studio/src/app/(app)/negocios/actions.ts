"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { INITIAL_BUSINESSES } from "@/lib/data/initial-businesses";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import {
  brandSchema,
  businessSchema,
  firstErrors,
  formToObject,
  offeringSchema,
  promotionSchema,
  socialSchema,
} from "@/lib/validation/business";

// Cada acción vuelve a verificar la sesión: nunca se confía en el navegador.
// La autorización por negocio la aplica RLS en la base de datos.

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!uuid.test(id)) throw new Error("Identificador inválido");
}

async function slugOf(businessId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("mkt_businesses").select("slug").eq("id", businessId).maybeSingle();
  return data?.slug as string | undefined;
}

async function refresh(businessId: string) {
  const slug = await slugOf(businessId);
  revalidatePath("/", "layout");
  if (slug) revalidatePath(`/negocios/${slug}`);
}

export async function createBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!user.isAdmin) return { message: "Solo un administrador puede crear negocios." };
  const parsed = businessSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const supabase = await createClient();
  // El id se genera aquí para no depender de RETURNING (la membresía se crea
  // en un trigger AFTER INSERT).
  const { error } = await supabase.from("mkt_businesses").insert({ id: randomUUID(), ...parsed.data, created_by: user.id });
  if (error) return { message: friendlyDbError(error) };
  revalidatePath("/", "layout");
  redirect(`/negocios/${parsed.data.slug}`);
}

export async function updateBusiness(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(businessId);
  const parsed = businessSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const before = await slugOf(businessId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_businesses").update(parsed.data).eq("id", businessId).select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar este negocio." };
  revalidatePath("/", "layout");
  if (before !== parsed.data.slug) redirect(`/negocios/${parsed.data.slug}`);
  return { ok: true, message: "Datos del negocio guardados." };
}

export async function archiveBusiness(businessId: string): Promise<void> {
  await requireUser();
  assertId(businessId);
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_businesses").update({ status: "archived" }).eq("id", businessId);
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/", "layout");
  redirect("/negocios");
}

export async function updateBrand(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(businessId);
  const parsed = brandSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_brand_profiles")
    .update(parsed.data)
    .eq("business_id", businessId)
    .select("business_id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar esta marca." };
  await refresh(businessId);
  return { ok: true, message: "Identidad de marca guardada." };
}

export async function addOffering(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(businessId);
  const parsed = offeringSchema.safeParse(formToObject(form, ["active"]));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const { price, ...rest } = parsed.data;
  const supabase = await createClient();
  const { count } = await supabase
    .from("mkt_offerings")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const { error } = await supabase
    .from("mkt_offerings")
    .insert({ ...rest, price_cents: price, business_id: businessId, sort_order: (count ?? 0) + 1 });
  if (error) return { message: friendlyDbError(error) };
  await refresh(businessId);
  return { ok: true, message: `«${rest.name}» agregado.` };
}

export async function updateOffering(offeringId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(offeringId);
  const parsed = offeringSchema.safeParse(formToObject(form, ["active"]));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const { price, ...rest } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_offerings")
    .update({ ...rest, price_cents: price })
    .eq("id", offeringId)
    .select("business_id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar este servicio." };
  await refresh(data[0].business_id);
  return { ok: true, message: "Guardado." };
}

export async function deleteOffering(offeringId: string): Promise<void> {
  await requireUser();
  assertId(offeringId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_offerings").delete().eq("id", offeringId).select("business_id");
  if (error) throw new Error(friendlyDbError(error));
  if (data?.[0]) await refresh(data[0].business_id);
}

export async function addPromotion(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(businessId);
  const parsed = promotionSchema.safeParse(formToObject(form, ["active"]));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_promotions").insert({ ...parsed.data, business_id: businessId });
  if (error) return { message: friendlyDbError(error) };
  await refresh(businessId);
  return { ok: true, message: "Promoción guardada." };
}

export async function togglePromotion(promotionId: string, active: boolean): Promise<void> {
  await requireUser();
  assertId(promotionId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mkt_promotions")
    .update({ active })
    .eq("id", promotionId)
    .select("business_id");
  if (error) throw new Error(friendlyDbError(error));
  if (data?.[0]) await refresh(data[0].business_id);
}

export async function deletePromotion(promotionId: string): Promise<void> {
  await requireUser();
  assertId(promotionId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_promotions").delete().eq("id", promotionId).select("business_id");
  if (error) throw new Error(friendlyDbError(error));
  if (data?.[0]) await refresh(data[0].business_id);
}

export async function addSocial(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(businessId);
  const parsed = socialSchema.safeParse(formToObject(form));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const supabase = await createClient();
  // Se registra como "manual": el perfil existe pero la app NO está conectada.
  const { error } = await supabase
    .from("mkt_social_accounts")
    .insert({ ...parsed.data, business_id: businessId, connection_status: "manual" });
  if (error) return { message: friendlyDbError(error) };
  await refresh(businessId);
  return { ok: true, message: "Perfil registrado (sin conexión automática)." };
}

export async function deleteSocial(socialId: string): Promise<void> {
  await requireUser();
  assertId(socialId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_social_accounts").delete().eq("id", socialId).select("business_id");
  if (error) throw new Error(friendlyDbError(error));
  if (data?.[0]) await refresh(data[0].business_id);
}

/** Crea Good Barber, Glamour Studio y AFORE PRO con los datos conocidos. Idempotente. */
export async function loadInitialBusinesses(): Promise<ActionState> {
  const user = await requireUser();
  if (!user.isAdmin) return { message: "Solo un administrador puede cargar los negocios iniciales." };
  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("mkt_businesses").select("slug");
  if (readError) return { message: friendlyDbError(readError) };
  const have = new Set((existing ?? []).map((b) => b.slug));
  const created: string[] = [];

  for (const b of INITIAL_BUSINESSES) {
    if (have.has(b.slug)) continue;
    const id = randomUUID();
    const { error } = await supabase.from("mkt_businesses").insert({
      id,
      slug: b.slug,
      name: b.name,
      sector: b.sector,
      description: b.description,
      city: b.city,
      created_by: user.id,
    });
    if (error) return { message: `${b.name}: ${friendlyDbError(error)}` };
    const steps = [
      b.brand && supabase.from("mkt_brand_profiles").update(b.brand).eq("business_id", id),
      b.offerings.length &&
        supabase
          .from("mkt_offerings")
          .insert(b.offerings.map((o, i) => ({ ...o, business_id: id, sort_order: i + 1 }))),
      b.socials.length &&
        supabase
          .from("mkt_social_accounts")
          .insert(b.socials.map((s) => ({ ...s, business_id: id, connection_status: "manual" }))),
    ].filter(Boolean);
    for (const r of await Promise.all(steps)) {
      if (r && r.error) return { message: `${b.name}: ${friendlyDbError(r.error)}` };
    }
    created.push(b.name);
  }
  revalidatePath("/", "layout");
  // El botón desaparece al existir negocios: el aviso de éxito lo muestra el panel.
  redirect(created.length ? "/?cargados=1" : "/");
}
