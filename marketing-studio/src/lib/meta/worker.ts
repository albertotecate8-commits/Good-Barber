import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { composePostText } from "@/lib/validation/content";
import { SUPABASE_BUCKET } from "@/lib/storage/config";
import { decryptToken } from "./crypto";
import { MetaError, type GraphOptions } from "./graph";
import { missingScopes, publishToMeta, type PublishInput, type PublishPlatform } from "./publish";

// Procesa las publicaciones aprobadas cuya hora ya llegó. Lo invoca la función
// programada de Netlify (cada 15 min) a través de /api/meta/publicar-programadas.
//
// Garantías contra duplicados:
//   * Solo toma filas con external_post_id vacío y las «reserva» con un candado
//     (publish_lock_at) de forma atómica: dos ejecuciones no procesan la misma.
//   * Al publicar, guarda primero el id del post de Meta (condición
//     external_post_id is null) y luego el intento; un índice único impide dos
//     intentos exitosos para el mismo contenido.
//   * Máximo 3 intentos fallidos: después queda en «Error» para revisión humana.

export const MAX_ATTEMPTS = 3;
const LOCK_MINUTES = 10;

export interface WorkerDeps {
  db: SupabaseClient; // con service_role
  graph: GraphOptions;
  tokenKey: string;
  now?: Date;
  publish?: typeof publishToMeta;
  limit?: number;
}

export interface WorkerResult {
  candidates: number;
  published: number;
  failed: number;
  skipped: number;
  details: { contentId: string; outcome: "success" | "error" | "skipped"; message: string }[];
}

export async function publishDue(deps: WorkerDeps): Promise<WorkerResult> {
  const now = deps.now ?? new Date();
  const publish = deps.publish ?? publishToMeta;
  const { db } = deps;
  const out: WorkerResult = { candidates: 0, published: 0, failed: 0, skipped: 0, details: [] };

  const { data: due, error } = await db
    .from("mkt_content_items")
    .select("id, business_id, platform, format, caption, hashtags, asset_id, publish_attempts, publish_lock_at")
    .eq("status", "scheduled")
    .eq("publish_mode", "api")
    .not("approved_at", "is", null)
    .is("external_post_id", null)
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at")
    .limit(deps.limit ?? 3); // pocas por ejecución: cada 15 min hay otra
  if (error) throw new Error(`No se pudieron leer las publicaciones programadas: ${error.message}`);
  out.candidates = due?.length ?? 0;

  for (const item of due ?? []) {
    // Reserva atómica (compare-and-swap): solo gana quien ve el mismo valor del candado.
    const stale = item.publish_lock_at && new Date(item.publish_lock_at).getTime() < now.getTime() - LOCK_MINUTES * 60_000;
    let claim = db
      .from("mkt_content_items")
      .update({ publish_lock_at: now.toISOString() })
      .eq("id", item.id)
      .eq("status", "scheduled")
      .is("external_post_id", null);
    claim = item.publish_lock_at === null ? claim.is("publish_lock_at", null) : claim.eq("publish_lock_at", item.publish_lock_at);
    const { data: claimed } = item.publish_lock_at !== null && !stale ? { data: [] } : await claim.select("id");
    if (!claimed?.length) {
      out.skipped++;
      out.details.push({ contentId: item.id, outcome: "skipped", message: "Otra ejecución la está procesando." });
      continue;
    }

    const record = async (outcome: "success" | "error" | "skipped", message: string, externalPostId: string | null = null) => {
      await db.from("mkt_publish_attempts").insert({
        content_id: item.id,
        business_id: item.business_id,
        platform: item.platform,
        outcome,
        external_post_id: externalPostId,
        error: outcome === "success" ? null : message.slice(0, 500),
      });
      out.details.push({ contentId: item.id, outcome, message });
    };

    try {
      if (item.platform !== "facebook_page" && item.platform !== "instagram") throw new MetaError("Esta red no tiene publicación automática.", "unsupported");
      const platform = item.platform as PublishPlatform;
      const { data: account } = await db
        .from("mkt_social_accounts")
        .select("id, external_id, connection_status")
        .eq("business_id", item.business_id)
        .eq("platform", platform)
        .eq("connection_status", "connected")
        .not("external_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (!account) throw new MetaError("La cuenta de la red ya no está conectada.", "not_connected");
      const { data: token } = await db.from("mkt_social_tokens").select("token_ciphertext, scopes").eq("social_account_id", account.id).maybeSingle();
      if (!token) throw new MetaError("No hay autorización guardada para esta cuenta.", "no_token");
      const missing = missingScopes(platform, token.scopes ?? []);
      if (missing.length) throw new MetaError(`Faltan permisos de publicación: ${missing.join(", ")}. Vuelve a autorizar con «Autorizar publicación».`, "missing_scopes");

      let media: PublishInput["media"] = null;
      if (item.asset_id) {
        const { data: asset } = await db.from("mkt_assets").select("storage_backend, storage_path, mime_type, upload_status, business_id").eq("id", item.asset_id).maybeSingle();
        if (!asset || asset.business_id !== item.business_id || asset.upload_status !== "ready") throw new MetaError("El recurso no está disponible.", "asset");
        if (asset.storage_backend !== "supabase") throw new MetaError("El recurso está en el almacenamiento local de desarrollo: Meta no puede descargarlo.", "asset_local");
        const kind = asset.mime_type.startsWith("video/") ? "video" : asset.mime_type.startsWith("image/") ? "image" : null;
        if (!kind) throw new MetaError("Solo se publican imágenes o videos.", "asset_kind");
        // Enlace firmado y temporal (1 h) solo para que Meta descargue el archivo.
        const { data: signed, error: e } = await db.storage.from(SUPABASE_BUCKET).createSignedUrl(asset.storage_path, 3600);
        if (e || !signed) throw new MetaError("No se pudo preparar el enlace del recurso.", "asset_url");
        media = { url: signed.signedUrl, kind };
      }

      const { externalPostId } = await publish(deps.graph, {
        platform,
        externalId: account.external_id!,
        pageToken: decryptToken(token.token_ciphertext, deps.tokenKey),
        caption: composePostText(item.caption ?? "", item.hashtags ?? []),
        format: item.format,
        media,
      }, { maxPolls: 6, pollIntervalMs: 3000 }); // cabe en el límite de 30 s de la función programada

      // Primero el id del post (clave contra duplicados), luego el intento.
      await db
        .from("mkt_content_items")
        .update({ status: "published", external_post_id: externalPostId, published_at: now.toISOString(), last_error: null, publish_lock_at: null })
        .eq("id", item.id)
        .is("external_post_id", null);
      await record("success", "Publicado y confirmado por Meta.", externalPostId);
      out.published++;
    } catch (e) {
      const message = e instanceof MetaError ? e.message : "Error inesperado al publicar.";
      const attempts = (item.publish_attempts ?? 0) + 1;
      const final = attempts >= MAX_ATTEMPTS || (e instanceof MetaError && ["missing_scopes", "not_connected", "no_token", "unsupported", "asset_local", "asset_kind", "invalid_content"].includes(e.code));
      await db
        .from("mkt_content_items")
        .update({ publish_attempts: attempts, last_error: message.slice(0, 500), publish_lock_at: null, ...(final ? { status: "error" } : {}) })
        .eq("id", item.id);
      await record("error", message);
      out.failed++;
    }
  }
  return out;
}
