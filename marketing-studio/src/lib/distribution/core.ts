// Distribución asistida a grupos de Facebook.
//
// Meta retiró la API de grupos el 22-abr-2024 (publish_to_groups,
// groups_access_member_info): ninguna app puede publicar sola en un grupo.
// La vía oficial que queda es el diálogo para compartir de Facebook (Share
// Dialog / sharer): la app abre el contenido original y la persona elige el
// grupo dentro de Facebook y confirma. Este módulo prepara cada destino, evita
// repeticiones y controla la frecuencia; nunca simula clics ni usa cookies.

export const POSTING_MODES = ["share_page_post", "new_post_as_page", "new_post_as_profile"] as const;
export type PostingMode = (typeof POSTING_MODES)[number];
export const POSTING_MODE_LABELS: Record<PostingMode, string> = {
  share_page_post: "Compartir la publicación original de la página",
  new_post_as_page: "Publicación nueva como la página (el grupo no acepta compartidos)",
  new_post_as_profile: "Publicación nueva desde tu perfil (el grupo no admite páginas)",
};

export const TASK_STATUSES = ["pending", "opened", "awaiting_approval", "confirmed", "skipped", "failed", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pendiente de compartir",
  opened: "Abierto en Facebook (sin confirmar)",
  awaiting_approval: "Pendiente de aprobación del grupo",
  confirmed: "Confirmado como publicado",
  skipped: "Omitido",
  failed: "Error",
  cancelled: "Cancelado",
};
export const OPEN_STATUSES: TaskStatus[] = ["pending", "opened"];
export const DONE_STATUSES: TaskStatus[] = ["confirmed", "awaiting_approval", "skipped", "failed", "cancelled"];

/** Tope de grupos abiertos o confirmados por negocio en 24 h: evita parecer spam ante Facebook y los grupos. */
export const DAILY_GROUP_LIMIT = 5;

const GROUP_URL = /^https:\/\/(www\.|m\.|web\.)?facebook\.com\/groups\/([A-Za-z0-9._-]+)\/?(?:[?#].*)?$/;

/** Normaliza la URL de un grupo (quita parámetros) o devuelve null si no es un grupo de Facebook. */
export function normalizeGroupUrl(raw: string): string | null {
  const m = GROUP_URL.exec(raw.trim());
  return m ? `https://www.facebook.com/groups/${m[2]}/` : null;
}

/**
 * Enlace para compartir con la interfaz nativa de Facebook. Con META_APP_ID se
 * usa el Share Dialog oficial (permite elegir «Compartir en un grupo»); sin él,
 * el enlace oficial sharer.php. En ambos la persona elige el destino y confirma.
 */
export function shareUrl(sourceUrl: string, appId?: string | null, redirectUri?: string | null): string {
  if (appId && /^\d{5,20}$/.test(appId)) {
    const q = new URLSearchParams({ app_id: appId, href: sourceUrl, display: "page" });
    if (redirectUri) q.set("redirect_uri", redirectUri);
    return `https://www.facebook.com/dialog/share?${q}`;
  }
  return `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: sourceUrl })}`;
}

const INTROS = [
  "¡Hola, {grupo}! Les comparto esto de {negocio}:",
  "Para quienes están en {grupo} y buscan {sector}:",
  "Vecinos de {grupo}, esto puede interesarles:",
  "Les dejo la información de {negocio} por si a alguien le sirve:",
  "Compartimos con {grupo} lo nuevo de {negocio}:",
];

/**
 * Texto para un grupo concreto. Cambia la introducción según el grupo y su
 * posición en la cola para no repetir el mismo mensaje idéntico en todos.
 * Para «compartir la publicación original» es solo el comentario que acompaña
 * al compartido; para publicaciones nuevas incluye el texto y el enlace original.
 */
export function groupText(input: {
  mode: PostingMode;
  groupName: string;
  businessName: string;
  sector: string;
  caption: string;
  sourceUrl: string;
  position: number;
}): string {
  const intro = INTROS[input.position % INTROS.length]
    .replace("{grupo}", input.groupName)
    .replace("{negocio}", input.businessName)
    .replace("{sector}", input.sector ? input.sector.toLowerCase() : "este servicio");
  if (input.mode === "share_page_post") return intro;
  return [intro, "", input.caption.trim(), "", `Publicación original: ${input.sourceUrl}`].join("\n").trim();
}

/** ¿Se puede volver a distribuir en este grupo? Respeta la pausa mínima configurada. */
export function frequencyCheck(minDaysBetween: number, lastActivityAt: string | null, now = new Date()) {
  if (!lastActivityAt) return { allowed: true as const, nextAllowedAt: null };
  const next = new Date(new Date(lastActivityAt).getTime() + minDaysBetween * 864e5);
  return next <= now ? { allowed: true as const, nextAllowedAt: null } : { allowed: false as const, nextAllowedAt: next };
}

export interface QueueTask {
  id: string;
  status: TaskStatus;
  position: number;
  opened_at: string | null;
  confirmed_at: string | null;
}

/** Siguiente destino: el primer pendiente (o abierto sin confirmar) en el orden de la cola. */
export function nextTask<T extends QueueTask>(tasks: T[]): T | null {
  return [...tasks].sort((a, b) => a.position - b.position).find((t) => OPEN_STATUSES.includes(t.status)) ?? null;
}

/** Actividad de las últimas 24 h (abiertos o confirmados) para el tope diario. */
export function activityLast24h(tasks: QueueTask[], now = new Date()) {
  const since = now.getTime() - 864e5;
  return tasks.filter((t) => {
    const at = t.confirmed_at ?? t.opened_at;
    return at !== null && new Date(at).getTime() > since && t.status !== "pending";
  }).length;
}

export function progress(tasks: { status: TaskStatus }[]) {
  const count = (s: TaskStatus[]) => tasks.filter((t) => s.includes(t.status)).length;
  return {
    total: tasks.length,
    pending: count(["pending", "opened"]),
    awaitingApproval: count(["awaiting_approval"]),
    confirmed: count(["confirmed"]),
    failed: count(["failed"]),
    skipped: count(["skipped", "cancelled"]),
  };
}
