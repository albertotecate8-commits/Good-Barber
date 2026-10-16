"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/validation/business";
import { LEAD_STATUSES, leadSchema, prepareImport, type LeadStatus } from "@/lib/validation/lead";

// Prospectos y ventas: todo pasa por la sesión del usuario (RLS). La base
// impide asociar campañas o publicaciones de otro negocio.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath("/mensajes");
  revalidatePath("/analiticas");
};

export async function createLead(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = leadSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { message: "Revisa los datos del prospecto.", errors };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_leads").insert(parsed.data);
  if (error) return { message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Prospecto registrado." };
}

export async function updateLead(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(id)) return { message: "Identificador inválido." };
  const status = String(form.get("status") ?? "") as LeadStatus;
  if (!LEAD_STATUSES.includes(status)) return { message: "Estado no válido." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("mkt_leads").select("*").eq("id", id).maybeSingle();
  if (!current) return { message: "El prospecto no existe o no tienes acceso." };
  const parsed = leadSchema.safeParse({
    business_id: current.business_id,
    campaign_id: current.campaign_id ?? "",
    occurred_on: current.occurred_on,
    source: current.source,
    contact_name: current.contact_name,
    contact_hint: current.contact_hint,
    status,
    value: status === "customer" ? String(form.get("value") ?? "") : "",
    attribution: current.attribution,
    notes: current.notes,
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  const { error } = await supabase.from("mkt_leads").update({ status, value_cents: parsed.data.value_cents }).eq("id", id);
  if (error) return { message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: "Actualizado." };
}

export async function deleteLead(id: string): Promise<void> {
  await requireUser();
  if (!UUID.test(id)) throw new Error("Identificador inválido");
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_leads").delete().eq("id", id);
  if (error) throw new Error(friendlyDbError(error));
  refresh();
}

/** Importa un CSV. Si alguna fila tiene errores no se importa nada (todo o nada). */
export async function importLeads(businessId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(businessId)) return { message: "Elige un negocio." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { message: "Elige un archivo CSV." };
  if (file.size > 1_000_000) return { message: "El archivo es demasiado grande (máximo 1 MB)." };
  const supabase = await createClient();
  const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: businessId });
  if (!canWrite) return { message: "No puedes editar este negocio." };
  const { data: campaigns } = await supabase.from("mkt_campaigns").select("id,name").eq("business_id", businessId);
  const { rows, headerError } = prepareImport(await file.text(), businessId, campaigns ?? []);
  if (headerError) return { message: headerError };
  const bad = rows.filter((r) => !r.ok);
  if (bad.length)
    return {
      message: `No se importó nada: ${bad.length} fila(s) con errores. ${bad
        .slice(0, 5)
        .map((r) => `Fila ${r.line}: ${r.errors.join(" ")}`)
        .join(" · ")}`,
    };
  const batch = randomUUID();
  const { error } = await supabase.from("mkt_leads").insert(rows.map((r) => ({ ...r.value!, import_batch: batch })));
  if (error) return { message: friendlyDbError(error) };
  refresh();
  return { ok: true, message: `${rows.length} prospecto(s) importados.` };
}
