"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { readPlan } from "@/lib/data/director";
import { friendlyDbError, type ActionState } from "@/lib/action-state";
import { todayInTz, zonedToUtc } from "@/lib/tz";
import { loadBusinessContext } from "@/lib/director/server";
import { generateConcepts } from "@/lib/creative/concepts";
import { designSchema } from "@/lib/creative/design";
import { MATERIAL_TYPES, formatByKey, isVideoMaterial, type MaterialType } from "@/lib/creative/formats";
import { spellingCheck } from "@/lib/creative/spelling";
import { getSpeller } from "@/lib/creative/spelling-server";
import { BRAND_FONTS } from "@/lib/creative/fonts";
import { MANUAL_CHECKS, brandFontCheck, canvasChecks, claimChecks, dimensionCheck, priceCheck, qaStatus, sanitizeMetrics, type QaCheck } from "@/lib/creative/qa";
import { videoPlanSchema, type VideoPlan } from "@/lib/creative/video";
import { renderVideo } from "@/lib/creative/render";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertId(id: string) {
  if (!UUID.test(id)) throw new Error("Identificador inválido");
}
const toErrors = (issues: z.core.$ZodIssue[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0] ?? "form")] ??= i.message;
  return out;
};

async function loadProject(supabase: SupabaseClient, id: string) {
  const { data } = await supabase.from("mkt_creative_projects").select("*").eq("id", id).maybeSingle();
  return data as
    | { id: string; business_id: string; campaign_id: string | null; title: string; material_type: MaterialType; format_key: string; width: number; height: number; instruction: string; reference_asset_ids: string[]; video_plan: unknown }
    | null;
}

/** Inserta una versión con el siguiente número (reintenta si dos llegan a la vez). */
async function insertVersion(supabase: SupabaseClient, row: Record<string, unknown> & { project_id: string }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase.from("mkt_creative_versions").select("version_no").eq("project_id", row.project_id).order("version_no", { ascending: false }).limit(1);
    const version_no = (last?.[0]?.version_no ?? 0) + 1;
    const id = randomUUID();
    const { error } = await supabase.from("mkt_creative_versions").insert({ ...row, id, version_no });
    if (!error) return { id, version_no };
    if (error.code !== "23505") throw new Error(friendlyDbError(error));
  }
  throw new Error("No se pudo numerar la versión; inténtalo de nuevo.");
}

async function knownPrices(supabase: SupabaseClient, businessId: string) {
  const { data } = await supabase.from("mkt_offerings").select("price_cents").eq("business_id", businessId);
  return (data ?? []).map((o) => o.price_cents).filter((c): c is number => c !== null);
}

/** Nombres propios del negocio que el corrector no debe marcar. */
async function brandTerms(supabase: SupabaseClient, businessId: string) {
  const [{ data: biz }, { data: offers }, { data: socials }] = await Promise.all([
    supabase.from("mkt_businesses").select("name,city,sector").eq("id", businessId).maybeSingle(),
    supabase.from("mkt_offerings").select("name").eq("business_id", businessId),
    supabase.from("mkt_social_accounts").select("handle").eq("business_id", businessId),
  ]);
  return [biz?.name, biz?.city, biz?.sector, ...(offers ?? []).map((o) => o.name), ...(socials ?? []).map((s) => s.handle)].filter(
    (x): x is string => Boolean(x),
  );
}

const refresh = (id: string) => {
  revalidatePath(`/estudio/${id}`);
  revalidatePath("/estudio");
};

// ---------------------------------------------------------------------------
// Proyectos
// ---------------------------------------------------------------------------
const projectSchema = z
  .object({
    business_id: z.string().regex(UUID, "Elige un negocio"),
    campaign_id: z.string().refine((v) => v === "" || UUID.test(v), "Campaña inválida"),
    title: z.string().trim().min(2, "Escribe un título").max(160),
    material_type: z.enum(MATERIAL_TYPES, { message: "Elige el tipo de material" }),
    format_key: z.string(),
    instruction: z.string().trim().max(2000),
    reference_asset_ids: z.array(z.string().regex(UUID)).max(12, "Máximo 12 referencias"),
  })
  .superRefine((v, ctx) => {
    const f = formatByKey(v.format_key);
    if (!f || !f.materials.includes(v.material_type)) ctx.addIssue({ code: "custom", path: ["format_key"], message: "Ese formato no corresponde al tipo de material." });
  });

function initialVideoPlan(campaignPlan: unknown): VideoPlan {
  const { plan } = readPlan(campaignPlan);
  const reel = plan?.reel;
  if (reel) {
    return videoPlanSchema.parse({
      scenes: reel.scenes.map((s, i) => {
        const m = s.seconds.match(/(\d+)\s*[–-]\s*(\d+)/);
        return {
          id: `escena-${i + 1}`,
          duration: m ? Math.min(15, Math.max(1, Number(m[2]) - Number(m[1]))) : 3,
          on_screen_text: s.on_screen_text,
          voiceover: s.voiceover,
          notes: s.shot,
          flow_prompt: i === 0 ? reel.flow_prompt : "",
        };
      }),
      cta_text: reel.cta,
    });
  }
  return videoPlanSchema.parse({
    scenes: [
      { id: "escena-1", duration: 3, notes: "Apertura: el lugar o el problema del cliente." },
      { id: "escena-2", duration: 4, notes: "Proceso real del servicio." },
      { id: "escena-3", duration: 3, notes: "Resultado real." },
    ],
  });
}

export async function createProject(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = projectSchema.safeParse({
    business_id: form.get("business_id") ?? "",
    campaign_id: form.get("campaign_id") ?? "",
    title: form.get("title") ?? "",
    material_type: form.get("material_type"),
    format_key: form.get("format_key") ?? "",
    instruction: form.get("instruction") ?? "",
    reference_asset_ids: form.getAll("reference_asset_ids").map(String),
  });
  if (!parsed.success) return { errors: toErrors(parsed.error.issues), message: "Revisa los campos marcados." };
  const v = parsed.data;
  const supabase = await createClient();
  const format = formatByKey(v.format_key)!;
  let campaignPlan: unknown = null;
  if (v.campaign_id) {
    const { data } = await supabase.from("mkt_campaigns").select("plan,business_id").eq("id", v.campaign_id).maybeSingle();
    if (!data || data.business_id !== v.business_id) return { errors: { campaign_id: "La campaña es de otro negocio." } };
    campaignPlan = data.plan;
  }
  const id = randomUUID();
  const { error } = await supabase.from("mkt_creative_projects").insert({
    id,
    business_id: v.business_id,
    campaign_id: v.campaign_id || null,
    title: v.title,
    material_type: v.material_type,
    format_key: format.key,
    width: format.width,
    height: format.height,
    instruction: v.instruction,
    reference_asset_ids: v.reference_asset_ids,
    video_plan: isVideoMaterial(v.material_type) ? initialVideoPlan(campaignPlan) : {},
  });
  if (error) return { message: friendlyDbError(error) };
  revalidatePath("/estudio");
  redirect(`/estudio/${id}?tab=conceptos`);
}

export async function updateProject(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(id);
  const schema = z.object({
    title: z.string().trim().min(2, "Escribe un título").max(160),
    instruction: z.string().trim().max(2000),
    status: z.enum(["draft", "in_review", "approved", "archived"]),
    reference_asset_ids: z.array(z.string().regex(UUID)).max(12, "Máximo 12 referencias"),
  });
  const parsed = schema.safeParse({
    title: form.get("title") ?? "",
    instruction: form.get("instruction") ?? "",
    status: form.get("status"),
    reference_asset_ids: form.getAll("reference_asset_ids").map(String),
  });
  if (!parsed.success) return { errors: toErrors(parsed.error.issues) };
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_creative_projects").update(parsed.data).eq("id", id).select("id");
  if (error) return { message: friendlyDbError(error) };
  if (!data?.length) return { message: "No tienes permiso para editar este proyecto." };
  refresh(id);
  return { ok: true, message: "Proyecto guardado." };
}

export async function deleteProject(id: string): Promise<void> {
  await requireUser();
  assertId(id);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_creative_projects").delete().eq("id", id).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar este proyecto.");
  revalidatePath("/estudio");
  redirect("/estudio?eliminado=1");
}

// ---------------------------------------------------------------------------
// Conceptos
// ---------------------------------------------------------------------------
export async function createConcepts(projectId: string): Promise<ActionState> {
  await requireUser();
  assertId(projectId);
  const supabase = await createClient();
  const project = await loadProject(supabase, projectId);
  if (!project) return { message: "El proyecto no existe o no tienes acceso." };
  const today = todayInTz();
  const ctx = await loadBusinessContext(supabase, project.business_id, today);
  if (!ctx) return { message: "No se pudo cargar el negocio." };
  let plan = null;
  if (project.campaign_id) {
    const { data } = await supabase.from("mkt_campaigns").select("plan").eq("id", project.campaign_id).maybeSingle();
    plan = readPlan(data?.plan).plan;
  }
  const { data: refs } = project.reference_asset_ids.length
    ? await supabase.from("mkt_assets").select("title,description,origin").in("id", project.reference_asset_ids)
    : { data: [] };
  const concepts = generateConcepts({ ctx, material: project.material_type, format: formatByKey(project.format_key)!, instruction: project.instruction, plan, references: refs ?? [], today });
  try {
    for (const c of concepts) {
      await insertVersion(supabase, { business_id: project.business_id, project_id: projectId, kind: "concept", title: c.angle, concept: c, format_key: project.format_key });
    }
  } catch (e) {
    return { message: (e as Error).message };
  }
  refresh(projectId);
  return { ok: true, message: `${concepts.length} conceptos creados. Son ideas y prompts: todavía no hay imágenes.` };
}

// ---------------------------------------------------------------------------
// Versiones con archivo
// ---------------------------------------------------------------------------
/** Guarda un diseño exportado del editor: QA del servidor + métricas del lienzo. */
export async function saveDesignVersion(
  projectId: string,
  input: { assetId: string; design: unknown; metrics: unknown; parentVersionId: string | null },
): Promise<{ ok: true; versionId: string; status: string; checks: QaCheck[] } | { ok: false; message: string }> {
  await requireUser();
  assertId(projectId);
  if (!UUID.test(input.assetId) || (input.parentVersionId && !UUID.test(input.parentVersionId))) return { ok: false, message: "Datos inválidos." };
  const parsed = designSchema.safeParse(input.design);
  if (!parsed.success) return { ok: false, message: "El diseño no tiene un formato válido." };
  const design = parsed.data;
  const supabase = await createClient();
  const project = await loadProject(supabase, projectId);
  if (!project) return { ok: false, message: "El proyecto no existe o no tienes acceso." };
  const format = formatByKey(design.format_key);
  if (!format || format.width !== design.width || format.height !== design.height) return { ok: false, message: "Formato desconocido." };
  const { data: asset } = await supabase.from("mkt_assets").select("id,business_id,width,height,origin").eq("id", input.assetId).maybeSingle();
  if (!asset || asset.business_id !== project.business_id) return { ok: false, message: "El archivo exportado no es de este negocio." };

  const texts = Object.values(design.texts);
  const metrics = sanitizeMetrics(input.metrics);
  const checks: QaCheck[] = [
    dimensionCheck(asset, format),
    priceCheck(texts, await knownPrices(supabase, project.business_id)),
    ...claimChecks(texts),
    spellingCheck(design.texts, await getSpeller(), await brandTerms(supabase, project.business_id)),
    brandFontCheck(
      (await supabase.from("mkt_brand_profiles").select("font_heading").eq("business_id", project.business_id).maybeSingle()).data?.font_heading,
      design.fonts.heading,
      BRAND_FONTS,
    ),
    ...(metrics ? canvasChecks(metrics) : [{ id: "metrics", label: "Mediciones del lienzo", level: "warning" as const, detail: "No llegaron las mediciones del editor.", source: "server" as const }]),
  ];
  const status = qaStatus(checks);
  try {
    const v = await insertVersion(supabase, {
      business_id: project.business_id,
      project_id: projectId,
      kind: "code_edit",
      title: `Diseño ${format.label}`,
      design,
      asset_id: input.assetId,
      parent_version_id: input.parentVersionId,
      tool: "editor",
      format_key: format.key,
      qa: checks,
      qa_status: status,
    });
    refresh(projectId);
    return { ok: true, versionId: v.id, status, checks };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Registra un archivo traído de ChatGPT, Gemini o Flow como versión del proyecto. */
export async function attachImportedResult(
  projectId: string,
  input: { assetId: string; tool: string; parentVersionId: string | null },
): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  await requireUser();
  assertId(projectId);
  if (!UUID.test(input.assetId) || (input.parentVersionId && !UUID.test(input.parentVersionId))) return { ok: false, message: "Datos inválidos." };
  const tool = ["chatgpt", "gemini", "flow", "claude", "otro"].includes(input.tool) ? input.tool : "otro";
  const supabase = await createClient();
  const project = await loadProject(supabase, projectId);
  if (!project) return { ok: false, message: "El proyecto no existe o no tienes acceso." };
  const { data: asset } = await supabase.from("mkt_assets").select("id,business_id,width,height,mime_type,kind").eq("id", input.assetId).maybeSingle();
  if (!asset || asset.business_id !== project.business_id) return { ok: false, message: "El archivo no es de este negocio." };
  const format = formatByKey(project.format_key)!;
  const checks: QaCheck[] = [
    asset.mime_type.startsWith("image/") ? dimensionCheck(asset, format) : { id: "dimensions", label: "Formato", level: "warning", detail: "Verifica la proporción del video en tu teléfono.", source: "server" },
    {
      id: "ai_text",
      label: "Texto dentro de la imagen",
      level: "warning",
      detail: "La app no puede leer el texto de una imagen generada. Las IA suelen deformar letras y números: lo más seguro es pedir la imagen sin texto y agregarlo con el editor.",
      source: "server",
    },
  ];
  try {
    const v = await insertVersion(supabase, {
      business_id: project.business_id,
      project_id: projectId,
      kind: "imported_result",
      title: `Resultado de ${tool === "otro" ? "herramienta externa" : tool}`,
      asset_id: asset.id,
      parent_version_id: input.parentVersionId,
      tool,
      format_key: project.format_key,
      qa: checks,
      qa_status: qaStatus(checks),
    });
    refresh(projectId);
    return { ok: true, versionId: v.id };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Revisión humana obligatoria antes de marcar un material como definitivo. */
export async function reviewVersion(versionId: string, projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(versionId);
  assertId(projectId);
  const supabase = await createClient();
  const { data: v } = await supabase.from("mkt_creative_versions").select("id,asset_id,qa,qa_status,kind").eq("id", versionId).maybeSingle();
  if (!v) return { message: "La versión no existe o no tienes acceso." };
  if (!v.asset_id) return { message: "Un concepto no tiene archivo: diséñalo o importa el resultado primero." };
  const auto = (v.qa as QaCheck[]).filter((c) => c.source !== "manual");
  if (auto.some((c) => c.level === "error")) return { message: "Hay errores en la revisión automática: corrígelos en el editor y exporta una nueva versión." };
  const missing = MANUAL_CHECKS.filter((c) => form.get(`check_${c.id}`) !== "on");
  if (missing.length) return { message: `Falta confirmar: ${missing.map((m) => m.label.split(":")[0].split(".")[0]).join("; ")}.` };
  const hasWarnings = auto.some((c) => c.level === "warning");
  if (hasWarnings && form.get("ack_warnings") !== "on") return { message: "Confirma que revisaste las advertencias." };
  const manual: QaCheck[] = MANUAL_CHECKS.map((c) => ({ id: c.id, label: c.label, level: "ok", detail: "Confirmado por la persona que revisó.", source: "manual" }));
  const { error } = await supabase
    .from("mkt_creative_versions")
    .update({ qa: [...auto, ...manual], qa_status: hasWarnings ? "passed_with_warnings" : "passed", qa_reviewed_at: new Date().toISOString(), is_final: true })
    .eq("id", versionId);
  if (error) return { message: friendlyDbError(error) };
  refresh(projectId);
  return { ok: true, message: "Revisión completada: versión marcada como definitiva." };
}

export async function unfinalizeVersion(versionId: string, projectId: string): Promise<void> {
  await requireUser();
  assertId(versionId);
  assertId(projectId);
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_creative_versions").update({ is_final: false }).eq("id", versionId);
  if (error) throw new Error(friendlyDbError(error));
  refresh(projectId);
}

export async function deleteVersion(versionId: string, projectId: string): Promise<void> {
  await requireUser();
  assertId(versionId);
  assertId(projectId);
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_creative_versions").delete().eq("id", versionId).select("id");
  if (error) throw new Error(friendlyDbError(error));
  if (!data?.length) throw new Error("No tienes permiso para eliminar esta versión.");
  refresh(projectId);
}

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------
const PLATFORM_BY_FORMAT: Record<string, string> = { fb_cover: "facebook_page", fb_link: "facebook_page", flyer_letter: "other", flyer_half: "other" };
const FORMAT_BY_MATERIAL: Record<MaterialType, string> = { ad: "post", flyer: "flyer", product_photo: "post", story: "story", cover: "other", reel: "reel", video: "video" };

export async function addVersionToCalendar(versionId: string, projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(versionId);
  assertId(projectId);
  const supabase = await createClient();
  const [{ data: v }, project] = await Promise.all([
    supabase.from("mkt_creative_versions").select("id,asset_id,is_final,design,concept,parent_version_id").eq("id", versionId).maybeSingle(),
    loadProject(supabase, projectId),
  ]);
  if (!v || !project) return { message: "La versión no existe o no tienes acceso." };
  if (!v.is_final || !v.asset_id) return { message: "Solo los materiales definitivos (con revisión completa) se agregan al calendario." };
  const target = String(form.get("content_id") ?? "");
  if (target && target !== "new") {
    if (!UUID.test(target)) return { message: "Publicación inválida." };
    const { data, error } = await supabase.from("mkt_content_items").update({ asset_id: v.asset_id }).eq("id", target).eq("business_id", project.business_id).select("id");
    if (error) return { message: friendlyDbError(error) };
    if (!data?.length) return { message: "La publicación no existe o es de otro negocio." };
    revalidatePath("/calendario", "layout");
    return { ok: true, message: "Material asignado a la publicación existente (sigue sin publicarse)." };
  }
  const date = String(form.get("date") ?? "");
  const time = String(form.get("time") ?? "");
  let scheduled_at: string | null = null;
  if (date || time) {
    try {
      scheduled_at = zonedToUtc(date, time);
    } catch (e) {
      return { errors: { date: (e as Error).message } };
    }
  }
  const texts = (v.design as { texts?: Record<string, string> })?.texts ?? {};
  const caption = [texts.headline, texts.price, texts.body, texts.cta].filter(Boolean).join("\n");
  const { error } = await supabase.from("mkt_content_items").insert({
    business_id: project.business_id,
    campaign_id: project.campaign_id,
    platform: PLATFORM_BY_FORMAT[project.format_key] ?? "instagram",
    format: FORMAT_BY_MATERIAL[project.material_type],
    title: project.title.slice(0, 200),
    caption: caption.slice(0, 5000),
    scheduled_at,
    status: "draft",
    asset_id: v.asset_id,
    publish_mode: "manual",
  });
  if (error) return { message: friendlyDbError(error) };
  revalidatePath("/calendario", "layout");
  return { ok: true, message: "Borrador creado en el calendario (no se publica automáticamente)." };
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------
export async function saveVideoPlan(projectId: string, _: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  assertId(projectId);
  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("plan") ?? "{}"));
  } catch {
    return { message: "Plan de video inválido." };
  }
  const parsed = videoPlanSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues.map((i) => i.message).slice(0, 3).join(" ") };
  const supabase = await createClient();
  const project = await loadProject(supabase, projectId);
  if (!project) return { message: "El proyecto no existe o no tienes acceso." };
  if (!isVideoMaterial(project.material_type)) return { message: "Este proyecto no es de video." };
  const ids = [...parsed.data.scenes.map((s) => s.asset_id), parsed.data.music.asset_id].filter((x): x is string => Boolean(x));
  if (ids.length) {
    const { data } = await supabase.from("mkt_assets").select("id").in("id", ids).eq("business_id", project.business_id);
    if ((data ?? []).length !== new Set(ids).size) return { message: "Algún archivo no existe o es de otro negocio." };
  }
  const { error } = await supabase.from("mkt_creative_projects").update({ video_plan: parsed.data }).eq("id", projectId);
  if (error) return { message: friendlyDbError(error) };
  refresh(projectId);
  return { ok: true, message: "Plan de video guardado." };
}

export async function renderVideoVersion(projectId: string): Promise<ActionState> {
  await requireUser();
  assertId(projectId);
  const supabase = await createClient();
  const project = await loadProject(supabase, projectId);
  if (!project) return { message: "El proyecto no existe o no tienes acceso." };
  const plan = videoPlanSchema.safeParse(project.video_plan);
  if (!plan.success) return { message: "El plan de video no es válido: guárdalo de nuevo." };
  const format = formatByKey(project.format_key);
  if (!format?.video) return { message: "El formato del proyecto no es de video." };
  const r = await renderVideo(supabase, project, plan.data, format);
  if (!r.ok) return { message: r.message };
  const texts = [...plan.data.scenes.map((s) => s.on_screen_text), plan.data.cta_text];
  const checks: QaCheck[] = [
    { id: "render", label: "Montaje", level: "ok", detail: `Video de ${r.seconds} s montado con FFmpeg${r.probe ? ` (${r.probe})` : ""}. No es video generado con IA.`, source: "server" },
    priceCheck(texts, await knownPrices(supabase, project.business_id)),
    ...claimChecks(texts),
    spellingCheck({ texts: texts.join("\n") }, await getSpeller(), await brandTerms(supabase, project.business_id)),
    plan.data.music.asset_id
      ? { id: "music", label: "Música", level: "ok", detail: `Licencia declarada: ${plan.data.music.license}${plan.data.music.license_detail ? ` — ${plan.data.music.license_detail}` : ""}.`, source: "server" }
      : { id: "music", label: "Música", level: "ok", detail: "Sin música (puedes agregar música desde la app de la red al publicar).", source: "server" },
  ];
  try {
    const v = await insertVersion(supabase, {
      business_id: project.business_id,
      project_id: projectId,
      kind: "video_render",
      title: `Montaje ${format.label}`,
      asset_id: r.assetId,
      tool: "ffmpeg",
      format_key: format.key,
      design: { video_plan: plan.data },
      qa: checks,
      qa_status: qaStatus(checks),
    });
    refresh(projectId);
    return { ok: true, message: `Video montado (versión ${v.version_no}). Revísalo antes de marcarlo como definitivo.` };
  } catch (e) {
    return { message: (e as Error).message };
  }
}

