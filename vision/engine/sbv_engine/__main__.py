"""python -m sbv_engine  — ejecuta el motor para todas las cámaras con análisis activado.

Variables de entorno (solo en el servidor de procesamiento):
  SBV_DB_URL           cadena PostgreSQL del usuario limitado (hereda de vision_engine)
  SBV_MODEL            ruta al modelo yolox_nano.onnx
  SBV_RTSP_<CAMARA>    URL RTSP de cada cámara (cuenta de cámara de Tapo)
  SBV_NODE_ID          nombre del nodo (p. ej. oracle-1)
  SBV_FPS              cuadros analizados por segundo por cámara (defecto 5)
"""
import logging
import os
import signal
import threading
import time

from . import __version__
from .camera import CameraWorker
from .detector import YoloxPersonDetector
from .store import Store


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    dsn = os.environ["SBV_DB_URL"]
    if "service_role" in dsn:
        raise SystemExit("El motor nunca debe usar la service_role.")
    store = Store(dsn)
    cams = store.load_cameras()
    if not cams:
        raise SystemExit("No hay cámaras con análisis activado.")
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    signal.signal(signal.SIGINT, lambda *_: stopping.set())
    fps = float(os.environ.get("SBV_FPS", "5"))
    model = os.environ["SBV_MODEL"]
    started = time.time()
    workers = []
    for cam in cams:
        w = CameraWorker(cam, Store(dsn), YoloxPersonDetector(model, threads=1), analysis_fps=fps)
        t = threading.Thread(target=w.run, args=(stopping.is_set,), name=cam.name, daemon=True)
        t.start(); workers.append((w, t))
    node = os.environ.get("SBV_NODE_ID", "motor-1")
    while not stopping.is_set():
        store.heartbeat(node, cams[0].site_id, __version__, started,
                        {"camaras": {w.cam.name: w.status for w, _ in workers}})
        stopping.wait(60)


if __name__ == "__main__":
    main()
