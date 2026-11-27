import { describe, expect, it } from "vitest";
import {
  cameraConnection,
  cameraStatusIndicator,
  computePeakHours,
  engineStatus,
  peopleInsideIndicator,
  securityIndicator,
  stationOccupancyIndicator,
  trafficIndicator,
} from "./indicators";
import type { CameraOverview, Station, TrafficDaily, TrafficHourlyLocal } from "./types";

const NOW = new Date("2026-11-27T21:00:00Z");
const never = engineStatus([], NOW);
const online = engineStatus([{ id: "n1", site_id: "s", version: "0.1", started_at: null, last_heartbeat_at: "2026-11-27T20:59:30Z" }], NOW);
const offline = engineStatus([{ id: "n1", site_id: "s", version: null, started_at: null, last_heartbeat_at: "2026-11-27T20:00:00Z" }], NOW);

const day = (over: Partial<TrafficDaily>): TrafficDaily => ({
  business_id: "b", local_date: "2026-11-27", people_detected_max: 0, entries: 0, exits: 0, visits_estimated: 0, observed_seconds: 3600, ...over,
});

const camera = (over: Partial<CameraOverview>): CameraOverview => ({
  id: "c", business_id: "b", name: "Cam", model: "TP-Link Tapo C100", location_note: null, stream_profile: "stream2",
  analysis_enabled: false, sort_order: 0, active: true, health_status: null, last_seen_at: null, last_frame_at: null,
  last_error: null, fps: null, health_updated_at: null, ...over,
});

describe("engineStatus", () => {
  it("never / online / offline", () => {
    expect(never.kind).toBe("never");
    expect(online.kind).toBe("online");
    expect(offline.kind).toBe("offline");
  });
});

describe("nunca inventa cifras", () => {
  it("sin motor: todo pendiente aunque existan filas", () => {
    expect(trafficIndicator(never, [day({ entries: 5 })], "entries").state).toBe("pending");
    expect(peopleInsideIndicator(never, []).state).toBe("pending");
    expect(securityIndicator(never, 0).state).toBe("pending");
  });
  it("motor conectado sin filas: sin datos (no cero)", () => {
    expect(trafficIndicator(online, [], "entries")).toMatchObject({ state: "no_data" });
    expect(trafficIndicator(online, [day({ observed_seconds: 0 })], "entries")).toMatchObject({ state: "no_data" });
  });
  it("con filas: suma y etiqueta la calidad", () => {
    const rows = [day({ entries: 3, visits_estimated: 2, people_detected_max: 4 }), day({ entries: 2, visits_estimated: 1, people_detected_max: 6 })];
    expect(trafficIndicator(online, rows, "entries")).toMatchObject({ state: "value", display: "5", quality: "real" });
    expect(trafficIndicator(online, rows, "visits_estimated")).toMatchObject({ display: "3", quality: "estimated" });
    expect(trafficIndicator(online, rows, "people_detected_max")).toMatchObject({ display: "6" });
    expect(trafficIndicator(offline, rows, "entries")).toMatchObject({ stale: true });
  });
  it("personas dentro siempre es estimado", () => {
    expect(peopleInsideIndicator(online, [{ business_id: "b", people_inside_estimate: 2, updated_at: "" }])).toMatchObject({
      display: "2", quality: "estimated",
    });
  });
});

describe("horas de mayor afluencia", () => {
  it("ordena por entradas e ignora horas sin observación", () => {
    const h = (local_hour: number, entries: number, observed_seconds = 3600): TrafficHourlyLocal => ({
      business_id: "b", camera_id: "c", hour_start: "", local_date: "2026-11-27", local_hour, people_detected_max: 0,
      entries, exits: 0, visits_estimated: 0, observed_seconds,
    });
    expect(computePeakHours([h(15, 2), h(17, 5), h(15, 4), h(18, 9, 0), h(12, 0)])).toEqual([
      { hour: 15, entries: 6 },
      { hour: 17, entries: 5 },
    ]);
  });
});

describe("estaciones", () => {
  const st = (id: string, active = true): Station => ({
    id, business_id: "b", camera_id: null, name: id, kind: "silla", zone: null, dwell_threshold_seconds: null,
    release_grace_seconds: 15, sort_order: 0, active,
  });
  it("sin estaciones configuradas → pendiente", () => {
    expect(stationOccupancyIndicator(online, [], [], []).state).toBe("pending");
  });
  it("con estado en vivo", () => {
    const ind = stationOccupancyIndicator(
      online,
      [st("a"), st("b"), st("x", false)],
      [{ station_id: "a", state: "occupied", since: "", updated_at: "" }, { station_id: "b", state: "free", since: "", updated_at: "" }],
      [{ station_id: "a", business_id: "b", local_date: "", occupied_seconds: 1800, observed_seconds: 3600, sessions: 1 }],
    );
    expect(ind).toMatchObject({ state: "value", display: "1 de 2" });
    expect(ind.state === "value" && ind.detail).toContain("50 %");
  });
});

describe("cámaras", () => {
  it("sin probar → pendiente; en línea solo si el último contacto es reciente", () => {
    expect(cameraStatusIndicator([camera({})], NOW).state).toBe("pending");
    expect(cameraConnection(camera({ health_status: "online", last_seen_at: "2026-11-27T20:59:00Z" }), NOW).kind).toBe("online");
    expect(cameraConnection(camera({ health_status: "online", last_seen_at: "2026-11-27T20:00:00Z" }), NOW).kind).toBe("offline");
    expect(
      cameraStatusIndicator([camera({ health_status: "online", last_seen_at: "2026-11-27T20:59:00Z" }), camera({ id: "d", health_status: "offline" })], NOW),
    ).toMatchObject({ state: "value", display: "1 de 2" });
  });
});
