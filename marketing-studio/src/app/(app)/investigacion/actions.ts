"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { formToObject } from "@/lib/validation/business";
import { addDays, isValidDateString, todayInTz, zonedToUtc } from "@/lib/tz";
import { loadBusinessContext, performResearch } from "@/lib/director/server";
import { SOURCE_TYPES } from "@/lib/research/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reportSchema = z.object({
  business_id: z.string().regex(UUID, "Elige un negocio"),
  title: z.string().trim().min(2, "Escribe un título").max(160),
  keywords: z
    .string()
    .max(500)
    .transform((v) => [...new Set(v.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 15)),
  days: z.coerce.number().int().min(1).max(90),
});

export async function createReport(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = reportSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const today = todayInTz();
  const ctx = await loadBusinessContext(supabase, v.business_id, today);
  if (!ctx) return { message: "El negocio no existe o no tienes acceso." };
  const id = randomUUID();
  try {
    await performResearch(supabase, ctx, {
      title: v.title,
      start: today,
      end: addDays(today, v.days - 1),
      keywords: v.keywords,
      automatic: form.get("automatic") === "on",
      reportId: id,
    });
  } catch (e) {
    return { message: (e as Error).message };
  }
  revalidatePath("/investigacion");
  revalidatePath("/investigar");
  // Desde «Investigar» se vuelve ahí con las conclusiones nuevas a la vista.
  redirect(form.get("volver") === "investigar" ? `/investigar?informe=${id}` : `/investigacion/${id}`);
}

const findingSchema = z.object({
  source_type: z.enum(SOURCE_TYPES, { message: "Elige la fuente" }),
  source_name: z.string().trim().min(1, "Indica la fuente").max(160),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "El enlace debe empezar con https://")
    .transform((v) => v || null),
  consulted_on: z.string().trim().refine((v) => v === "" || isValidDateString(v), "Fecha no válida"),
  summary: z.string().trim().min(3, "Escribe el hallazgo").max(2000),
  evidence: z.string().trim().max(4000),
  evidence_level: z.enum(["fact", "observation", "hypothesis"], { message: "Elige el nivel de evidencia" }),
  confidence: z.enum(["high", "medium", "low"], { message: "Elige la confianza" }),
});

export async function addManualFinding(reportId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!UUID.test(reportId)) return { message: "Informe inválido." };
  const parsed = findingSchema.safeParse(formToObject(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors, message: "Revisa los campos marcados." };
  }
  const v = parsed.data;
  if (v.evidence_level === "fact" && !v.url)
    return { errors: { url: "Un hecho comprobado necesita el enlace de la fuente." }, message: "Revisa los campos marcados." };
  const supabase = await createClient();
  const { data: report } = await supabase.from("mkt_research_reports").select("business_id").eq("id", reportId).maybeSingle();
  if (!report) return { message: "El informe no existe o no tienes acceso." };
  const consulted_at = v.consulted_on ? zonedToUtc(v.consulted_on, "12:00") : new Date().toISOString();
  if (new Date(consulted_at).getTime() > Date.now() + 86400_000) return { errors: { consulted_on: "La fecha de consulta no puede ser futura." } };
  const { error } = await supabase.from("mkt_research_findings").insert({
    business_id: report.business_id,
    report_id: reportId,
    source_type: v.source_type,
    source_name: v.source_name,
    url: v.url,
    consulted_at,
    summary: v.summary,
    evidence: v.evidence,
    evidence_level: v.evidence_level,
    confidence: v.confidence,
    capture_method: "manual",
  });
  if (error) return { message: friendlyDbError(error) };
  revalidatePath(`/investigacion/${reportId}`);
  return { ok: true, message: "Hallazgo registrado." };
}

export async function deleteFinding(id: string, reportId: string): Promise<void> {
  await requireUser();
  if (!UUID.test(id) || !UUID.test(reportId)) throw new Error("Identificador inválido");
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_research_findings").delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar este hallazgo.");
  revalidatePath(`/investigacion/${reportId}`);
}
