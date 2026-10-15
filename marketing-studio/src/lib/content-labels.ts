import type { ContentStatus } from "@/lib/data/types";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Borrador",
  review: "En revisión",
  approved: "Aprobado",
  scheduled: "Programado",
  published: "Publicado",
  error: "Error",
};

export const CONTENT_STATUS_TONES: Record<ContentStatus, "neutral" | "warn" | "action" | "gold" | "positive" | "danger"> = {
  draft: "neutral",
  review: "warn",
  approved: "action",
  scheduled: "gold",
  published: "positive",
  error: "danger",
};

/** Estados que el usuario puede asignar. "Publicado" y "Error" solo los asigna el servidor. */
export const EDITABLE_STATUSES = ["draft", "review", "approved", "scheduled"] as const;
export type EditableStatus = (typeof EDITABLE_STATUSES)[number];

export const CONTENT_FORMATS = ["post", "story", "reel", "carousel", "video", "flyer", "other"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export const FORMAT_LABELS: Record<ContentFormat, string> = {
  post: "Publicación",
  story: "Historia",
  reel: "Reel",
  carousel: "Carrusel",
  video: "Video",
  flyer: "Flyer",
  other: "Otro",
};

export const ASSET_KIND_LABELS = {
  image: "Imagen",
  video: "Video",
  logo: "Logotipo",
  document: "Documento",
  other: "Otro",
} as const;
export type AssetKind = keyof typeof ASSET_KIND_LABELS;
export const ASSET_KINDS = Object.keys(ASSET_KIND_LABELS) as AssetKind[];
