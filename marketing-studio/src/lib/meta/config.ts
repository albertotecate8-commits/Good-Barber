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
//     publicación (pages_manage_posts, instagram_content_publish) NO se piden
//     todavía: se agregarán cuando exista la publicación y la autorices.

type Env = Record<string, string | undefined>;

/** Permisos que se piden hoy: solo listar y leer tus páginas y su Instagram vinculado. */
export const META_LINK_SCOPES = ["pages_show_list", "pages_read_engagement", "instagram_basic", "business_management"] as const;

/** Permisos que hará falta pedir para publicar (no se usan todavía). */
export const META_PUBLISH_SCOPES = ["pages_manage_posts", "instagram_content_publish"] as const;

export const META_SESSION_MINUTES = 20;

export interface MetaConfig {
  ready: boolean;
  missing: string[];
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
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
