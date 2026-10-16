// Configuración de la conexión oficial con Meta (Facebook Login + Graph API).
//
// Todo es opcional: sin estas variables la app funciona igual y muestra qué
// falta. Nada aquí es de pago: crear una app en Meta for Developers es gratis.
// Investigado en octubre de 2026 (developers.facebook.com):
//   * Graph API vigente: v26.0 (29-jul-2026); v25.0 sigue soportada.
//   * Con «Acceso estándar» una app solo funciona para personas con rol en la
//     app (tú). Para tus propias páginas no hace falta App Review; publicar
//     para cuentas de terceros exigiría App Review + verificación del negocio.
//   * Para LEER y VINCULAR la página basta con permisos de lectura. Los de
//     publicación (pages_manage_posts, instagram_content_publish) solo se piden
//     con «Autorizar publicación» (otra autorización explícita tuya).
//   * Apps de tipo «Negocio»: Meta usa Facebook Login for Business, donde los
//     permisos se guardan en una «configuración» del panel y el diálogo recibe
//     config_id en lugar de scope. Si defines META_LOGIN_CONFIG_ID (lectura) y
//     META_PUBLISH_CONFIG_ID (lectura + publicación) se usan; si no, scope.

type Env = Record<string, string | undefined>;

/** Permisos que se piden hoy: solo listar y leer tus páginas y su Instagram vinculado. */
export const META_LINK_SCOPES = ["pages_show_list", "pages_read_engagement", "instagram_basic", "business_management"] as const;

/** Permisos extra que se piden solo con «Autorizar publicación». */
export const META_PUBLISH_SCOPES = ["pages_manage_posts", "instagram_content_publish"] as const;

export const META_SESSION_MINUTES = 20;

export interface MetaConfig {
  ready: boolean;
  missing: string[];
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  /** Facebook Login for Business: id de la configuración de solo lectura / con publicación (opcionales). */
  loginConfigId: string;
  publishConfigId: string;
  serviceRoleKey: string;
  tokenKey: string;
}

export function metaConfig(env: Env = process.env): MetaConfig {
  const appUrl = (env.MKT_APP_URL || env.URL || "").replace(/\/$/, "");
  const cfg = {
    appId: env.META_APP_ID?.trim() ?? "",
    appSecret: env.META_APP_SECRET?.trim() ?? "",
    graphVersion: /^v\d{2}\.0$/.test(env.META_GRAPH_VERSION ?? "") ? env.META_GRAPH_VERSION! : "v26.0",
    redirectUri: appUrl ? `${appUrl}/api/meta/retorno` : "",
    loginConfigId: /^\d{5,20}$/.test(env.META_LOGIN_CONFIG_ID?.trim() ?? "") ? env.META_LOGIN_CONFIG_ID!.trim() : "",
    publishConfigId: /^\d{5,20}$/.test(env.META_PUBLISH_CONFIG_ID?.trim() ?? "") ? env.META_PUBLISH_CONFIG_ID!.trim() : "",
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
    tokenKey: env.MKT_TOKEN_KEY?.trim() ?? "",
  };
  const missing: string[] = [];
  if (!/^\d{5,20}$/.test(cfg.appId)) missing.push("META_APP_ID");
  if (cfg.appSecret.length < 16) missing.push("META_APP_SECRET");
  if (!/^https:\/\//.test(appUrl) && !/^http:\/\/localhost(:\d+)?$/.test(appUrl)) missing.push("MKT_APP_URL");
  if (!cfg.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!validTokenKey(cfg.tokenKey)) missing.push("MKT_TOKEN_KEY");
  return { ...cfg, ready: missing.length === 0, missing };
}

/** MKT_TOKEN_KEY: 32 bytes en base64 (p. ej. `openssl rand -base64 32`). */
export function validTokenKey(key: string) {
  try {
    return Buffer.from(key, "base64").length === 32;
  } catch {
    return false;
  }
}

/** Cookie httpOnly con el nonce del flujo OAuth (protección CSRF). */
export const META_NONCE_COOKIE = "mkt_meta_nonce";

/**
 * Publicación automática: APAGADA salvo que MKT_PUBLISHING_ENABLED=1 (interruptor
 * explícito tuyo) y exista MKT_CRON_SECRET (lo usa la función programada de Netlify).
 */
export function publishingConfig(env: Env = process.env) {
  const secret = env.MKT_CRON_SECRET?.trim() ?? "";
  const enabled = env.MKT_PUBLISHING_ENABLED === "1";
  const missing = [...(enabled ? [] : ["MKT_PUBLISHING_ENABLED=1"]), ...(secret.length >= 24 ? [] : ["MKT_CRON_SECRET"])];
  return { enabled: enabled && secret.length >= 24, secret, missing };
}

/**
 * Datos que hay que copiar en el panel de Meta for Developers. No incluye
 * secretos: solo direcciones públicas derivadas de la URL del sitio.
 */
export function metaSetupInfo(env: Env = process.env) {
  const appUrl = (env.MKT_APP_URL || env.URL || "").replace(/\/$/, "");
  const https = /^https:\/\//.test(appUrl);
  return {
    appUrl,
    https,
    appDomain: appUrl ? new URL(appUrl).hostname : "",
    redirectUri: appUrl ? `${appUrl}/api/meta/retorno` : "",
    privacyUrl: appUrl ? `${appUrl}/privacidad` : "",
    deletionUrl: appUrl ? `${appUrl}/eliminacion-de-datos` : "",
  };
}
