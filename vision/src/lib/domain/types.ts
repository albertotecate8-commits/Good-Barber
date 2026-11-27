/**
 * Tipos de dominio. Reflejan las tablas/vistas del esquema `vision`
 * (ver supabase/migrations). Si cambias una migración, actualiza aquí.
 */

export type Role = "owner" | "admin" | "viewer";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Propietario",
  admin: "Administrador",
  viewer: "Solo lectura",
};

export type Membership = {
  site_id: string;
  site_name: string;
  timezone: string;
  role: Role;
  display_name: string | null;
};

export type Business = {
  id: string;
  site_id: string;
  slug: string;
  name: string;
  accent_color: string;
  hours_confirmed: boolean;
  default_dwell_seconds: number;
  sort_order: number;
  active: boolean;
};

export type BusinessHoursRow = {
  business_id: string;
  weekday: number; // 0 = domingo … 6 = sábado
  is_closed: boolean;
  opens_at: string | null; // "HH:MM:SS"
  closes_at: string | null;
};

export type StreamProfile = "stream1" | "stream2";

export type CameraOverview = {
  id: string;
  business_id: string;
  name: string;
  model: string;
  location_note: string | null;
  stream_profile: StreamProfile;
  analysis_enabled: boolean;
  sort_order: number;
  active: boolean;
  health_status: "online" | "offline" | "error" | null;
  last_seen_at: string | null;
  last_frame_at: string | null;
  last_error: string | null;
  fps: number | null;
  health_updated_at: string | null;
};

export type StationKind = "silla" | "mesa" | "lavabo" | "espera" | "otro";

export const STATION_KIND_LABELS: Record<StationKind, string> = {
  silla: "Silla",
  mesa: "Mesa",
  lavabo: "Lavabo",
  espera: "Área de espera",
  otro: "Otro",
};

export type NormalizedPoint = [number, number];

export type Station = {
  id: string;
  business_id: string;
  camera_id: string | null;
  name: string;
  kind: StationKind;
  zone: NormalizedPoint[] | null;
  dwell_threshold_seconds: number | null;
  release_grace_seconds: number;
  sort_order: number;
  active: boolean;
};

export type EngineNode = {
  id: string;
  site_id: string;
  version: string | null;
  started_at: string | null;
  last_heartbeat_at: string | null;
};

export type TrafficDaily = {
  business_id: string;
  local_date: string;
  /** null = ninguna cámara mide personas de este negocio en ese periodo. */
  people_detected_max: number | null;
  entries: number;
  exits: number;
  visits_estimated: number;
  observed_seconds: number;
};

export type TrafficHourlyLocal = {
  business_id: string;
  camera_id: string;
  hour_start: string;
  local_date: string;
  local_hour: number;
  people_detected_max: number | null;
  entries: number;
  exits: number;
  visits_estimated: number;
  observed_seconds: number;
};

export type StationOccupancyDaily = {
  station_id: string;
  business_id: string;
  local_date: string;
  occupied_seconds: number;
  observed_seconds: number;
  sessions: number;
};

export type StationLiveState = {
  station_id: string;
  state: "occupied" | "free" | "unknown";
  since: string;
  updated_at: string;
};

export type BusinessLiveState = {
  business_id: string;
  people_inside_estimate: number;
  updated_at: string;
};

export type SecurityCategory = "camera_alert" | "analysis_alert" | "unconfirmed";
export type SecurityKind =
  | "after_hours_presence"
  | "after_hours_motion"
  | "camera_offline"
  | "camera_recovered"
  | "engine_offline";
export type SecurityStatus = "open" | "acknowledged" | "dismissed";

export const SECURITY_CATEGORY_LABELS: Record<SecurityCategory, string> = {
  camera_alert: "Alerta de cámara",
  analysis_alert: "Alerta de análisis",
  unconfirmed: "Sin confirmar",
};

export const SECURITY_KIND_LABELS: Record<SecurityKind, string> = {
  after_hours_presence: "Presencia fuera de horario",
  after_hours_motion: "Movimiento fuera de horario",
  camera_offline: "Cámara desconectada",
  camera_recovered: "Cámara reconectada",
  engine_offline: "Motor de visión sin conexión",
};

export const SECURITY_STATUS_LABELS: Record<SecurityStatus, string> = {
  open: "Pendiente de revisar",
  acknowledged: "Revisado",
  dismissed: "Descartado",
};

export type SecurityEvent = {
  id: number;
  business_id: string;
  camera_id: string | null;
  category: SecurityCategory;
  kind: SecurityKind;
  severity: "info" | "warning" | "critical";
  source: "vision_engine" | "manual";
  occurred_at: string;
  status: SecurityStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type Member = {
  user_id: string;
  email: string;
  role: Role;
  display_name: string | null;
  active: boolean;
  created_at: string;
};

/**
 * Calidad del dato, siempre visible en la interfaz:
 *   real      → medido/registrado por el motor (p. ej. un cruce de línea).
 *   estimated → calculado/aproximado (personas dentro, visitas estimadas).
 *   manual    → capturado por una persona.
 *   pending   → todavía no existe la fuente de datos.
 */
export type DataQuality = "real" | "estimated" | "manual" | "pending";
