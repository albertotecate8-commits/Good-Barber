"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { todayInTz } from "@/lib/tz";
import { GOALS, GOAL_LABELS, findUnknownPrices, type CampaignPlan, type PlanSource } from "@/lib/director/plan";
import { parseInstruction } from "@/lib/director/intent";
import { buildTemplatePlan } from "@/lib/director/template";
import { strategyPrompt } from "@/lib/director/prompts";
import { generatePlanWithGemini } from "@/lib/director/gemini";
import { countUsageToday, loadBusinessContext, logUsage, performResearch } from "@/lib/director/server";
import { ASSISTED_SOURCES } from "@/lib/research/providers/assisted";

const directorSchema = z.object({
  business_ids: z.array(z.string().uuid()).min(1, "Elige al menos un negocio").max(5, "Máximo 5 negocios a la vez"),
  goal: z.enum(GOALS, { message: "Elige un objetivo" }),
  instruction: z.string().trim().min(10, "Describe lo que necesitas (mínimo 10 caracteres)").max(2000),
  engine: z.enum(["template", "gemini"]),
  research: z.boolean(),
});

/** Ids que el plan cita como evidencia. */
function citedIds(plan: CampaignPlan) {
  return new Set([
    ...plan.opportunity.finding_ids,
    ...plan.audience.finding_ids,
    ...plan.offer.finding_ids,
    ...plan.visual_concept.finding_ids,
    ...plan.ads.flatMap((a) => a.finding_ids),
  ]);
}

export async function runDirector(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = directorSchema.safeParse({
    business_ids: form.getAll("business_ids").map(String),
    goal: form.get("goal"),
    instruction: form.get("instruction") ?? "",
    engine: form.get("engine") ?? "template",
    research: form.get("research") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
    return { errors, message: "Revisa los campos marcados." };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const today = todayInTz();
  const intent = parseInstruction(v.instruction, today);
  const group = randomUUID();
  const created: string[] = [];

  for (const businessId of v.business_ids) {
    const ctx = await loadBusinessContext(supabase, businessId, today);
    if (!ctx) return { message: "Uno de los negocios no existe o no tienes acceso." };
    const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: businessId });
    if (!canWrite) return { message: `No tienes permiso para crear campañas en ${ctx.business.name}.` };

    // 1-2. Contexto + investigación (hechos del negocio, calendario y fuentes automáticas).
    const reportId = randomUUID();
    let research;
    try {
      research = await performResearch(supabase, ctx, {
        title: `Investigación para: ${v.instruction.slice(0, 100)}`,
        start: intent.start,
        end: intent.end,
        automatic: v.research,
        reportId,
      });
    } catch (e) {
      return { message: (e as Error).message };
    }

    // 3. Estrategia: Gemini (si está permitido) o el motor de plantillas.
    let plan: CampaignPlan = buildTemplatePlan({ ctx, intent, goal: v.goal, instruction: v.instruction, findings: research.findings, today });
    let source: PlanSource = "template";
    if (v.engine === "gemini") {
      const prompt = strategyPrompt(ctx, research.findings, v.goal, v.instruction, intent.adsCount, intent);
      const r = await generatePlanWithGemini(prompt, {
        fetch,
        env: process.env,
        usedToday: await countUsageToday(supabase, "gemini-text"),
        spentThisMonthMXN: 0,
      });
      await logUsage(supabase, businessId, "gemini-text", "estrategia de campaña", r.ok ? "ok" : r.blocked ? "blocked" : "error");
      if (r.ok) {
        plan = r.plan;
        source = "gemini_api";
      } else {
        plan.warnings.unshift(`Gemini no se usó: ${r.message} Se generó con el motor de plantillas.`);
      }
    }

    // Verificaciones de honestidad sobre el resultado.
    const known = [...ctx.offerings.map((o) => o.price_cents).filter((c): c is number => c !== null)];
    const unknown = findUnknownPrices(plan, known);
    if (unknown.length) plan.warnings.unshift(`Montos que no coinciden con ningún precio registrado: ${unknown.join(", ")}. Corrígelos antes de publicar.`);
    const validIds = new Set(research.findings.map((f) => f.id));
    const strip = (ids: string[]) => ids.filter((id) => validIds.has(id));
    plan = {
      ...plan,
      opportunity: { ...plan.opportunity, finding_ids: strip(plan.opportunity.finding_ids) },
      audience: { ...plan.audience, finding_ids: strip(plan.audience.finding_ids) },
      offer: { ...plan.offer, finding_ids: strip(plan.offer.finding_ids) },
      visual_concept: { ...plan.visual_concept, finding_ids: strip(plan.visual_concept.finding_ids) },
      ads: plan.ads.map((a) => ({ ...a, finding_ids: strip(a.finding_ids) })),
      schedule: plan.schedule.map((s) => ({ ...s, content_id: null })),
    };
    const failed = research.runs.filter((r) => r.status === "error" || r.status === "not_configured");
    plan.tasks = intent.tasks.map((t) => ({
      kind: t.kind as CampaignPlan["tasks"][number]["kind"],
      label: t.label,
      status: t.kind === "research" && (failed.length || intent.wantsCompetitors) ? "manual_pending" : "done",
      note:
        t.kind === "research"
          ? [
              `${research.findings.length} hallazgos guardados.`,
              failed.length ? `Fuentes sin resultado: ${failed.map((f) => f.provider).join(", ")}.` : "",
              intent.wantsCompetitors ? `Pendiente consulta asistida: ${ASSISTED_SOURCES.slice(0, 2).map((s) => s.name).join(" y ")}.` : "",
            ]
              .filter(Boolean)
              .join(" ")
              .slice(0, 400)
          : t.kind === "prompts"
            ? "Prompts listos para copiar; nada se generó automáticamente."
            : "",
    }));

    // 4. Guardar la campaña como borrador.
    const id = randomUUID();
    const { error } = await supabase.from("mkt_campaigns").insert({
      id,
      business_id: businessId,
      name: `${GOAL_LABELS[v.goal]} · ${intent.periodLabel}`.slice(0, 120),
      objective: GOAL_LABELS[v.goal],
      goal: v.goal,
      instruction: v.instruction,
      plan,
      plan_source: source,
      status: "draft",
      starts_on: intent.start,
      ends_on: intent.end,
      kpi: plan.kpis[0]?.name ?? "",
      research_report_id: reportId,
      request_group: group,
    });
    if (error) return { message: friendlyDbError(error) };
    const cited = [...citedIds(plan)].filter((fid) => validIds.has(fid));
    if (cited.length) {
      const { error: linkError } = await supabase
        .from("mkt_campaign_findings")
        .insert(cited.map((finding_id) => ({ campaign_id: id, finding_id, business_id: businessId })));
      if (linkError) return { message: friendlyDbError(linkError) };
    }
    created.push(id);
  }

  revalidatePath("/campanas");
  revalidatePath("/");
  redirect(created.length === 1 ? `/campanas/${created[0]}?nueva=1` : `/campanas?grupo=${group}`);
}
