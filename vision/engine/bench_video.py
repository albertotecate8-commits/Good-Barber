"""Prueba OFFLINE con un video local: detección + seguimiento + una línea de conteo.

NO escribe en la base de datos. Sirve para medir rendimiento y validar la
cadena completa. Uso:
  python bench_video.py modelo.onnx video.avi [fps_analisis]
"""
import sys
import time

import cv2

from sbv_engine.counting import CountingLine, LineCounter
from sbv_engine.detector import YoloxPersonDetector
from sbv_engine.geometry import anchor_bottom_center
from sbv_engine.tracking import PersonTracker

model, video = sys.argv[1], sys.argv[2]
target_fps = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
cap = cv2.VideoCapture(video)
src_fps = cap.get(cv2.CAP_PROP_FPS) or 10.0
step = max(1, int(round(src_fps / target_fps)))
det = YoloxPersonDetector(model, threads=2)
trk = PersonTracker(src_fps / step)
# Línea vertical a la mitad del cuadro (en este video la gente camina de lado a lado).
line = LineCounter(CountingLine("demo", "demo", (0.5, 0.2), (0.5, 0.95), "left"), min_seconds_between=1.0)
n = analyzed = 0
infer_ms = []
max_people = 0
tracks_seen = set()
crossings = {"line_entry": 0, "line_exit": 0}
t_start = time.time()
while True:
    ok, frame = cap.read()
    if not ok:
        break
    n += 1
    if n % step:
        continue
    analyzed += 1
    h, w = frame.shape[:2]
    t0 = time.perf_counter()
    d = det.detect(frame)
    infer_ms.append((time.perf_counter() - t0) * 1000)
    tracks = trk.update(d)
    max_people = max(max_people, len(d.scores))
    ts = n / src_fps
    for tid, box in tracks:
        tracks_seen.add(tid)
        c = line.update(tid, anchor_bottom_center(tuple(box), w, h), ts)
        if c:
            crossings[c.direction] += 1
    line.forget({t for t, _ in tracks})
wall = time.time() - t_start
infer_ms.sort()
print(f"video: {n} cuadros a {src_fps:.0f} fps ({n/src_fps:.0f} s) · analizados {analyzed} (~{src_fps/step:.1f} fps)")
print(f"inferencia YOLOX-Nano 416: mediana {infer_ms[len(infer_ms)//2]:.1f} ms · p95 {infer_ms[int(len(infer_ms)*0.95)]:.1f} ms")
print(f"máx. personas simultáneas detectadas: {max_people} · tracks distintos: {len(tracks_seen)}")
print(f"cruces de la línea de prueba: entradas {crossings['line_entry']} · salidas {crossings['line_exit']}")
print(f"tiempo total de procesamiento: {wall:.1f} s (≈ {analyzed/wall:.1f} cuadros analizados por segundo)")
