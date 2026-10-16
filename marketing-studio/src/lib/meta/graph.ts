// Cliente mínimo de la Graph API de Meta (endpoints oficiales y documentados).
// `fetch` es inyectable para las pruebas. Nunca se registran tokens en logs ni
// en mensajes de error.
import { META_LINK_SCOPES } from "./config";

type Fetch = typeof fetch;

export interface GraphOptions {
  appId: string;
  appSecret: string;
  graphVersion: string;
  redirectUri: string;
  fetchImpl?: Fetch;
}

export interface MetaPage {
  id: string;
  name: string;
  link: string | null;
  tasks: string[];
  accessToken: string;
  instagram: { id: string; username: string | null } | null;
}

export class MetaError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const GRAPH = "https://graph.facebook.com";

/**
 * Diálogo oficial de inicio de sesión. Con `configId` (Facebook Login for
 * Business) los permisos vienen de la configuración guardada en Meta y NO se
 * envía scope; sin él se usa Facebook Login clásico con scope.
 */
export function authorizeUrl(o: GraphOptions, state: string, scopes: readonly string[] = META_LINK_SCOPES, configId = "") {
  const q = new URLSearchParams({
    client_id: o.appId,
    redirect_uri: o.redirectUri,
    state,
    response_type: "code",
  });
  if (configId) q.set("config_id", configId);
  else q.set("scope", scopes.join(","));
  return `https://www.facebook.com/${o.graphVersion}/dialog/oauth?${q}`;
}

async function getJson(o: GraphOptions, path: string, params: Record<string, string>) {
  const url = `${GRAPH}/${o.graphVersion}/${path}?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  } catch {
    throw new MetaError("No se pudo contactar a Meta (red).", "network");
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    // El mensaje de Meta no contiene el token; se recorta por seguridad.
    const msg = String(body.error?.message ?? `HTTP ${res.status}`).slice(0, 200);
    throw new MetaError(`Meta respondió con un error: ${msg}`, `graph_${body.error?.code ?? res.status}`);
  }
  return body;
}

/** Cambia el `code` del diálogo por un token de usuario de larga duración (~60 días). */
export async function exchangeCode(o: GraphOptions, code: string): Promise<{ token: string; expiresAt: Date | null }> {
  const short = await getJson(o, "oauth/access_token", {
    client_id: o.appId,
    client_secret: o.appSecret,
    redirect_uri: o.redirectUri,
    code,
  });
  const long = await getJson(o, "oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: o.appId,
    client_secret: o.appSecret,
    fb_exchange_token: String(short.access_token ?? ""),
  });
  const token = String(long.access_token ?? "");
  if (!token) throw new MetaError("Meta no entregó un token.", "no_token");
  const seconds = Number(long.expires_in ?? 0);
  return { token, expiresAt: seconds > 0 ? new Date(Date.now() + seconds * 1000) : null };
}

/** Verifica con Meta que el token es válido, de ESTA app, y qué permisos concedió el usuario. */
export async function inspectToken(o: GraphOptions, token: string): Promise<{ userId: string; scopes: string[] }> {
  const body = await getJson(o, "debug_token", { input_token: token, access_token: `${o.appId}|${o.appSecret}` });
  const d = (body.data ?? {}) as { is_valid?: boolean; app_id?: string; user_id?: string; scopes?: string[] };
  if (!d.is_valid) throw new MetaError("Meta indica que la autorización no es válida.", "invalid_token");
  if (String(d.app_id) !== o.appId) throw new MetaError("El token pertenece a otra app de Meta.", "wrong_app");
  return { userId: String(d.user_id ?? ""), scopes: Array.isArray(d.scopes) ? d.scopes.map(String) : [] };
}

/** Páginas que el usuario administra (con su token de página) y su Instagram profesional vinculado. */
export async function listPages(o: GraphOptions, userToken: string): Promise<MetaPage[]> {
  const body = await getJson(o, "me/accounts", {
    fields: "id,name,link,tasks,access_token,instagram_business_account{id,username}",
    limit: "100",
    access_token: userToken,
  });
  const rows = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [];
  return rows
    .filter((p) => typeof p.id === "string" && typeof p.access_token === "string")
    .map((p) => {
      const ig = p.instagram_business_account as { id?: string; username?: string } | undefined;
      return {
        id: String(p.id),
        name: String(p.name ?? ""),
        link: typeof p.link === "string" && p.link.startsWith("https://") ? p.link : null,
        tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : [],
        accessToken: String(p.access_token),
        instagram: ig?.id ? { id: String(ig.id), username: ig.username ? String(ig.username) : null } : null,
      };
    });
}

/** Comprueba que el token de página funciona leyendo la propia página. */
export async function verifyPageToken(o: GraphOptions, pageId: string, pageToken: string) {
  const body = await getJson(o, pageId, { fields: "id,name", access_token: pageToken });
  if (String(body.id) !== pageId) throw new MetaError("El token no corresponde a la página elegida.", "page_mismatch");
  return { id: String(body.id), name: String(body.name ?? "") };
}

/** Normaliza un nombre para sugerir la página que coincide con el perfil registrado (sin acentos ni mayúsculas). */
export function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}
