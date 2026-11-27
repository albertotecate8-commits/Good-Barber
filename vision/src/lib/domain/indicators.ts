/**
 * Convierte filas reales de la base en indicadores para la interfaz.
 *
 * Regla de oro: nunca se inventa una cifra. Si no existe la fuente de
 * datos, el indicador queda "pendiente"; si existe pero no hay registros,
 * "sin datos". Solo hay número cuando hay filas reales, y siempre lleva su
 * etiqueta de calidad (real / estimado / manual).
 */
import { STATUS_THRESHOLDS } from "../config";
import type {
  BusinessLiveState,
  CameraOverview,
  DataQuality,
  EngineNode,
  Station,
  StationLiveState,
  StationOccupancyDaily,
  TrafficDaily,
  TrafficHourlyLocal,
} from "./types";
import { formatHour, formatRelative } from "./time";

// ------------------------------------------------------------------ motor

export type EngineStatus =
  | { kind: "never" }
  | { kind: "offline"; lastHeartbeat: string }
  | { kind: "online"; lastHeartbeat: string; version: string | null };

export function engineStatus(nodes: EngineNode[], now: Date): EngineStatus {
  const beats = nodes
    .filter((n) => n.last_heartbeat_at)
    .sort((a, b) => (a.last_heartbeat_at! < b.last_heartbeat_at! ? 1 : -1));
  const latest = beats[0];
  if (!latest) return { kind: "never" };
  const age = now.getTime() - new Date(latest.last_heartbeat_at!).getTime();
  if (age > STATUS_THRESHOLDS.engineOfflineAfterMs) {
    return { kind: "offline", lastHeartbeat: latest.last_heartbeat_at! };
  }
  return { kind: "online", lastHeartbeat: latest.last_heartbeat_at!, version: latest.version };
}

export function describeEngine(status: EngineStatus, now: Date = new Date()): string {
  switch (status.kind) {
    case "never":
      return "Motor de visión sin conectar. Los indicadores se activarán cuando se valide la conexión de las cámaras (Fase 1).";
    case "offline":
      return `Motor de visión desconectado · último latido ${formatRelative(status.lastHeartbeat, now)}.`;
    case "online":
      return `Motor de visión en línea${status.version ? ` · v${status.version}` : ""}.`;
  }
}

// ------------------------------------------------------------------ cámaras

export type CameraConnection =
  | { kind: "inactive" }
  | { kind: "untested" }
  | { kind: "online"; lastSeen: string }
  | { kind: "offline"; lastSeen: string | null }
  | { kind: "error"; lastSeen: string | null; message: string | null };

export function cameraConnection(cam: CameraOverview, now: Date): CameraConnection {
  if (!cam.active) return { kind: "inactive" };
  if (!cam.health_status) return { kind: "untested" };
  if (cam.health_status === "error") {
    return { kind: "error", lastSeen: cam.last_seen_at, message: cam.last_error };
  }
  const fresh =
    cam.last_seen_at !== null &&
    now.getTime() - new Date(cam.last_seen_at).getTime() <= STATUS_THRESHOLDS.cameraOfflineAfterMs;
  if (cam.health_status === "online" && fresh) return { kind: "online", lastSeen: cam.last_seen_at! };
  return { kind: "offline", lastSeen: cam.last_seen_at };
}

export function describeCameraConnection(c: CameraConnection, now: Date = new Date()): string {
  switch (c.kind) {
    case "inactive":
      return "Desactivada";
    case "untested":
      return "Conexión sin probar";
    case "online":
      return `En línea · visto ${formatRelative(c.lastSeen, now)}`;
    case "offline":
      return c.lastSeen ? `Desconectada · última conexión ${formatRelative(c.lastSeen, now)}` : "Desconectada";
    case "error":
      return c.message ? `Error: ${c.message}` : "Error de conexión";
  }
}

// ------------------------------------------------------------------ indicadores

export type Indicator =
  | { state: "pending"; reason: string }
  | { state: "no_data"; reason: string }
  | {
      state: "value";
      display: string;
      quality: Exclude<DataQuality, "pending">;
      detail?: string;
      /** El motor está desconectado: es el último valor conocido. */
      stale?: boolean;
    };

const PENDING_ENGINE = "Pendiente de conexión del motor de visión.";

function stale(engine: EngineStatus): boolean {
  return engine.kind === "offline";
}

export type TrafficField = "entries" | "exits" | "people_detected_max" | "visits_estimated";

/** Entradas, salidas, personas detectadas o visitas estimadas del día. */
export function trafficIndicator(engine: EngineStatus, rows: TrafficDaily[], field: TrafficField): Indicator {
  if (engine.kind === "never") return { state: "pending", reason: PENDING_ENGINE };
  const observed = rows.filter((r) => r.observed_seconds > 0);
  if (observed.length === 0) return { state: "no_data", reason: "Sin datos registrados hoy." };
  if (field === "people_detected_max") {
    const measured = observed.map((r) => r.people_detected_max).filter((v): v is number => v !== null);
    if (measured.length === 0) {
      return { state: "no_data", reason: "Ninguna cámara mide las personas de este negocio (solo sus entradas y salidas)." };
    }
    return { state: "value", display: String(Math.max(...measured)), quality: "real", detail: "Máximo simultáneo del día", stale: stale(engine) };
  }
  const value = observed.reduce((acc, r) => acc + r[field], 0);
  const quality = field === "visits_estimated" ? "estimated" : "real";
  return { state: "value", display: String(value), quality, stale: stale(engine) };
}

export function peopleInsideIndicator(engine: EngineStatus, live: BusinessLiveState[]): Indicator {
  if (engine.kind === "never") return { state: "pending", reason: PENDING_ENGINE };
  if (live.length === 0) return { state: "no_data", reason: "El motor aún no reporta ocupación." };
  const total = live.reduce((acc, r) => acc + r.people_inside_estimate, 0);
  return {
    state: "value",
    display: String(total),
    quality: "estimated",
    detail: "Entradas − salidas, con correcciones del motor",
    stale: stale(engine),
  };
}

export type PeakHour = { hour: number; entries: number };

export function computePeakHours(rows: TrafficHourlyLocal[], top = 3): PeakHour[] {
  const byHour = new Map<number, number>();
  for (const r of rows) {
    if (r.observed_seconds <= 0) continue;
    byHour.set(r.local_hour, (byHour.get(r.local_hour) ?? 0) + r.entries);
  }
  return [...byHour.entries()]
    .filter(([, entries]) => entries > 0)
    .map(([hour, entries]) => ({ hour, entries }))
    .sort((a, b) => b.entries - a.entries || a.hour - b.hour)
    .slice(0, top);
}

export function peakHoursIndicator(engine: EngineStatus, rows: TrafficHourlyLocal[], lookbackDays: number): Indicator {
  if (engine.kind === "never") return { state: "pending", reason: PENDING_ENGINE };
  const peaks = computePeakHours(rows);
  if (peaks.length === 0) {
    return { state: "no_data", reason: `Sin entradas registradas en los últimos ${lookbackDays} días.` };
  }
  return {
    state: "value",
    display: peaks.map((p) => formatHour(p.hour)).join(" · "),
    quality: "real",
    detail: `Por entradas registradas, últimos ${lookbackDays} días`,
    stale: stale(engine),
  };
}

export function stationOccupancyIndicator(
  engine: EngineStatus,
  stations: Station[],
  live: StationLiveState[],
  today: StationOccupancyDaily[],
): Indicator {
  const active = stations.filter((s) => s.active);
  if (active.length === 0) {
    return { state: "pending", reason: "No hay estaciones configuradas. Agrégalas en Ajustes → Estaciones." };
  }
  if (engine.kind === "never") return { state: "pending", reason: PENDING_ENGINE };
  const ids = new Set(active.map((s) => s.id));
  const liveRows = live.filter((l) => ids.has(l.station_id));
  if (liveRows.length === 0) return { state: "no_data", reason: "El motor aún no reporta estaciones." };
  const occupied = liveRows.filter((l) => l.state === "occupied").length;
  const todayRows = today.filter((t) => ids.has(t.station_id));
  const observed = todayRows.reduce((a, t) => a + t.observed_seconds, 0);
  const occ = todayRows.reduce((a, t) => a + t.occupied_seconds, 0);
  const detail =
    observed > 0 ? `Utilización hoy: ${Math.round((occ / observed) * 100)} % del tiempo observado` : "Sin tiempo observado hoy";
  return {
    state: "value",
    display: `${occupied} de ${active.length}`,
    quality: "real",
    detail,
    stale: stale(engine),
  };
}

export function cameraStatusIndicator(cameras: CameraOverview[], now: Date): Indicator {
  const active = cameras.filter((c) => c.active);
  if (active.length === 0) return { state: "pending", reason: "No hay cámaras registradas." };
  const conns = active.map((c) => cameraConnection(c, now));
  if (conns.every((c) => c.kind === "untested")) {
    return { state: "pending", reason: "Ninguna cámara se ha conectado todavía (Fase 1)." };
  }
  const online = conns.filter((c) => c.kind === "online").length;
  return {
    state: "value",
    display: `${online} de ${active.length}`,
    quality: "real",
    detail: online === active.length ? "Todas en línea" : "Hay cámaras sin conexión",
  };
}

export function securityIndicator(engine: EngineStatus, openCount: number | null): Indicator {
  if (engine.kind === "never") {
    return {
      state: "pending",
      reason: "La vigilancia propia se activa con el motor de visión (Fase 1). Mientras tanto, usa las alertas nativas de Tapo.",
    };
  }
  if (openCount === null) return { state: "no_data", reason: "No se pudo consultar." };
  return {
    state: "value",
    display: String(openCount),
    quality: "real",
    detail: openCount === 1 ? "Evento pendiente de revisar" : "Eventos pendientes de revisar",
    stale: stale(engine),
  };
}
