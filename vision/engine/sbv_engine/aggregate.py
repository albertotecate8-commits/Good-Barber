"""Acumulación de métricas por cámara y por hora (UTC), lista para upsert."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


def hour_start(ts: float) -> datetime:
    d = datetime.fromtimestamp(ts, tz=timezone.utc)
    return d.replace(minute=0, second=0, microsecond=0)


@dataclass
class HourBucket:
    camera_id: str
    business_id: str
    hour: datetime
    people_detected_max: int = 0
    entries: int = 0
    exits: int = 0
    observed_seconds: float = 0.0

    @property
    def visits_estimated(self) -> int:
        # Estimación conservadora: cada entrada cuenta como una visita. No es un
        # cliente confirmado ni una venta.
        return self.entries


@dataclass
class TrafficAggregator:
    camera_id: str
    business_id: str
    buckets: dict[datetime, HourBucket] = field(default_factory=dict)
    _last_ts: float | None = None

    def _bucket(self, ts: float) -> HourBucket:
        h = hour_start(ts)
        if h not in self.buckets:
            self.buckets[h] = HourBucket(self.camera_id, self.business_id, h)
        return self.buckets[h]

    def observe(self, ts: float, people_in_frame: int, max_gap: float = 10.0) -> None:
        """Registra un cuadro analizado. Los huecos > max_gap (cámara caída) NO cuentan como observados."""
        b = self._bucket(ts)
        if self._last_ts is not None and 0 < ts - self._last_ts <= max_gap:
            if hour_start(self._last_ts) == b.hour:
                b.observed_seconds = min(3600.0, b.observed_seconds + (ts - self._last_ts))
        self._last_ts = ts
        b.people_detected_max = max(b.people_detected_max, people_in_frame)

    def crossing(self, ts: float, direction: str) -> None:
        b = self._bucket(ts)
        if direction == "line_entry":
            b.entries += 1
        else:
            b.exits += 1

    _flushed: dict[datetime, tuple[int, int, float]] = field(default_factory=dict)

    def drain(self) -> list[HourBucket]:
        """Devuelve INCREMENTOS desde la última escritura (seguro ante reinicios:
        la base suma entradas/salidas/segundos y toma el máximo de personas)."""
        out: list[HourBucket] = []
        for h, b in self.buckets.items():
            fe, fx, fo = self._flushed.get(h, (0, 0, 0.0))
            delta = HourBucket(b.camera_id, b.business_id, h, b.people_detected_max,
                               b.entries - fe, b.exits - fx, b.observed_seconds - fo)
            if delta.entries or delta.exits or delta.observed_seconds > 0 or delta.people_detected_max:
                out.append(delta)
            self._flushed[h] = (b.entries, b.exits, b.observed_seconds)
        if self._last_ts is not None:
            current = hour_start(self._last_ts)
            self.buckets = {h: b for h, b in self.buckets.items() if h == current}
            self._flushed = {h: v for h, v in self._flushed.items() if h == current}
        return out
