"""Lectura de configuración y escritura de resultados en PostgreSQL (esquema vision).

Se conecta con un usuario que hereda del rol `vision_engine` (sin service_role):
solo lee configuración y escribe resultados. Ver vision/docs/BASE-DE-DATOS.md §6.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone

import psycopg

from .aggregate import HourBucket
from .counting import CountingLine
from .schedule import DayHours
from .zones import StationZone


@dataclass
class CameraConfig:
    id: str
    business_id: str
    site_id: str
    name: str
    stream_profile: str
    timezone: str
    hours: list[DayHours]
    hours_confirmed: bool
    lines: list[CountingLine]
    zones: list[StationZone]


def _ts(t: float) -> datetime:
    return datetime.fromtimestamp(t, tz=timezone.utc)


class Store:
    def __init__(self, dsn: str):
        self.conn = psycopg.connect(dsn, autocommit=True)

    def load_cameras(self) -> list[CameraConfig]:
        cur = self.conn.cursor()
        cur.execute("""
            select c.id::text, c.business_id::text, b.site_id::text, c.name, c.stream_profile, s.timezone,
                   b.hours_confirmed, b.default_dwell_seconds
            from vision.cameras c
            join vision.businesses b on b.id = c.business_id
            join vision.sites s on s.id = b.site_id
            where c.active and c.analysis_enabled and b.active
            order by c.sort_order, c.name""")
        cams = []
        for cid, bid, sid, name, profile, tz, confirmed, default_dwell in cur.fetchall():
            cur2 = self.conn.cursor()
            cur2.execute("select weekday, is_closed, opens_at, closes_at from vision.business_hours where business_id = %s::uuid", (bid,))
            hours = [DayHours(*r) for r in cur2.fetchall()]
            cur2.execute("""select id::text, point_a, point_b, entry_side, coalesce(business_id, %s::uuid)::text
                            from vision.counting_lines where camera_id = %s::uuid and active""", (bid, cid))
            lines = [CountingLine(i, cid, tuple(a), tuple(b), side, lb) for i, a, b, side, lb in cur2.fetchall()]
            # Estaciones de CUALQUIER negocio del establecimiento que esta cámara observa.
            cur2.execute("""select s.id::text, s.business_id::text, s.zone,
                                   coalesce(s.dwell_threshold_seconds, b.default_dwell_seconds), s.release_grace_seconds
                            from vision.stations s join vision.businesses b on b.id = s.business_id
                            where s.camera_id = %s::uuid and s.active and s.zone is not null and b.active""", (cid,))
            zones = [StationZone(i, sb, cid, [tuple(p) for p in z], float(d), float(g)) for i, sb, z, d, g in cur2.fetchall()]
            cams.append(CameraConfig(cid, bid, sid, name, profile, tz, hours, confirmed, lines, zones))
        return cams

    # ------------------------------------------------------------ salud y latido
    def heartbeat(self, node_id: str, site_id: str, version: str, started: float, detail: dict) -> None:
        self.conn.execute("""
            insert into vision.engine_nodes (id, site_id, version, started_at, last_heartbeat_at, detail)
            values (%s, %s::uuid, %s, %s, now(), %s)
            on conflict (id) do update set version = excluded.version, started_at = excluded.started_at,
              last_heartbeat_at = now(), detail = excluded.detail""",
            (node_id, site_id, version, _ts(started), json.dumps(detail)))

    def camera_status(self, camera_id: str, status: str, last_seen: float | None, fps: float | None,
                      error: str | None, changed: bool) -> None:
        self.conn.execute("""
            insert into vision.camera_health (camera_id, status, last_seen_at, last_frame_at, last_error, fps, updated_at)
            values (%s::uuid, %s, %s, %s, %s, %s, now())
            on conflict (camera_id) do update set status = excluded.status,
              last_seen_at = coalesce(excluded.last_seen_at, vision.camera_health.last_seen_at),
              last_frame_at = coalesce(excluded.last_frame_at, vision.camera_health.last_frame_at),
              last_error = excluded.last_error, fps = excluded.fps, updated_at = now()""",
            (camera_id, status, _ts(last_seen) if last_seen else None, _ts(last_seen) if last_seen else None,
             (error or None) and error[:500], fps))
        if changed:
            self.conn.execute("insert into vision.camera_status_events (camera_id, status, occurred_at, detail) values (%s::uuid, %s, now(), %s)",
                              (camera_id, status, (error or None) and error[:500]))

    # ------------------------------------------------------------ eventos y métricas
    def crossing(self, business_id: str, camera_id: str, line_id: str, direction: str, ts: float, track: int, conf: float | None) -> None:
        self.conn.execute("""insert into vision.vision_events (business_id, camera_id, event_type, occurred_at, track_ref, line_id, confidence)
                             values (%s::uuid, %s::uuid, %s, %s, %s, %s::uuid, %s)""",
                          (business_id, camera_id, direction, _ts(ts), f"t{track}", line_id, conf))

    def zone_event(self, business_id: str, camera_id: str, station_id: str, kind: str, ts: float) -> None:
        self.conn.execute("""insert into vision.vision_events (business_id, camera_id, event_type, occurred_at, station_id)
                             values (%s::uuid, %s::uuid, %s, %s, %s::uuid)""",
                          (business_id, camera_id, "zone_enter" if kind == "occupied" else "zone_exit", _ts(ts), station_id))
        self.conn.execute("""insert into vision.station_live_state (station_id, state, since, updated_at) values (%s::uuid, %s, %s, now())
                             on conflict (station_id) do update set state = excluded.state, since = excluded.since, updated_at = now()""",
                          (station_id, kind if kind == "occupied" else "free", _ts(ts)))

    def traffic(self, buckets: list[HourBucket]) -> None:
        for b in buckets:
            self.conn.execute("""
                insert into vision.traffic_hourly (camera_id, business_id, hour_start, people_detected_max, entries, exits, visits_estimated, observed_seconds, updated_at)
                values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s, %s, now())
                on conflict (camera_id, business_id, hour_start) do update set
                  people_detected_max = greatest(vision.traffic_hourly.people_detected_max, excluded.people_detected_max),
                  entries = vision.traffic_hourly.entries + excluded.entries,
                  exits = vision.traffic_hourly.exits + excluded.exits,
                  visits_estimated = vision.traffic_hourly.visits_estimated + excluded.visits_estimated,
                  observed_seconds = least(3600, vision.traffic_hourly.observed_seconds + excluded.observed_seconds),
                  updated_at = now()""",
                (b.camera_id, b.business_id, b.hour, b.people_detected_max, b.entries, b.exits, b.visits_estimated, int(round(b.observed_seconds))))

    def occupancy(self, station_id: str, business_id: str, hour: datetime, occupied: float, observed: float, sessions: int) -> None:
        occupied = min(occupied, observed)
        self.conn.execute("""
            insert into vision.station_occupancy_hourly (station_id, business_id, hour_start, occupied_seconds, observed_seconds, sessions, updated_at)
            values (%s::uuid, %s::uuid, %s, %s, %s, %s, now())
            on conflict (station_id, hour_start) do update set
              observed_seconds = least(3600, vision.station_occupancy_hourly.observed_seconds + excluded.observed_seconds),
              occupied_seconds = least(least(3600, vision.station_occupancy_hourly.observed_seconds + excluded.observed_seconds),
                                       vision.station_occupancy_hourly.occupied_seconds + excluded.occupied_seconds),
              sessions = vision.station_occupancy_hourly.sessions + excluded.sessions, updated_at = now()""",
            (station_id, business_id, hour, int(round(occupied)), int(round(observed)), sessions))

    def people_inside(self, business_id: str, estimate: int) -> None:
        self.conn.execute("""insert into vision.business_live_state (business_id, people_inside_estimate, updated_at) values (%s::uuid, %s, now())
                             on conflict (business_id) do update set people_inside_estimate = excluded.people_inside_estimate, updated_at = now()""",
                          (business_id, max(0, estimate)))

    def security(self, business_id: str, camera_id: str | None, category: str, kind: str, ts: float,
                 severity: str = "warning", payload: dict | None = None, dedupe_minutes: int = 15) -> bool:
        """Registra un evento de seguridad salvo que ya exista uno abierto igual reciente."""
        cur = self.conn.execute("""select 1 from vision.security_events where business_id = %s::uuid and kind = %s
                                   and coalesce(camera_id::text, '') = coalesce(%s, '') and status = 'open'
                                   and occurred_at > now() - make_interval(mins => %s) limit 1""",
                                (business_id, kind, camera_id, dedupe_minutes))
        if cur.fetchone():
            return False
        self.conn.execute("""insert into vision.security_events (business_id, camera_id, category, kind, severity, occurred_at, payload)
                             values (%s::uuid, %s::uuid, %s, %s, %s, %s, %s)""",
                          (business_id, camera_id, category, kind, severity, _ts(ts), json.dumps(payload or {})))
        return True
