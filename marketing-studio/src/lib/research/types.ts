export const SOURCE_TYPES = [
  "business_data",
  "calendar",
  "osm",
  "web_search",
  "google_trends",
  "meta_ad_library",
  "tiktok_creative_center",
  "google_maps",
  "manual",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABELS: Record<SourceType, string> = {
  business_data: "Datos del negocio",
  calendar: "Calendario comercial",
  osm: "OpenStreetMap",
  web_search: "Búsqueda web",
  google_trends: "Google Trends",
  meta_ad_library: "Biblioteca de anuncios de Meta",
  tiktok_creative_center: "TikTok Creative Center",
  google_maps: "Google Maps",
  manual: "Registro manual",
};

export type EvidenceLevel = "fact" | "observation" | "hypothesis";
export type Confidence = "high" | "medium" | "low";

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  fact: "Hecho comprobado",
  observation: "Observación",
  hypothesis: "Hipótesis",
};
export const CONFIDENCE_LABELS: Record<Confidence, string> = { high: "Alta", medium: "Media", low: "Baja" };

/** Hallazgo listo para guardarse (sin id ni negocio). */
export interface FindingDraft {
  source_type: SourceType;
  source_name: string;
  url: string | null;
  consulted_at: string;
  summary: string;
  evidence: string;
  evidence_level: EvidenceLevel;
  confidence: Confidence;
  capture_method: "automatic" | "manual";
  raw?: unknown;
}

export interface ResearchQuery {
  businessName: string;
  sector: string;
  city: string;
  keywords: string[];
  /** Periodo de interés (fechas locales, inclusive). */
  start: string;
  end: string;
}

export type RunStatus = "ok" | "empty" | "error" | "not_configured" | "skipped";
export interface ProviderRun {
  provider: string;
  status: RunStatus;
  message: string;
  count: number;
  at: string;
}

export interface AutomaticProvider {
  id: string;
  name: string;
  /** null si está disponible; si no, por qué. */
  unavailableReason(env: Record<string, string | undefined>): string | null;
  run(q: ResearchQuery, deps: { fetch: typeof fetch; env: Record<string, string | undefined>; now: Date }): Promise<FindingDraft[]>;
}

export interface AssistedSource {
  id: SourceType;
  name: string;
  why: string;
  links(q: ResearchQuery): { label: string; url: string }[];
}
