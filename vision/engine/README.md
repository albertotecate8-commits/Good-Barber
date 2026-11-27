# Motor de visión de Smart Business Vision

Python · YOLOX-Nano (Apache-2.0, solo clase «persona») · ByteTrack
(`supervision`, MIT) · ONNX Runtime (MIT) · OpenCV (Apache-2.0).

Cámaras: dos Tapo C110 (RTSP `stream2`, puerto 554; ONVIF nunca expuesto).
Sin reconocimiento facial, sin identificar personas y sin guardar video ni
imágenes. Escribe solo métricas y eventos en el esquema `vision`, con un
usuario que hereda del rol limitado `vision_engine` (nunca `service_role`).

## Qué hace (por cámara)
- Lee el flujo RTSP (`stream2`), con reconexión automática y registro de
  desconexiones.
- Detecta personas → seguimiento temporal (ids efímeros) → **cruces de líneas
  virtuales** (entradas y salidas, sin duplicados) → personas dentro
  (estimado) → **ocupación por zonas** con permanencia mínima.
- **Vigilancia**: presencia fuera del horario confirmado del negocio →
  `security_events` (alerta de análisis o «sin confirmar», según la confianza).
- Métricas por hora como **incrementos** (seguro ante reinicios) y latido
  cada 60 s.

## Pruebas
```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt pytest
.venv/bin/python -m pytest -q tests            # lógica (sin modelo)
bash tests/integracion_bd.sh yolox_nano.onnx video.avi   # motor ↔ PostgreSQL local con el rol limitado
.venv/bin/python bench_video.py yolox_nano.onnx video.avi 5  # rendimiento
```

Modelo: `yolox_nano.onnx` de la versión oficial 0.1.1rc0 de
Megvii-BaseDetection/YOLOX (Apache-2.0); no se versiona en el repositorio.

## Ejecutar (servidor de procesamiento)
```bash
export SBV_DB_URL='postgresql://<usuario_motor>.<ref>:<contraseña>@<pooler>:5432/postgres?sslmode=require'
export SBV_MODEL=/opt/sbv/yolox_nano.onnx
export SBV_RTSP_<IDCAMARA>='rtsp://<usuario>:<contraseña>@<host>:554/stream2'
export SBV_NODE_ID=motor-1 SBV_FPS=5
.venv/bin/python -m sbv_engine
```
Las credenciales viven solo en variables de entorno del servidor.
