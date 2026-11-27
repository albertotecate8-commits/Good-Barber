"use client";

/**
 * Acceso a datos. Todas las consultas pasan por aquí: si cambia el esquema,
 * este es el único archivo que hay que ajustar (junto con domain/types.ts).
 * Las reglas de acceso las impone RLS en el servidor; este código solo
 * pide lo que el usuario ya tiene permitido ver.
 */
import { getSupabase } from "../supabase/client";
import { unwrap } from "../domain/errors";
import type {
  Business,
  BusinessHoursRow,
  BusinessLiveState,
  CameraOverview,
  EngineNode,
  Member,
  Membership,
  Role,
  SecurityEvent,
  SecurityStatus,
  Station,
  StationLiveState,
  StationOccupancyDaily,
  TrafficDaily,
  TrafficHourlyLocal,
} from "../domain/types";

const sb = () => getSupabase();

// ------------------------------------------------------------------ sitio y miembros

export async function fetchMyMemberships(): Promise<Membership[]> {
  return unwrap(await sb().rpc("my_memberships")) ?? [];
}

export async function fetchMembers(siteId: string): Promise<Member[]> {
  return unwrap(await sb().rpc("list_members", { p_site: siteId })) ?? [];
}

export async function addMemberByEmail(siteId: string, email: string, role: Role, displayName: string | null) {
  unwrap(
    await sb().rpc("add_member_by_email", {
      p_site: siteId,
      p_email: email,
      p_role: role,
      p_display_name: displayName,
    }),
  );
}

export async function updateMember(siteId: string, userId: string, patch: { role?: Role; active?: boolean; display_name?: string | null }) {
  unwrap(await sb().from("members").update(patch).eq("site_id", siteId).eq("user_id", userId).select("user_id").single());
}

export async function updateSite(siteId: string, patch: { name?: string; timezone?: string }) {
  unwrap(await sb().from("sites").update(patch).eq("id", siteId).select("id").single());
}

// ------------------------------------------------------------------ negocios

const BUSINESS_COLS = "id, site_id, slug, name, accent_color, hours_confirmed, default_dwell_seconds, sort_order, active";

export async function fetchBusinesses(siteId: string): Promise<Business[]> {
  return unwrap(
    await sb().from("businesses").select(BUSINESS_COLS).eq("site_id", siteId).order("sort_order").order("name"),
  ) as Business[];
}

export async function createBusiness(input: Omit<Business, "id" | "hours_confirmed">) {
  unwrap(await sb().from("businesses").insert({ ...input, hours_confirmed: false }).select("id").single());
}

export async function updateBusiness(id: string, patch: Partial<Omit<Business, "id" | "site_id">>) {
  unwrap(await sb().from("businesses").update(patch).eq("id", id).select("id").single());
}

// ------------------------------------------------------------------ horarios

export async function fetchHours(businessIds: string[]): Promise<BusinessHoursRow[]> {
  if (businessIds.length === 0) return [];
  return unwrap(
    await sb().from("business_hours").select("business_id, weekday, is_closed, opens_at, closes_at").in("business_id", businessIds),
  ) as BusinessHoursRow[];
}

/** Reemplaza la semana completa de un negocio (los días "sin registrar" se eliminan). */
export async function saveWeek(businessId: string, rows: Omit<BusinessHoursRow, "business_id">[], unsetWeekdays: number[], confirmed: boolean) {
  if (rows.length > 0) {
    unwrap(
      await sb()
        .from("business_hours")
        .upsert(rows.map((r) => ({ ...r, business_id: businessId })), { onConflict: "business_id,weekday" })
        .select("weekday"),
    );
  }
  if (unsetWeekdays.length > 0) {
    unwrap(await sb().from("business_hours").delete().eq("business_id", businessId).in("weekday", unsetWeekdays).select("weekday"));
  }
  await updateBusiness(businessId, { hours_confirmed: confirmed });
}

// ------------------------------------------------------------------ cámaras

export async function fetchCameras(businessIds: string[]): Promise<CameraOverview[]> {
  if (businessIds.length === 0) return [];
  return unwrap(
    await sb().from("camera_overview").select("*").in("business_id", businessIds).order("sort_order").order("name"),
  ) as CameraOverview[];
}

export type CameraInput = {
  business_id: string;
  name: string;
  model: string;
  location_note: string | null;
  stream_profile: "stream1" | "stream2";
  analysis_enabled: boolean;
  active: boolean;
};

export async function createCamera(input: CameraInput) {
  unwrap(await sb().from("cameras").insert(input).select("id").single());
}

export async function updateCamera(id: string, input: Partial<CameraInput>) {
  unwrap(await sb().from("cameras").update(input).eq("id", id).select("id").single());
}

export async function deleteCamera(id: string) {
  unwrap(await sb().from("cameras").delete().eq("id", id).select("id").single());
}

// ------------------------------------------------------------------ estaciones

const STATION_COLS = "id, business_id, camera_id, name, kind, zone, dwell_threshold_seconds, release_grace_seconds, sort_order, active";

export async function fetchStations(businessIds: string[]): Promise<Station[]> {
  if (businessIds.length === 0) return [];
  return unwrap(
    await sb().from("stations").select(STATION_COLS).in("business_id", businessIds).order("sort_order").order("name"),
  ) as Station[];
}

export type StationInput = Omit<Station, "id" | "zone" | "sort_order">;

export async function createStation(input: StationInput & { sort_order: number }) {
  unwrap(await sb().from("stations").insert(input).select("id").single());
}

export async function updateStation(id: string, input: Partial<StationInput>) {
  unwrap(await sb().from("stations").update(input).eq("id", id).select("id").single());
}

export async function deleteStation(id: string) {
  unwrap(await sb().from("stations").delete().eq("id", id).select("id").single());
}

// ------------------------------------------------------------------ métricas

export type DashboardData = {
  engineNodes: EngineNode[];
  trafficToday: TrafficDaily[];
  trafficHourlyRecent: TrafficHourlyLocal[];
  occupancyToday: StationOccupancyDaily[];
  stationLive: StationLiveState[];
  businessLive: BusinessLiveState[];
  openSecurityByBusiness: Record<string, number>;
};

export async function fetchDashboard(siteId: string, businessIds: string[], todayISO: string, sinceISO: string): Promise<DashboardData> {
  if (businessIds.length === 0) {
    return { engineNodes: [], trafficToday: [], trafficHourlyRecent: [], occupancyToday: [], stationLive: [], businessLive: [], openSecurityByBusiness: {} };
  }
  const c = sb();
  const [engine, today, hourly, occ, sLive, bLive, security] = await Promise.all([
    c.from("engine_nodes").select("id, site_id, version, started_at, last_heartbeat_at").eq("site_id", siteId),
    c.from("traffic_daily").select("*").in("business_id", businessIds).eq("local_date", todayISO),
    c.from("traffic_hourly_local").select("*").in("business_id", businessIds).gte("local_date", sinceISO).lte("local_date", todayISO),
    c.from("station_occupancy_daily").select("*").in("business_id", businessIds).eq("local_date", todayISO),
    c.from("station_live_state").select("station_id, state, since, updated_at"),
    c.from("business_live_state").select("business_id, people_inside_estimate, updated_at").in("business_id", businessIds),
    c.from("security_events").select("business_id").in("business_id", businessIds).eq("status", "open").limit(1000),
  ]);
  const openRows = (unwrap(security) ?? []) as { business_id: string }[];
  const openSecurityByBusiness: Record<string, number> = {};
  for (const id of businessIds) openSecurityByBusiness[id] = 0;
  for (const r of openRows) openSecurityByBusiness[r.business_id] = (openSecurityByBusiness[r.business_id] ?? 0) + 1;
  return {
    engineNodes: (unwrap(engine) ?? []) as EngineNode[],
    trafficToday: (unwrap(today) ?? []) as TrafficDaily[],
    trafficHourlyRecent: (unwrap(hourly) ?? []) as TrafficHourlyLocal[],
    occupancyToday: (unwrap(occ) ?? []) as StationOccupancyDaily[],
    stationLive: (unwrap(sLive) ?? []) as StationLiveState[],
    businessLive: (unwrap(bLive) ?? []) as BusinessLiveState[],
    openSecurityByBusiness,
  };
}

// ------------------------------------------------------------------ seguridad

const SECURITY_COLS =
  "id, business_id, camera_id, category, kind, severity, source, occurred_at, status, reviewed_by, reviewed_at, review_note";

export async function fetchSecurityEvents(
  businessIds: string[],
  opts: { onlyOpen: boolean; limit?: number },
): Promise<SecurityEvent[]> {
  if (businessIds.length === 0) return [];
  let q = sb().from("security_events").select(SECURITY_COLS).in("business_id", businessIds);
  if (opts.onlyOpen) q = q.eq("status", "open");
  return unwrap(await q.order("occurred_at", { ascending: false }).limit(opts.limit ?? 50)) as SecurityEvent[];
}

export async function reviewSecurityEvent(id: number, status: SecurityStatus, note: string | null) {
  unwrap(await sb().rpc("review_security_event", { p_event: id, p_status: status, p_note: note }));
}

// ------------------------------------------------------------------ geometría (zonas y líneas)

export async function updateStationZone(id: string, zone: [number, number][] | null) {
  unwrap(await sb().from("stations").update({ zone }).eq("id", id).select("id").single());
}

export type CountingLineRow = {
  id: string;
  camera_id: string;
  name: string;
  point_a: [number, number];
  point_b: [number, number];
  entry_side: "left" | "right";
  active: boolean;
};

export async function fetchCountingLines(cameraIds: string[]): Promise<CountingLineRow[]> {
  if (cameraIds.length === 0) return [];
  return unwrap(
    await sb().from("counting_lines").select("id, camera_id, name, point_a, point_b, entry_side, active").in("camera_id", cameraIds).order("name"),
  ) as CountingLineRow[];
}

export async function createCountingLine(input: Omit<CountingLineRow, "id" | "active">) {
  unwrap(await sb().from("counting_lines").insert({ ...input, active: true }).select("id").single());
}

export async function deleteCountingLine(id: string) {
  unwrap(await sb().from("counting_lines").delete().eq("id", id).select("id").single());
}
