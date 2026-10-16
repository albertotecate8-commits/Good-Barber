// Publicación con la Graph API oficial (endpoints documentados por Meta):
//   * Página de Facebook: POST /{page-id}/photos (imagen), /{page-id}/videos
//     (video) o /{page-id}/feed (solo texto).
//   * Instagram (vía la página): POST /{ig-user-id}/media para crear el
//     contenedor, esperar a que esté FINISHED (videos) y POST
//     /{ig-user-id}/media_publish.
// `fetch` es inyectable: las pruebas usan respuestas simuladas y NUNCA publican.
import { MetaError, type GraphOptions } from "./graph";

/** Permisos mínimos para publicar, según la documentación oficial. */
export const REQUIRED_PUBLISH_SCOPES = {
  facebook_page: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
  instagram: ["instagram_basic", "instagram_content_publish", "pages_read_engagement"],
} as const;

export type PublishPlatform = keyof typeof REQUIRED_PUBLISH_SCOPES;

export function missingScopes(platform: PublishPlatform, granted: string[]) {
  return REQUIRED_PUBLISH_SCOPES[platform].filter((s) => !granted.includes(s));
}

export interface PublishInput {
  platform: PublishPlatform;
  /** id de la página (Facebook) o de la cuenta profesional de Instagram. */
  externalId: string;
  pageToken: string;
  caption: string;
  format: string;
  media: { url: string; kind: "image" | "video" } | null;
}

const GRAPH = "https://graph.facebook.com";

async function post(o: GraphOptions, path: string, params: Record<string, string>) {
  return call(o, path, params, "POST");
}

async function call(o: GraphOptions, path: string, params: Record<string, string>, method: "GET" | "POST") {
  const url = `${GRAPH}/${o.graphVersion}/${path}`;
  const body = new URLSearchParams(params);
  let res: Response;
  try {
    res =
      method === "POST"
        ? await (o.fetchImpl ?? fetch)(url, { method, body, signal: AbortSignal.timeout(30000) })
        : await (o.fetchImpl ?? fetch)(`${url}?${body}`, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  } catch {
    throw new MetaError("No se pudo contactar a Meta (red).", "network");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string; code?: number } };
  if (!res.ok || json.error) {
    throw new MetaError(`Meta rechazó la publicación: ${String(json.error?.message ?? `HTTP ${res.status}`).slice(0, 200)}`, `graph_${json.error?.code ?? res.status}`);
  }
  return json;
}

/** Valida antes de llamar a Meta lo que cada red exige (evita intentos inútiles). */
export function validateForPlatform(input: Pick<PublishInput, "platform" | "media" | "caption" | "format">): string | null {
  if (input.platform === "instagram") {
    if (!input.media) return "Instagram exige una imagen o un video.";
    if (input.caption.length > 2200) return "Instagram admite hasta 2 200 caracteres.";
    if ((input.caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) return "Instagram admite hasta 30 hashtags.";
  }
  if (input.platform === "facebook_page" && !input.media && !input.caption.trim()) return "La publicación está vacía.";
  return null;
}

export async function publishToMeta(
  o: GraphOptions,
  input: PublishInput,
  opts: { pollIntervalMs?: number; maxPolls?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<{ externalPostId: string }> {
  const problem = validateForPlatform(input);
  if (problem) throw new MetaError(problem, "invalid_content");
  const token = input.pageToken;

  if (input.platform === "facebook_page") {
    if (input.media?.kind === "image") {
      const r = await post(o, `${input.externalId}/photos`, { url: input.media.url, caption: input.caption, published: "true", access_token: token });
      return { externalPostId: String(r.post_id ?? r.id) };
    }
    if (input.media?.kind === "video") {
      const r = await post(o, `${input.externalId}/videos`, { file_url: input.media.url, description: input.caption, access_token: token });
      return { externalPostId: String(r.id) };
    }
    const r = await post(o, `${input.externalId}/feed`, { message: input.caption, access_token: token });
    return { externalPostId: String(r.id) };
  }

  // Instagram: contenedor → (espera si es video) → publicar.
  const media = input.media!;
  const params: Record<string, string> = { access_token: token };
  if (input.format === "story") {
    params.media_type = "STORIES";
    params[media.kind === "video" ? "video_url" : "image_url"] = media.url;
  } else if (media.kind === "video") {
    params.media_type = "REELS";
    params.video_url = media.url;
    params.caption = input.caption;
  } else {
    params.image_url = media.url;
    params.caption = input.caption;
  }
  const container = await post(o, `${input.externalId}/media`, params);
  const creationId = String(container.id ?? "");
  if (!creationId) throw new MetaError("Meta no devolvió el contenedor de Instagram.", "no_container");

  if (media.kind === "video") {
    const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const max = opts.maxPolls ?? 20;
    let status = "IN_PROGRESS";
    for (let i = 0; i < max && status !== "FINISHED"; i++) {
      await sleep(opts.pollIntervalMs ?? 3000);
      const s = await call(o, creationId, { fields: "status_code", access_token: token }, "GET");
      status = String(s.status_code ?? "");
      if (status === "ERROR" || status === "EXPIRED") throw new MetaError(`Instagram no pudo procesar el video (${status}).`, "container_error");
    }
    if (status !== "FINISHED") throw new MetaError("Instagram sigue procesando el video; se reintentará.", "container_pending");
  }
  const published = await post(o, `${input.externalId}/media_publish`, { creation_id: creationId, access_token: token });
  return { externalPostId: String(published.id) };
}

/**
 * Verificación SEGURA de permisos de publicación: NO publica nada. Compara los
 * permisos concedidos (guardados al vincular, confirmados con debug_token) con
 * los que exige cada red, revisa el rol en la página y lee la página con su token.
 */
export async function verifyPublishAccess(
  o: GraphOptions,
  input: { platform: PublishPlatform; externalId: string; pageId: string; pageToken: string; scopes: string[]; pageTasks: string[] },
) {
  const missing = missingScopes(input.platform, input.scopes);
  const canCreateContent = input.pageTasks.includes("CREATE_CONTENT") || input.pageTasks.includes("MANAGE");
  const node = await call(o, input.platform === "instagram" ? input.externalId : input.pageId, { fields: input.platform === "instagram" ? "id,username" : "id,name", access_token: input.pageToken }, "GET");
  return { reachable: String(node.id) === (input.platform === "instagram" ? input.externalId : input.pageId), missing, canCreateContent };
}

/**
 * Enlace permanente de lo publicado: `permalink_url` (Post de página) o
 * `permalink` (IG Media), campos oficiales. Si Meta no lo devuelve, se usa una
 * URL construida a partir del id del post y se indica que no fue confirmada.
 */
export async function fetchPermalink(
  o: GraphOptions,
  platform: PublishPlatform,
  externalPostId: string,
  token: string,
): Promise<{ url: string | null; confirmed: boolean }> {
  try {
    const field = platform === "instagram" ? "permalink" : "permalink_url";
    const r = await call(o, externalPostId, { fields: field, access_token: token }, "GET");
    const url = String(r[field] ?? "");
    if (/^https:\/\/(www\.)?(facebook|instagram)\.com\//.test(url)) return { url, confirmed: true };
  } catch {
    // Sin enlace confirmado: se intenta una URL estándar abajo.
  }
  if (platform === "facebook_page" && /^\d+_\d+$/.test(externalPostId)) {
    const [page, post] = externalPostId.split("_");
    return { url: `https://www.facebook.com/${page}/posts/${post}`, confirmed: false };
  }
  return { url: null, confirmed: false };
}
