import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { META_SESSION_MINUTES, metaConfig, publishingConfig, type MetaConfig } from "./config";
import { decryptToken, encryptToken } from "./crypto";
import { listPages, MetaError, verifyPageToken, type GraphOptions, type MetaPage } from "./graph";
import { missingScopes, verifyPublishAccess, type PublishPlatform } from "./publish";

// Única parte de la app que usa la service_role: guarda tokens cifrados en
// tablas que el navegador no puede leer y fija «conectado» SOLO después de que
// Meta confirmó la autorización y el token de la página funcionó.

export function graphOptions(cfg: MetaConfig = metaConfig()): GraphOptions {
  return { appId: cfg.appId, appSecret: cfg.appSecret, graphVersion: cfg.graphVersion, redirectUri: cfg.redirectUri };
}

/** Cliente con service_role. SOLO servidor; nunca llega al navegador. */
export function adminClient(cfg: MetaConfig) {
  return admin(cfg);
}

function admin(cfg: MetaConfig) {
  const { url } = publicEnv();
  return createSupabaseClient(url, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function createOAuthSession(input: { userId: string; businessId: string; userToken: string; scopes: string[] }) {
  const cfg = metaConfig();
  const db = admin(cfg);
  // Una sola sesión pendiente por usuario y negocio.
  await db.from("mkt_meta_oauth_sessions").delete().eq("user_id", input.userId).eq("business_id", input.businessId);
  const { data, error } = await db
    .from("mkt_meta_oauth_sessions")
    .insert({
      user_id: input.userId,
      business_id: input.businessId,
      token_ciphertext: encryptToken(input.userToken, cfg.tokenKey),
      granted_scopes: input.scopes,
      expires_at: new Date(Date.now() + META_SESSION_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new MetaError("No se pudo guardar la autorización temporal.", "db");
  return data.id as string;
}

export interface PendingSession {
  id: string;
  businessId: string;
  scopes: string[];
  pages: MetaPage[];
}

/** Lee la sesión (solo la del propio usuario y vigente) y pide a Meta las páginas que administra. */
export async function loadOAuthSession(sessionId: string, userId: string): Promise<PendingSession | null> {
  const cfg = metaConfig();
  if (!cfg.ready) return null;
  const { data } = await admin(cfg)
    .from("mkt_meta_oauth_sessions")
    .select("id, business_id, user_id, token_ciphertext, granted_scopes, expires_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || data.user_id !== userId || new Date(data.expires_at).getTime() < Date.now()) return null;
  const pages = await listPages(graphOptions(cfg), decryptToken(data.token_ciphertext, cfg.tokenKey));
  return { id: data.id, businessId: data.business_id, scopes: data.granted_scopes ?? [], pages };
}

async function upsertAccount(
  db: ReturnType<typeof admin>,
  businessId: string,
  platform: "facebook_page" | "instagram",
  externalId: string,
  handle: string,
  url: string | null,
) {
  const { data: rows } = await db
    .from("mkt_social_accounts")
    .select("id, external_id, handle")
    .eq("business_id", businessId)
    .eq("platform", platform);
  // Reutiliza el perfil ya registrado (mismo id externo, o el único de esa red):
  // nunca se crean perfiles duplicados en la app.
  const existing = rows?.find((r) => r.external_id === externalId) ?? (rows?.length === 1 ? rows[0] : undefined);
  const patch = {
    external_id: externalId,
    connection_status: "connected",
    last_checked_at: new Date().toISOString(),
    token_expires_at: null,
  };
  if (existing) {
    const { error } = await db.from("mkt_social_accounts").update(patch).eq("id", existing.id);
    if (error) throw new MetaError("No se pudo actualizar el perfil.", "db");
    return existing.id as string;
  }
  const { data, error } = await db
    .from("mkt_social_accounts")
    .insert({ business_id: businessId, platform, handle: handle.slice(0, 120), url, ...patch })
    .select("id")
    .single();
  if (error) throw new MetaError("No se pudo registrar el perfil.", "db");
  return data.id as string;
}

/**
 * Vincula una página EXISTENTE elegida por el dueño del negocio. Vuelve a pedir
 * la lista a Meta (no se confía en lo que manda el navegador) y prueba el token.
 */
export async function linkPage(input: { sessionId: string; userId: string; pageId: string }) {
  const cfg = metaConfig();
  if (!cfg.ready) throw new MetaError("La conexión con Meta no está configurada.", "not_configured");
  const session = await loadOAuthSession(input.sessionId, input.userId);
  if (!session) throw new MetaError("La autorización venció o no es tuya. Vuelve a conectar.", "session");
  const page = session.pages.find((p) => p.id === input.pageId);
  if (!page) throw new MetaError("Esa página no está entre las que administras.", "page_not_found");
  await verifyPageToken(graphOptions(cfg), page.id, page.accessToken);

  const db = admin(cfg);
  const sealed = encryptToken(page.accessToken, cfg.tokenKey);
  const accounts: string[] = [];
  const fb = await upsertAccount(db, session.businessId, "facebook_page", page.id, page.name, page.link);
  accounts.push(fb);
  if (page.instagram) {
    const handle = page.instagram.username ?? "";
    accounts.push(
      await upsertAccount(db, session.businessId, "instagram", page.instagram.id, handle, handle ? `https://www.instagram.com/${handle}/` : null),
    );
  }
  // Con Facebook Login, Instagram se maneja con el mismo token de página.
  for (const id of accounts) {
    const { error } = await db.from("mkt_social_tokens").upsert({
      social_account_id: id,
      business_id: session.businessId,
      provider: "meta",
      token_ciphertext: sealed,
      scopes: session.scopes,
      page_tasks: page.tasks,
      expires_at: null,
    });
    if (error) throw new MetaError("No se pudo guardar el token cifrado.", "db");
  }
  await db.from("mkt_meta_oauth_sessions").delete().eq("id", session.id);
  return { businessId: session.businessId, page: { id: page.id, name: page.name }, instagram: page.instagram };
}

/** Quita la conexión en la app (borra tokens). Para retirar el permiso en Facebook: Configuración → Integraciones comerciales. */
export async function disconnectMeta(businessId: string) {
  const cfg = metaConfig();
  if (!cfg.serviceRoleKey) throw new MetaError("La conexión con Meta no está configurada.", "not_configured");
  const db = admin(cfg);
  const { data: rows } = await db.from("mkt_social_tokens").select("social_account_id").eq("business_id", businessId);
  const ids = (rows ?? []).map((r) => r.social_account_id as string);
  if (!ids.length) return 0;
  await db.from("mkt_social_tokens").delete().in("social_account_id", ids);
  await db
    .from("mkt_social_accounts")
    .update({ connection_status: "not_connected", external_id: null, token_expires_at: null, last_checked_at: new Date().toISOString() })
    .in("id", ids);
  return ids.length;
}

export interface PublishReadiness {
  ready: boolean;
  reason: string | null;
  accountId: string | null;
  missingScopes: string[];
  publishingOn: boolean;
}

/** ¿Puede este negocio publicar automáticamente en esta red? (lee tokens con service_role, sin exponerlos). */
export async function publishReadiness(businessId: string, platform: string): Promise<PublishReadiness> {
  const base = { ready: false, accountId: null, missingScopes: [], publishingOn: publishingConfig().enabled };
  if (platform !== "facebook_page" && platform !== "instagram") return { ...base, reason: "Esta red no tiene publicación automática oficial en la app." };
  const cfg = metaConfig();
  if (!cfg.ready) return { ...base, reason: "La conexión con Meta no está configurada en el servidor." };
  const db = admin(cfg);
  const { data: account } = await db
    .from("mkt_social_accounts")
    .select("id")
    .eq("business_id", businessId)
    .eq("platform", platform)
    .eq("connection_status", "connected")
    .not("external_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!account) return { ...base, reason: "La cuenta de esta red no está conectada con Meta (Negocio → Redes sociales)." };
  const { data: token } = await db.from("mkt_social_tokens").select("scopes").eq("social_account_id", account.id).maybeSingle();
  const missing = missingScopes(platform, token?.scopes ?? []);
  if (missing.length)
    return { ...base, accountId: account.id, missingScopes: missing, reason: `Falta autorizar la publicación (${missing.join(", ")}). Usa «Autorizar publicación» en Redes sociales.` };
  return { ...base, ready: true, accountId: account.id, reason: null };
}

/** Verificación segura (no publica): permisos concedidos, rol en la página y que la cuenta responda. */
export async function checkPublishAccess(businessId: string) {
  const cfg = metaConfig();
  if (!cfg.ready) throw new MetaError("La conexión con Meta no está configurada.", "not_configured");
  const db = admin(cfg);
  const { data: rows } = await db
    .from("mkt_social_accounts")
    .select("id, platform, external_id")
    .eq("business_id", businessId)
    .eq("connection_status", "connected")
    .in("platform", ["facebook_page", "instagram"]);
  const page = rows?.find((r) => r.platform === "facebook_page");
  if (!rows?.length || !page?.external_id) throw new MetaError("No hay una página conectada.", "not_connected");
  const results = [];
  for (const r of rows) {
    const { data: t } = await db.from("mkt_social_tokens").select("token_ciphertext, scopes, page_tasks").eq("social_account_id", r.id).maybeSingle();
    if (!t || !r.external_id) continue;
    const v = await verifyPublishAccess(graphOptions(cfg), {
      platform: r.platform as PublishPlatform,
      externalId: r.external_id,
      pageId: page.external_id,
      pageToken: decryptToken(t.token_ciphertext, cfg.tokenKey),
      scopes: t.scopes ?? [],
      pageTasks: t.page_tasks ?? [],
    });
    results.push({ platform: r.platform as PublishPlatform, ...v });
  }
  return results;
}

/** Marca una publicación como aprobada para publicación automática (solo tras verificar al dueño). */
export async function setAutoPublish(contentId: string, approval: { userId: string } | null) {
  const cfg = metaConfig();
  const db = admin(cfg);
  const patch = approval
    ? { publish_mode: "api", status: "scheduled", approved_by: approval.userId, approved_at: new Date().toISOString(), publish_attempts: 0, last_error: null }
    : { publish_mode: "manual", approved_by: null, approved_at: null };
  const { data, error } = await db.from("mkt_content_items").update(patch).eq("id", contentId).is("external_post_id", null).select("id");
  if (error || !data?.length) throw new MetaError("No se pudo actualizar la publicación.", "db");
}
