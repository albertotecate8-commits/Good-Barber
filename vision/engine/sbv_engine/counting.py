"""Conteo de entradas y salidas con líneas virtuales.

Reglas anti-duplicado:
  * Un cruce solo cuenta si el desplazamiento del punto de apoyo atraviesa el
    SEGMENTO de la línea (no basta con moverse a un lado de la recta).
  * Cada track cuenta como máximo UNA entrada y UNA salida por línea mientras
    siga vivo; idas y vueltas sobre la línea (temblor del detector) no suman.
  * Entre dos cruces del mismo track en la misma línea debe pasar un tiempo
    mínimo (`min_seconds_between`), y el track debe alejarse de la línea
    (`hysteresis`, distancia normalizada) para que un cruce de vuelta cuente.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .geometry import Point, segments_intersect, side_of_line


@dataclass(frozen=True)
class CountingLine:
    id: str
    camera_id: str
    point_a: Point
    point_b: Point
    entry_side: str  # 'left' | 'right' de la recta dirigida A→B = interior del negocio
    business_id: str = ""  # negocio al que cuentan las entradas/salidas (puede no ser el de la cámara)


@dataclass
class Crossing:
    line_id: str
    camera_id: str
    track_id: int
    direction: str  # 'line_entry' | 'line_exit'
    ts: float


@dataclass
class _TrackState:
    last_point: Point
    counted: set[str] = field(default_factory=set)  # direcciones ya contadas
    last_cross_ts: float = -1e9


class LineCounter:
    def __init__(self, line: CountingLine, min_seconds_between: float = 2.0, hysteresis: float = 0.02):
        self.line = line
        self.min_seconds_between = min_seconds_between
        self.hysteresis = hysteresis
        self._tracks: dict[int, _TrackState] = {}

    def _distance_factor(self, p: Point) -> float:
        a, b = self.line.point_a, self.line.point_b
        length = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5 or 1.0
        return abs(side_of_line(a, b, p)) / length

    def update(self, track_id: int, point: Point, ts: float) -> Crossing | None:
        st = self._tracks.get(track_id)
        if st is None:
            self._tracks[track_id] = _TrackState(last_point=point)
            return None
        prev = st.last_point
        st.last_point = point
        if not segments_intersect(prev, point, self.line.point_a, self.line.point_b):
            return None
        if self._distance_factor(point) < self.hysteresis:
            # todavía pegado a la línea: no se decide; se conserva el punto anterior
            st.last_point = prev
            return None
        now_left = side_of_line(self.line.point_a, self.line.point_b, point) > 0
        inside = (now_left and self.line.entry_side == "left") or (not now_left and self.line.entry_side == "right")
        direction = "line_entry" if inside else "line_exit"
        if direction in st.counted or ts - st.last_cross_ts < self.min_seconds_between:
            return None
        st.counted.add(direction)
        st.last_cross_ts = ts
        return Crossing(self.line.id, self.line.camera_id, track_id, direction, ts)

    def forget(self, alive_track_ids: set[int]) -> None:
        for tid in list(self._tracks):
            if tid not in alive_track_ids:
                del self._tracks[tid]
