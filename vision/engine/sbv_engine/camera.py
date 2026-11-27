"""Procesamiento de una cámara: captura RTSP → detección → seguimiento → conteo/zonas/seguridad."""
from __future__ import annotations

import logging
import os
import time

import cv2

from .aggregate import TrafficAggregator, hour_start
from .counting import LineCounter
from .detector import YoloxPersonDetector
from .geometry import anchor_bottom_center
from .schedule import is_open
from .store import CameraConfig, Store
from .tracking import PersonTracker
from .zones import ZoneTracker

log = logging.getLogger("sbv.camera")


def rtsp_url(cam: CameraConfig) -> str:
    """La URL RTSP (con usuario/contraseña de la «Cuenta de cámara» de Tapo) vive SOLO en
    variables de entorno del servidor: SBV_RTSP_<id de cámara sin guiones>. Nunca en la base."""
    key = "SBV_RTSP_" + cam.id.replace("-", "").upper()
    url = os.environ.get(key)
    if not url:
        raise RuntimeError(f"falta la variable {key} con la URL RTSP de «{cam.name}»")
    return url


class CameraWorker:
    def __init__(self, cam: CameraConfig, store: Store, detector: YoloxPersonDetector, analysis_fps: float = 5.0,
                 source: str | None = None, clock=time.time):
        self.cam, self.store, self.detector = cam, store, detector
        self.analysis_fps = analysis_fps
        self.source = source or rtsp_url(cam)
        self.clock = clock
        self.tracker = PersonTracker(analysis_fps)
        self.counters = [LineCounter(l) for l in cam.lines]
        self.zones = [ZoneTracker(z) for z in cam.zones]
        self.agg = TrafficAggregator(cam.id, cam.business_id)
        self.inside = 0
        self.status = None
        self.last_seen: float | None = None
        self._zone_obs: dict[str, float] = {}
        self._last_zone_ts: float | None = None
        self._frames = 0
        self._fps_t0 = clock()

    def _set_status(self, status: str, error: str | None = None) -> None:
        changed = status != self.status
        fps = None
        if status == "online":
            dt = max(1e-6, self.clock() - self._fps_t0)
            fps = round(self._frames / dt, 2)
        self.store.camera_status(self.cam.id, status, self.last_seen, fps, error, changed)
        if changed and self.status is not None:
            kind = "camera_offline" if status != "online" else "camera_recovered"
            self.store.security(self.cam.business_id, self.cam.id, "camera_alert", kind, self.clock(),
                                severity="warning" if status != "online" else "info", payload={"error": error})
        self.status = status

    def process_frame(self, frame, ts: float) -> None:
        h, w = frame.shape[:2]
        det = self.detector.detect(frame)
        tracks = self.tracker.update(det)
        alive = {tid for tid, _ in tracks}
        anchors = {tid: anchor_bottom_center(tuple(b), w, h) for tid, b in tracks}
        self.agg.observe(ts, len(det.scores))
        for counter in self.counters:
            for tid, p in anchors.items():
                c = counter.update(tid, p, ts)
                if c:
                    self.agg.crossing(ts, c.direction)
                    self.inside += 1 if c.direction == "line_entry" else -1
                    self.inside = max(0, self.inside)
                    self.store.crossing(self.cam.business_id, self.cam.id, c.line_id, c.direction, ts, tid, None)
            counter.forget(alive)
        pts = list(anchors.values())
        for z in self.zones:
            e = z.update(pts, ts)
            if e:
                self.store.zone_event(self.cam.business_id, self.cam.id, e.station_id, e.kind, ts)
        if self._last_zone_ts is not None and 0 < ts - self._last_zone_ts <= 10:
            for z in self.zones:
                self._zone_obs[z.zone.station_id] = self._zone_obs.get(z.zone.station_id, 0.0) + (ts - self._last_zone_ts)
        self._last_zone_ts = ts
        # Vigilancia: presencia fuera del horario comercial (solo con horario confirmado).
        if len(det.scores) and self.cam.hours_confirmed and is_open(self.cam.hours, _dt(ts), self.cam.timezone) is False:
            conf = float(det.scores.max())
            category = "analysis_alert" if conf >= 0.6 else "unconfirmed"
            self.store.security(self.cam.business_id, self.cam.id, category, "after_hours_presence", ts,
                                severity="critical" if category == "analysis_alert" else "warning",
                                payload={"personas": int(len(det.scores)), "confianza_max": round(conf, 2)})

    def flush(self) -> None:
        self.store.traffic(self.agg.drain())
        hour = hour_start(self._last_zone_ts or self.clock())
        for z in self.zones:
            occ, sessions = z.take_occupied_seconds()
            obs = self._zone_obs.pop(z.zone.station_id, 0.0)
            if obs > 0 or occ > 0:
                self.store.occupancy(z.zone.station_id, z.zone.business_id, hour, occ, obs, sessions)
        self.store.people_inside(self.cam.business_id, self.inside)

    def run(self, stop, flush_every: float = 30.0, max_frames: int | None = None) -> None:
        backoff = 2.0
        last_flush = self.clock()
        while not stop():
            cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                self._set_status("offline", "no se pudo abrir el flujo")
                time.sleep(min(60.0, backoff)); backoff *= 2
                continue
            backoff = 2.0
            src_fps = cap.get(cv2.CAP_PROP_FPS) or 15.0
            step = max(1, int(round(src_fps / self.analysis_fps)))
            n = 0
            while not stop():
                ok = cap.grab()
                if not ok:
                    self._set_status("offline", "se perdió el flujo")
                    break
                n += 1
                if n % step:
                    continue
                ok, frame = cap.retrieve()
                if not ok:
                    continue
                ts = self.clock()
                self.last_seen = ts
                self._frames += 1
                self.process_frame(frame, ts)
                if self.status != "online":
                    self._set_status("online")
                if ts - last_flush >= flush_every:
                    self.flush(); self._set_status("online"); last_flush = ts
                    self._frames, self._fps_t0 = 0, ts
                if max_frames and self._frames >= max_frames:
                    break
            cap.release()
            self.flush()
            if max_frames:
                return


def _dt(ts: float):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc)
