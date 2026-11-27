"""Seguimiento temporal con ByteTrack (implementación de `supervision`, MIT).

Los track_id son efímeros: se pierden cuando la persona sale de cuadro y no
identifican a nadie de forma permanente.
"""
from __future__ import annotations

import numpy as np
import supervision as sv

from .detector import Detections


class PersonTracker:
    def __init__(self, fps: float):
        self._bt = sv.ByteTrack(frame_rate=max(1, int(round(fps))), lost_track_buffer=max(10, int(fps * 3)),
                                minimum_matching_threshold=0.8, track_activation_threshold=0.35)

    def update(self, det: Detections) -> list[tuple[int, np.ndarray]]:
        d = sv.Detections(xyxy=det.boxes, confidence=det.scores, class_id=np.zeros(len(det.scores), dtype=int))
        tracked = self._bt.update_with_detections(d)
        if tracked.tracker_id is None:
            return []
        return [(int(t), b) for t, b in zip(tracked.tracker_id, tracked.xyxy)]
