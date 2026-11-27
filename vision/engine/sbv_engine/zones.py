"""Ocupación de estaciones por zonas poligonales con permanencia mínima.

Una estación pasa a OCUPADA cuando al menos un punto de apoyo permanece dentro
de su zona `dwell_seconds` seguidos; vuelve a LIBRE cuando lleva
`release_grace_seconds` sin nadie dentro. Ocupada ≠ servicio ≠ cobro.
"""
from __future__ import annotations

from dataclasses import dataclass

from .geometry import Point, point_in_polygon


@dataclass(frozen=True)
class StationZone:
    station_id: str
    business_id: str
    camera_id: str
    polygon: list[Point]
    dwell_seconds: float
    release_grace_seconds: float


@dataclass
class StationEvent:
    station_id: str
    kind: str  # 'occupied' | 'free'
    ts: float


class ZoneTracker:
    def __init__(self, zone: StationZone):
        self.zone = zone
        self.state = "free"
        self.since: float | None = None
        self._present_since: float | None = None
        self._absent_since: float | None = None
        self.occupied_seconds = 0.0
        self.sessions = 0
        self._last_ts: float | None = None

    def update(self, points: list[Point], ts: float) -> StationEvent | None:
        if self._last_ts is not None and self.state == "occupied":
            self.occupied_seconds += max(0.0, ts - self._last_ts)
        self._last_ts = ts
        present = any(point_in_polygon(p, self.zone.polygon) for p in points)
        if present:
            self._absent_since = None
            if self._present_since is None:
                self._present_since = ts
            if self.state == "free" and ts - self._present_since >= self.zone.dwell_seconds:
                self.state, self.since = "occupied", self._present_since
                self.sessions += 1
                # el tiempo de permanencia previo a la confirmación también cuenta
                self.occupied_seconds += ts - self._present_since
                return StationEvent(self.zone.station_id, "occupied", ts)
        else:
            self._present_since = None
            if self.state == "occupied":
                if self._absent_since is None:
                    self._absent_since = ts
                if ts - self._absent_since >= self.zone.release_grace_seconds:
                    self.state, self.since = "free", ts
                    return StationEvent(self.zone.station_id, "free", ts)
        return None

    def take_occupied_seconds(self) -> tuple[float, int]:
        """Devuelve y reinicia los segundos ocupados y sesiones acumulados (para la hora en curso)."""
        s, n = self.occupied_seconds, self.sessions
        self.occupied_seconds, self.sessions = 0.0, 0
        return s, n
