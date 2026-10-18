"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { friendlyDbError } from "@/lib/action-state";
import { loadBusinessContext } from "@/lib/director/server";
import { todayInTz, zonedToUtc } from "@/lib/tz";
import { listMemory, listStyles } from "@/lib/data/studio";
import { parseMessage } from "@/lib/studio/intent";
import { CHAT_FORMATS, generationPrompt, propose, replyText, type Proposal, type ReferenceRole } from "@/lib/studio/propose";
import { CF_DAILY_NEURON_CAP, CF_IMAGE_MODEL, CF_IMAGE_PROVIDER, MAX_REFERENCE_IMAGES, MAX_REFERENCE_SIDE, cloudflareImageUnavailableReason, estimateNeurons, generateWithCloudflare, outputSize } from "@/lib/studio/cloudflare-image";
import { imageSize } from "@/lib/creative/image-size";
import { storeGeneratedAsset } from "@/lib/storage/server-store";
import { MEMORY_LABELS, isMemoryKind, styleAttributesSchema } from "@/lib/studio/styles";
import { MANUAL_CHECKS, claimChecks, dimensionCheck, priceCheck, qaStatus, type QaCheck } from "@/lib/creative/qa";
import { composePostText } from "@/lib/validation/content";
import { validateForPlatform, type PublishPlatform } from "@/lib/meta/publish";
import { metaConfig, publishingConfig } from "@/lib/meta/config";
import { adminClient, graphOptions, publishReadiness, setAutoPublish } from "@/lib/meta/service";
import { publishDue } from "@/lib/meta/worker";
import { MetaError } from "@/lib/meta/graph";

// Acciones del chat creativo, de Estilos y memoria y de la aprobación.
// Usan la sesión del usuario: RLS y los guardas de la base impiden mezclar
// negocios. La publicación usa el mismo camino aprobado del calendario.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };
const fail = (message: string) => ({ ok: false as const, message });

const FORMAT_KEY: Record<string, { key: string; material: string }> = {
  post: { key: "ig_portrait", material: "ad" },
  carousel: { key: "ig_portrait", material: "ad" },
  story: { key: "ig_story", material: "story" },
  reel: { key: "ig_story", material: "story" },
};

async function nextVersion(supabase: SupabaseClient, row: Record<string, unknown> & { project_id: string }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase.from("mkt_creative_versions").select("version_no").eq("project_id", row.project_id).order("version_no", { ascending: false }).limit(1);
    const id = randomUUID();
    const { error } = await supabase.from("mkt_creative_versions").insert({ ...row, id, version_no: (last?.[0]?.version_no ?? 0) + 1 });
    if (!error) return id;
    if (error.code !== "23505") throw new Error(friendlyDbError(error));
  }
  throw new Error("No se pudo numerar la versión; inténtalo de nuevo.");
}

async function threadOf(supabase: SupabaseClient, threadId: string) {
  const { data } = await supabase.from("mkt_creative_threads").select("id,business_id,title,style_id,project_id").eq("id", threadId).maybeSingle();
  return data;
}

/** Propuestas ya hechas en la conversación (para ajustes y adaptaciones). */
async function previousProposals(supabase: SupabaseClient, threadId: string) {
  const { data } = await supabase.from("mkt_creative_messages").select("payload").eq("thread_id", threadId).eq("role", "assistant").order("created_at");
  return (data ?? []).flatMap((m) => ((m.payload as { proposals?: (Proposal & { versionId: string })[] })?.proposals ?? []));
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
const sendSchema = z.object({
  businessId: z.string().regex(UUID),
  threadId: z.string().regex(UUID).nullable(),
  text: z.string().trim().min(1, "Escribe qué quieres crear.").max(2000),
  assetIds: z.array(z.string().regex(UUID)).max(6),
  styleId: z.string().regex(UUID).nullable().optional(),
});

export async function sendStudioMessage(input: z.input<typeof sendSchema>): Promise<Result<{ threadId: string }>> {
  await requireUser();
  const parsedInput = sendSchema.safeParse(input);
  if (!parsedInput.success) return fail(parsedInput.error.issues[0]?.message ?? "Datos inválidos.");
  const { businessId, text, assetIds } = parsedInput.data;
  const supabase = await createClient();
  const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: businessId });
  if (!canWrite) return fail("No puedes crear contenido para este negocio.");
  const today = todayInTz();
  const ctx = await loadBusinessContext(supabase, businessId, today);
  if (!ctx) return fail("El negocio no existe o no tienes acceso.");

  // Conversación: la existente o una nueva con su proyecto creativo.
  let thread = parsedInput.data.threadId ? await threadOf(supabase, parsedInput.data.threadId) : null;
  if (thread && thread.business_id !== businessId) return fail("Esa conversación es de otro negocio.");
  if (!thread) {
    const title = text.replace(/\s+/g, " ").slice(0, 80);
    const { data: project, error: pe } = await supabase
      .from("mkt_creative_projects")
      .insert({ business_id: businessId, title: title.length >= 2 ? title : `Chat ${today}`, material_type: "ad", format_key: "ig_portrait", width: 1080, height: 1350, instruction: text.slice(0, 2000) })
      .select("id")
      .single();
    if (pe) return fail(friendlyDbError(pe));
    const { data: created, error } = await supabase
      .from("mkt_creative_threads")
      .insert({ business_id: businessId, title, project_id: project.id, style_id: parsedInput.data.styleId ?? null })
      .select("id,business_id,title,style_id,project_id")
      .single();
    if (error) return fail(friendlyDbError(error));
    thread = created;
  } else if (parsedInput.data.styleId !== undefined && parsedInput.data.styleId !== thread.style_id) {
    await supabase.from("mkt_creative_threads").update({ style_id: parsedInput.data.styleId }).eq("id", thread.id);
    thread.style_id = parsedInput.data.styleId ?? null;
  }

  const { data: userMsg, error: ue } = await supabase
    .from("mkt_creative_messages")
    .insert({ business_id: businessId, thread_id: thread.id, role: "user", content: text, asset_ids: assetIds })
    .select("id")
    .single();
  if (ue) return fail(friendlyDbError(ue));

  const [styles, memory, previous, logos] = await Promise.all([
    listStyles(businessId),
    listMemory(businessId),
    previousProposals(supabase, thread.id),
    supabase.from("mkt_assets").select("id", { count: "exact", head: true }).eq("business_id", businessId).eq("kind", "logo").eq("upload_status", "ready"),
  ]);
  const active = styles.filter((s) => s.active);
  const parsed = parseMessage(text, {
    styles: active,
    offerNames: [...ctx.offerings.map((o) => o.name), ...ctx.promotions.map((p) => p.title)],
    hasProposals: previous.length > 0,
    now: new Date(),
    hasAttachments: assetIds.length > 0,
  });

  const say = async (content: string, payload: Record<string, unknown> = {}) => {
    const { error } = await supabase.from("mkt_creative_messages").insert({ business_id: businessId, thread_id: thread!.id, role: "assistant", content, payload });
    if (error) throw new Error(friendlyDbError(error));
  };

  try {
    if (parsed.kind === "remember" && parsed.memory) {
      const { data: mem, error } = await supabase
        .from("mkt_memory")
        .insert({ business_id: businessId, kind: parsed.memory.kind, text: parsed.memory.text.slice(0, 1000), source: "chat", source_ref: userMsg.id })
        .select("id")
        .single();
      if (error) throw new Error(friendlyDbError(error));
      await say(`Guardado en la memoria de ${ctx.business.name} como «${MEMORY_LABELS[parsed.memory.kind]}». Solo se usa en este negocio; puedes corregirlo o borrarlo en Estilos y memoria.`, {
        memory: { id: mem.id, kind: parsed.memory.kind, text: parsed.memory.text },
        links: [{ href: "/estilos#memoria", label: "Ver memoria" }],
      });
    } else if (parsed.kind === "research") {
      await say(
        "La investigación se hace en «Investigar»: ahí consulto fuentes reales (con enlace y fecha) y separo lo verificado de lo interpretado. No invento tendencias ni competidores. Cuando guardes una conclusión, podré usarla aquí.",
        { links: [{ href: `/investigar?q=${encodeURIComponent(text.slice(0, 200))}`, label: "Abrir Investigar" }] },
      );
    } else if (parsed.kind === "approve") {
      await say("Para aprobar, abre la imagen que elegiste y usa «Revisar y aprobar»: ahí confirmas el texto, el logotipo y cada destino (Facebook, Instagram o ambos). Nada se publica solo por escribirlo en el chat.");
    } else if (parsed.kind === "unknown") {
      await say(
        "No entendí qué preparar. Prueba con: «Haz tres anuncios diferentes», «Hazlo más premium y menos artificial», «Usa el estilo que guardamos la semana pasada», «Adapta este concepto a una historia de Instagram» o «Recuerda que…» para guardar algo en la memoria.",
      );
    } else {
      const styleId = parsed.styleId ?? thread.style_id ?? null;
      const style = active.find((s) => s.id === styleId) ?? null;
      if (parsed.styleId && parsed.styleId !== thread.style_id) await supabase.from("mkt_creative_threads").update({ style_id: parsed.styleId }).eq("id", thread.id);
      const proposals = propose({ ctx, parsed, memory, style, previous, round: previous.length, hasLogo: (logos.count ?? 0) > 0, referenceCount: assetIds.length });
      const saved: (Proposal & { versionId: string })[] = [];
      for (const p of proposals) {
        const parent = p.parentKey ? previous.find((x) => x.key === p.parentKey)?.versionId ?? null : null;
        const versionId = await nextVersion(supabase, {
          business_id: businessId,
          project_id: thread.project_id,
          kind: "concept",
          title: `${p.title} · ${CHAT_FORMATS[p.format].label}`.slice(0, 200),
          // Compatible con el Estudio creativo (pestaña Conceptos) + la propuesta completa.
          concept: {
            angle: p.angle,
            headline: p.headline,
            price: p.price,
            cta: p.cta,
            body: p.text,
            visual_direction: `${p.concept} ${p.layout}`,
            template: "band_bottom",
            basis: "recommendation",
            prompts: { image: p.prompt, copy: "", video: "" },
            proposal: p,
          },
          parent_version_id: parent,
          style_id: style?.id ?? null,
          tool: "chat",
          format_key: FORMAT_KEY[p.format].key,
        });
        saved.push({ ...p, versionId });
      }
      await say(replyText({ parsed, proposals, style, memoryCount: memory.filter((m) => m.active).length, businessName: ctx.business.name, canGenerate: cloudflareImageUnavailableReason(process.env) === null }), { proposals: saved });
    }
  } catch (e) {
    return fail((e as Error).message);
  }
  await supabase.from("mkt_creative_threads").update({ title: thread.title }).eq("id", thread.id); // actualiza updated_at
  revalidatePath("/");
  return { ok: true, threadId: thread.id };
}

export async function setThreadStyle(threadId: string, styleId: string | null): Promise<Result> {
  await requireUser();
  if (!UUID.test(threadId) || (styleId && !UUID.test(styleId))) return fail("Datos inválidos.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_creative_threads").update({ style_id: styleId }).eq("id", threadId).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("No tienes acceso a esta conversación.");
  revalidatePath("/");
  return { ok: true };
}

/** Registra la imagen generada fuera (ChatGPT u otra) como versión de la propuesta, sin perder contexto. */
export async function importGeneratedImage(input: { threadId: string; conceptVersionId: string; assetId: string; tool: string }): Promise<Result<{ versionId: string }>> {
  await requireUser();
  if (![input.threadId, input.conceptVersionId, input.assetId].every((x) => UUID.test(x))) return fail("Datos inválidos.");
  const tool = ["chatgpt", "gemini", "otro"].includes(input.tool) ? input.tool : "otro";
  const supabase = await createClient();
  const thread = await threadOf(supabase, input.threadId);
  if (!thread?.project_id) return fail("La conversación no existe o no tienes acceso.");
  const [{ data: concept }, { data: asset }] = await Promise.all([
    supabase.from("mkt_creative_versions").select("id,business_id,project_id,style_id,concept,format_key").eq("id", input.conceptVersionId).maybeSingle(),
    supabase.from("mkt_assets").select("id,business_id,width,height,mime_type,upload_status").eq("id", input.assetId).maybeSingle(),
  ]);
  if (!concept || concept.project_id !== thread.project_id) return fail("La propuesta no pertenece a esta conversación.");
  if (!asset || asset.business_id !== thread.business_id) return fail("El archivo no es de este negocio.");
  if (!asset.mime_type.startsWith("image/")) return fail("Sube una imagen (JPG, PNG o WebP).");
  const proposal = (concept.concept as { proposal?: Proposal }).proposal;
  const fmt = CHAT_FORMATS[proposal?.format ?? "post"];
  const { data: prices } = await supabase.from("mkt_offerings").select("price_cents").eq("business_id", thread.business_id);
  const known = (prices ?? []).flatMap((o) => (o.price_cents === null ? [] : [o.price_cents]));
  const texts = proposal ? [proposal.headline, proposal.price, proposal.cta, proposal.text] : [];
  const checks: QaCheck[] = [
    dimensionCheck(asset, { width: fmt.width, height: fmt.height, label: fmt.label }),
    priceCheck(texts, known),
    ...claimChecks(texts),
    {
      id: "ai_text",
      label: "Texto dentro de la imagen",
      level: "warning",
      detail: proposal?.includeText
        ? `La app no puede leer el texto de una imagen. Compara letra por letra con: «${proposal.headline}»${proposal.price ? ` · «${proposal.price}»` : ""} · «${proposal.cta}».`
        : "La app no puede leer el texto de una imagen: revisa que no haya letras inventadas.",
      source: "server",
    },
  ];
  try {
    const versionId = await nextVersion(supabase, {
      business_id: thread.business_id,
      project_id: thread.project_id,
      kind: "imported_result",
      title: `Imagen de ${tool === "chatgpt" ? "ChatGPT" : tool === "gemini" ? "Gemini" : "herramienta externa"}${proposal ? ` · ${proposal.title}` : ""}`.slice(0, 200),
      concept: concept.concept,
      asset_id: asset.id,
      parent_version_id: concept.id,
      style_id: concept.style_id,
      tool,
      format_key: concept.format_key,
      qa: checks,
      qa_status: qaStatus(checks),
    });
    await supabase.from("mkt_creative_messages").insert({
      business_id: thread.business_id,
      thread_id: thread.id,
      role: "assistant",
      content: `Imagen importada${proposal ? ` para «${proposal.title}»` : ""}. Quedó guardada con su prompt, estilo y versión. Revísala y, si te gusta, usa «Revisar y aprobar».`,
      payload: { imported: { versionId, parentVersionId: concept.id } },
      asset_ids: [asset.id],
      version_id: versionId,
    });
    revalidatePath("/");
    return { ok: true, versionId };
  } catch (e) {
    return fail((e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Generación directa (Cloudflare Workers AI, nivel gratuito)
// ---------------------------------------------------------------------------
const ROLES: ReferenceRole[] = ["previous", "style", "reference"];

/**
 * Genera una imagen real para una propuesta. Las referencias llegan ya reducidas
 * (< 512 px) desde el navegador. Cada imagen queda como versión con su prompt,
 * referencias, estilo, modelo y consumo. Nunca reintenta sola.
 */
export async function generateImage(form: FormData): Promise<Result<{ versionId: string }>> {
  const user = await requireUser();
  const threadId = String(form.get("threadId") ?? "");
  const conceptVersionId = String(form.get("conceptVersionId") ?? "");
  const includeText = form.get("includeText") === "1";
  if (!UUID.test(threadId) || !UUID.test(conceptVersionId)) return fail("Datos inválidos.");
  const reason = cloudflareImageUnavailableReason(process.env);
  if (reason) return fail(`La generación directa no está configurada: ${reason}`);
  const supabase = await createClient();
  const thread = await threadOf(supabase, threadId);
  if (!thread?.project_id) return fail("La conversación no existe o no tienes acceso.");
  const { data: canWrite } = await supabase.rpc("mkt_can_write", { p_business: thread.business_id });
  if (!canWrite) return fail("No puedes crear contenido para este negocio.");
  const { data: concept } = await supabase.from("mkt_creative_versions").select("id,project_id,style_id,concept,format_key").eq("id", conceptVersionId).maybeSingle();
  if (!concept || concept.project_id !== thread.project_id) return fail("La propuesta no pertenece a esta conversación.");
  const proposal = (concept.concept as { proposal?: Proposal }).proposal;
  if (!proposal) return fail("La propuesta no tiene prompt.");

  // Referencias: archivo + su función + el recurso de la Biblioteca de donde salió.
  let meta: { role: ReferenceRole; assetId: string }[] = [];
  try {
    meta = JSON.parse(String(form.get("refs") ?? "[]"));
  } catch {
    return fail("Referencias inválidas.");
  }
  if (!Array.isArray(meta) || meta.length > MAX_REFERENCE_IMAGES) return fail(`Máximo ${MAX_REFERENCE_IMAGES} referencias.`);
  const references: { bytes: Uint8Array; type: string; width: number; height: number }[] = [];
  for (let i = 0; i < meta.length; i++) {
    const m = meta[i];
    if (!ROLES.includes(m?.role) || !UUID.test(m?.assetId ?? "")) return fail("Referencia inválida.");
    const f = form.get(`ref_${i}`);
    if (!(f instanceof Blob) || !["image/jpeg", "image/png", "image/webp"].includes(f.type) || f.size > 400_000) return fail("Cada referencia debe ser JPG/PNG/WebP menor a 400 KB.");
    const bytes = new Uint8Array(await f.arrayBuffer());
    const dims = imageSize(bytes);
    if (!dims || dims.width > MAX_REFERENCE_SIDE || dims.height > MAX_REFERENCE_SIDE) return fail("Las referencias deben medir menos de 512×512 px.");
    references.push({ bytes, type: f.type, ...dims });
  }
  if (meta.length) {
    const { data: owned } = await supabase.from("mkt_assets").select("id").eq("business_id", thread.business_id).in("id", meta.map((m) => m.assetId));
    if ((owned ?? []).length !== new Set(meta.map((m) => m.assetId)).size) return fail("Las referencias deben ser archivos de este negocio.");
  }

  const size = outputSize(proposal.format);
  const neurons = estimateNeurons(size.width, size.height, references);
  const { data: usedToday } = await supabase.rpc("mkt_ai_units_today", { p_provider: CF_IMAGE_PROVIDER });
  if ((usedToday ?? 0) + neurons > CF_DAILY_NEURON_CAP)
    return fail(`Se alcanzó el tope gratuito de hoy (${usedToday ?? 0} de ${CF_DAILY_NEURON_CAP} neuronas). Se renueva a las 00:00 UTC; mientras, usa ChatGPT.`);

  const prompt = generationPrompt(proposal, meta.map((m) => m.role), includeText);
  const result = await generateWithCloudflare({ prompt, ...size, references }, { fetch, env: process.env });
  await supabase.from("mkt_ai_usage").insert({
    business_id: thread.business_id,
    user_id: user.id,
    provider: CF_IMAGE_PROVIDER,
    purpose: "imagen del chat creativo",
    outcome: result.ok ? "ok" : "error",
    units: result.ok ? neurons : 0,
  });
  if (!result.ok) return fail(result.message);

  const stored = await storeGeneratedAsset(supabase, {
    businessId: thread.business_id,
    data: Buffer.from(result.bytes),
    mime: result.mime,
    fileName: `flux2-${proposal.title}.${result.mime === "image/png" ? "png" : result.mime === "image/webp" ? "webp" : "jpg"}`,
    kind: "image",
    origin: "ai_generated",
    title: `${proposal.title} · generada con FLUX.2`,
    description: `Generada con ${CF_IMAGE_MODEL} (Cloudflare Workers AI). Propuesta «${proposal.title}».`,
    tags: ["chat", "generada", "flux2"],
  });
  if (!stored.ok) return fail(stored.message);
  const { data: asset } = await supabase.from("mkt_assets").select("width,height").eq("id", stored.id).maybeSingle();
  const parentImage = meta.find((m) => m.role === "previous");
  const checks: QaCheck[] = [
    dimensionCheck({ width: asset?.width ?? null, height: asset?.height ?? null }, { width: size.width, height: size.height, label: CHAT_FORMATS[proposal.format].label }),
    {
      id: "ai_text",
      label: "Texto y logotipo",
      level: "warning",
      detail: includeText
        ? "Se pidió el texto dentro de la imagen: compáralo letra por letra; si algo sale mal, ponlo con el editor."
        : "La imagen se generó sin texto ni logotipo. Agrégalos con el editor para que salgan exactos.",
      source: "server",
    },
  ];
  try {
    const versionId = await nextVersion(supabase, {
      business_id: thread.business_id,
      project_id: thread.project_id,
      kind: "imported_result",
      title: `Generada con FLUX.2 · ${proposal.title}`.slice(0, 200),
      concept: {
        ...(concept.concept as object),
        generation: { provider: CF_IMAGE_PROVIDER, model: CF_IMAGE_MODEL, prompt, references: meta, include_text: includeText, neurons, generated_at: new Date().toISOString() },
      },
      asset_id: stored.id,
      parent_version_id: parentImage ? await versionOfAsset(supabase, thread.project_id, parentImage.assetId) ?? concept.id : concept.id,
      style_id: concept.style_id,
      tool: CF_IMAGE_PROVIDER,
      format_key: concept.format_key,
      qa: checks,
      qa_status: qaStatus(checks),
    });
    await supabase.from("mkt_creative_messages").insert({
      business_id: thread.business_id,
      thread_id: thread.id,
      role: "assistant",
      content: `Imagen generada de verdad con FLUX.2 [klein] (Cloudflare Workers AI) para «${proposal.title}»${meta.length ? `, con ${meta.length} referencia(s)` : ""}. Quedó guardada con su prompt, referencias, estilo y versión.${includeText ? "" : " No lleva texto: agrégalo con el editor."}`,
      payload: { imported: { versionId, parentVersionId: concept.id }, generated: { model: CF_IMAGE_MODEL, neurons } },
      asset_ids: [stored.id],
      version_id: versionId,
    });
    revalidatePath("/");
    return { ok: true, versionId };
  } catch (e) {
    return fail((e as Error).message);
  }
}

async function versionOfAsset(supabase: SupabaseClient, projectId: string, assetId: string) {
  const { data } = await supabase.from("mkt_creative_versions").select("id").eq("project_id", projectId).eq("asset_id", assetId).order("version_no", { ascending: false }).limit(1);
  return data?.[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Aprobación y publicación (por contenido y por destino)
// ---------------------------------------------------------------------------
const approveSchema = z.object({
  versionId: z.string().regex(UUID),
  destinations: z.array(z.enum(["facebook_page", "instagram"])).min(1, "Elige al menos un destino.").max(2),
  mode: z.enum(["now", "schedule", "save"]),
  date: z.string().max(10).default(""),
  time: z.string().max(5).default(""),
  caption: z.string().trim().min(1, "Escribe el texto de la publicación.").max(2200),
  hashtags: z.array(z.string().regex(/^[\p{L}\p{N}_]{1,50}$/u)).max(30).default([]),
  checks: z.array(z.string()).default([]),
});

export interface DestinationOutcome {
  platform: "facebook_page" | "instagram";
  contentId: string | null;
  state: "published" | "approved_waiting" | "saved_not_published" | "error";
  message: string;
  url: string | null;
}

export async function approveAndPublish(input: z.input<typeof approveSchema>): Promise<Result<{ outcomes: DestinationOutcome[] }>> {
  const user = await requireUser();
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const v = parsed.data;
  const missing = MANUAL_CHECKS.filter((c) => !v.checks.includes(c.id));
  if (missing.length) return fail(`Falta confirmar: ${missing.map((m) => m.label.split(":")[0].split(".")[0]).join("; ")}.`);
  const supabase = await createClient();
  const { data: version } = await supabase
    .from("mkt_creative_versions")
    .select("id,business_id,project_id,asset_id,qa,qa_status,is_final,concept,kind")
    .eq("id", v.versionId)
    .maybeSingle();
  if (!version) return fail("La versión no existe o no tienes acceso.");
  if (!version.asset_id) return fail("Primero importa la imagen generada: una propuesta sin imagen no se publica.");
  const auto = ((version.qa ?? []) as QaCheck[]).filter((c) => c.source !== "manual");
  if (auto.some((c) => c.level === "error")) return fail("La revisión automática encontró errores (precio no registrado o afirmación no permitida). Corrige y vuelve a importar.");
  const { data: prices } = await supabase.from("mkt_offerings").select("price_cents").eq("business_id", version.business_id);
  const captionCheck = priceCheck([v.caption], (prices ?? []).flatMap((o) => (o.price_cents === null ? [] : [o.price_cents])));
  if (captionCheck.level === "error") return fail(`El texto de la publicación tiene un precio no registrado: ${captionCheck.detail}`);
  if (claimChecks([v.caption]).some((c) => c.level === "error")) return fail("El texto promete resultados o usa escasez falsa: corrígelo.");

  let scheduledAt: string | null = null;
  if (v.mode === "now") scheduledAt = new Date().toISOString();
  if (v.mode === "schedule") {
    try {
      scheduledAt = zonedToUtc(v.date, v.time);
    } catch (e) {
      return fail((e as Error).message);
    }
    if (new Date(scheduledAt).getTime() < Date.now() - 60_000) return fail("La fecha programada ya pasó.");
  }

  // Revisión humana completada: la versión queda como definitiva (aprobada).
  const manual: QaCheck[] = MANUAL_CHECKS.map((c) => ({ id: c.id, label: c.label, level: "ok", detail: `Confirmado por ${user.email || "la persona que revisó"}.`, source: "manual" }));
  if (!version.is_final) {
    const hasWarnings = auto.some((c) => c.level === "warning");
    const { error } = await supabase
      .from("mkt_creative_versions")
      .update({ qa: [...auto, ...manual], qa_status: hasWarnings ? "passed_with_warnings" : "passed", qa_reviewed_at: new Date().toISOString(), is_final: true })
      .eq("id", version.id);
    if (error) return fail(friendlyDbError(error));
  }

  const { data: asset } = await supabase.from("mkt_assets").select("mime_type,storage_backend,upload_status").eq("id", version.asset_id).maybeSingle();
  const proposal = (version.concept as { proposal?: Proposal }).proposal;
  const format = proposal?.format === "story" ? "story" : "post";
  const title = (proposal?.headline || "Publicación del chat").slice(0, 200);
  const { data: isOwner } = await supabase.rpc("mkt_is_owner", { p_business: version.business_id });
  const pub = publishingConfig();
  const outcomes: DestinationOutcome[] = [];
  const toPublishNow: string[] = [];

  for (const platform of v.destinations) {
    // Reintentar nunca duplica: una fila por versión y red.
    const { data: existing } = await supabase
      .from("mkt_content_items")
      .select("id,status,external_post_id,external_post_url")
      .eq("creative_version_id", version.id)
      .eq("platform", platform)
      .maybeSingle();
    if (existing?.external_post_id) {
      outcomes.push({ platform, contentId: existing.id, state: "published", message: "Ya estaba publicada (confirmado por Meta). No se vuelve a publicar.", url: existing.external_post_url });
      continue;
    }
    const row = {
      business_id: version.business_id,
      platform,
      format,
      title,
      caption: v.caption,
      hashtags: v.hashtags,
      asset_id: version.asset_id,
      creative_version_id: version.id,
      scheduled_at: scheduledAt,
      status: scheduledAt ? "scheduled" : "approved",
    };
    let contentId = existing?.id ?? null;
    if (contentId) {
      const { error } = await supabase.from("mkt_content_items").update(row).eq("id", contentId);
      if (error) {
        outcomes.push({ platform, contentId, state: "error", message: friendlyDbError(error), url: null });
        continue;
      }
    } else {
      const { data, error } = await supabase.from("mkt_content_items").insert(row).select("id").single();
      if (error) {
        outcomes.push({ platform, contentId: null, state: "error", message: friendlyDbError(error), url: null });
        continue;
      }
      contentId = data.id;
    }
    if (v.mode === "save") {
      outcomes.push({ platform, contentId, state: "saved_not_published", message: "Aprobada y guardada en el calendario. NO se publicó.", url: null });
      continue;
    }
    const readiness = await publishReadiness(version.business_id, platform).catch(() => null);
    if (!readiness?.ready) {
      outcomes.push({ platform, contentId, state: "saved_not_published", message: `Guardada en el calendario, NO publicada: ${readiness?.reason ?? "no se pudo verificar la cuenta."}`, url: null });
      continue;
    }
    if (!isOwner) {
      outcomes.push({ platform, contentId, state: "saved_not_published", message: "Guardada, NO publicada: solo el dueño del negocio puede aprobar la publicación.", url: null });
      continue;
    }
    const kind = asset?.mime_type.startsWith("image/") ? "image" : asset?.mime_type.startsWith("video/") ? "video" : null;
    const problem =
      asset?.storage_backend !== "supabase"
        ? "El archivo está en el almacenamiento local de desarrollo: Meta no puede descargarlo."
        : validateForPlatform({ platform: platform as PublishPlatform, format, caption: composePostText(v.caption, v.hashtags), media: kind ? { url: "", kind } : null });
    if (problem) {
      outcomes.push({ platform, contentId, state: "saved_not_published", message: `Guardada, NO publicada: ${problem}`, url: null });
      continue;
    }
    try {
      await setAutoPublish(contentId!, { userId: user.id });
    } catch (e) {
      outcomes.push({ platform, contentId, state: "error", message: e instanceof MetaError ? e.message : "No se pudo aprobar.", url: null });
      continue;
    }
    // «Publicar ahora» es una acción manual que el dueño aprueba pieza por pieza: no depende del
    // interruptor de la publicación automática (MKT_PUBLISHING_ENABLED), que solo gobierna el cron.
    if (v.mode === "now") {
      toPublishNow.push(contentId!);
      outcomes.push({ platform, contentId, state: "approved_waiting", message: "Publicando…", url: null });
    } else if (!pub.enabled) {
      outcomes.push({ platform, contentId, state: "approved_waiting", message: `Programada y aprobada para ${readiness.accountName ?? "la cuenta conectada"}, pero la publicación automática (cron) está APAGADA en el servidor: no saldrá sola a esa hora hasta activarla.`, url: null });
    } else {
      outcomes.push({ platform, contentId, state: "approved_waiting", message: `Programada y aprobada para ${readiness.accountName ?? "la cuenta conectada"}. Aún NO está publicada.`, url: null });
    }
  }

  // «Publicar ahora»: se publica en este momento con el mismo proceso del servidor y se muestra la respuesta de Meta.
  if (toPublishNow.length) {
    const cfg = metaConfig();
    try {
      await publishDue({ db: adminClient(cfg), graph: graphOptions(cfg), tokenKey: cfg.tokenKey, ids: toPublishNow, limit: toPublishNow.length });
    } catch {
      // El resultado real se lee abajo de la base.
    }
    const { data: rows } = await supabase.from("mkt_content_items").select("id,status,external_post_id,external_post_url,last_error").in("id", toPublishNow);
    for (const o of outcomes) {
      const r = rows?.find((x) => x.id === o.contentId);
      if (!r || !toPublishNow.includes(r.id)) continue;
      if (r.external_post_id) Object.assign(o, { state: "published", message: "Publicado y confirmado por Meta.", url: r.external_post_url });
      else if (r.last_error) Object.assign(o, { state: "error", message: `Meta no confirmó la publicación: ${r.last_error}` });
      else
        Object.assign(o, {
          message: pub.enabled
            ? "Aprobada; Meta aún no confirma. Se reintenta en la siguiente ejecución (máx. 15 min). Aún NO está publicada."
            : "Aprobada; Meta aún no confirma. Aún NO está publicada: vuelve a usar «Publicar ahora» (no se duplica).",
        });
    }
  }
  revalidatePath("/");
  revalidatePath("/calendario");
  return { ok: true, outcomes };
}

// ---------------------------------------------------------------------------
// Memoria
// ---------------------------------------------------------------------------
export async function addMemory(input: { businessId: string; kind: string; text: string; sourceUrl?: string | null; source?: "manual" | "research" }): Promise<Result> {
  await requireUser();
  const text = input.text.trim();
  if (!UUID.test(input.businessId) || !isMemoryKind(input.kind)) return fail("Datos inválidos.");
  if (text.length < 3 || text.length > 1000) return fail("Escribe entre 3 y 1000 caracteres.");
  if (input.sourceUrl && !/^https:\/\//.test(input.sourceUrl)) return fail("La fuente debe ser un enlace https.");
  const supabase = await createClient();
  const { error } = await supabase.from("mkt_memory").insert({ business_id: input.businessId, kind: input.kind, text, source: input.source ?? "manual", source_url: input.sourceUrl ?? null });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/estilos");
  return { ok: true };
}

export async function updateMemory(id: string, patch: { text?: string; kind?: string; active?: boolean }): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const row: Record<string, unknown> = {};
  if (patch.text !== undefined) {
    const t = patch.text.trim();
    if (t.length < 3 || t.length > 1000) return fail("Escribe entre 3 y 1000 caracteres.");
    row.text = t;
  }
  if (patch.kind !== undefined) {
    if (!isMemoryKind(patch.kind)) return fail("Tipo inválido.");
    row.kind = patch.kind;
  }
  if (patch.active !== undefined) row.active = patch.active;
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_memory").update(row).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("No tienes permiso para editar este dato.");
  revalidatePath("/estilos");
  return { ok: true };
}

export async function deleteMemory(id: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_memory").delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("No tienes permiso para borrar este dato.");
  revalidatePath("/estilos");
  return { ok: true };
}

/** Una conclusión de investigación pasa a la memoria del negocio, con su fuente. */
export async function saveFindingToMemory(findingId: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(findingId)) return fail("Identificador inválido.");
  const supabase = await createClient();
  const { data: f } = await supabase.from("mkt_research_findings").select("id,business_id,summary,url,evidence_level,source_name,consulted_at").eq("id", findingId).maybeSingle();
  if (!f) return fail("El hallazgo no existe o no tienes acceso.");
  const label = f.evidence_level === "fact" ? "Verificado" : f.evidence_level === "observation" ? "Observación" : "Hipótesis";
  const text = `${label}: ${f.summary} (Fuente: ${f.source_name}, ${String(f.consulted_at).slice(0, 10)})`.slice(0, 1000);
  const { error } = await supabase.from("mkt_memory").insert({ business_id: f.business_id, kind: "research_insight", text, source: "research", source_ref: f.id, source_url: f.url });
  if (error) return fail(friendlyDbError(error));
  revalidatePath("/estilos");
  revalidatePath("/investigar");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------
const styleSchema = z.object({
  id: z.string().regex(UUID).nullable(),
  businessId: z.string().regex(UUID),
  name: z.string().trim().min(2, "Ponle un nombre al estilo (mínimo 2 letras).").max(80),
  description: z.string().trim().max(1000).default(""),
  attributes: styleAttributesSchema,
  referenceAssetIds: z.array(z.string().regex(UUID)).max(8).default([]),
  source: z.enum(["reference_image", "manual", "research", "approved_design"]).default("manual"),
});

export async function saveStyle(input: z.input<typeof styleSchema>): Promise<Result<{ id: string }>> {
  await requireUser();
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  const s = parsed.data;
  const supabase = await createClient();
  const row = { business_id: s.businessId, name: s.name, description: s.description, attributes: s.attributes, reference_asset_ids: s.referenceAssetIds, source: s.source };
  const res = s.id
    ? await supabase.from("mkt_styles").update(row).eq("id", s.id).select("id").single()
    : await supabase.from("mkt_styles").insert(row).select("id").single();
  if (res.error) return fail(res.error.code === "23505" ? "Ya hay un estilo con ese nombre en este negocio." : friendlyDbError(res.error));
  revalidatePath("/estilos");
  revalidatePath("/");
  return { ok: true, id: res.data.id };
}

export async function setStyleActive(id: string, active: boolean): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_styles").update({ active }).eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("No tienes permiso para editar este estilo.");
  revalidatePath("/estilos");
  return { ok: true };
}

export async function deleteStyle(id: string): Promise<Result> {
  await requireUser();
  if (!UUID.test(id)) return fail("Identificador inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("mkt_styles").delete().eq("id", id).select("id");
  if (error) return fail(friendlyDbError(error));
  if (!data?.length) return fail("No tienes permiso para borrar este estilo.");
  revalidatePath("/estilos");
  revalidatePath("/");
  return { ok: true };
}
