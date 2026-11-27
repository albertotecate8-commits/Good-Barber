#!/usr/bin/env bash
# Integración motor ↔ base: PostgreSQL LOCAL desechable + migraciones reales +
# usuario con el rol limitado vision_engine + video de prueba. No usa Supabase.
#   Uso: bash tests/integracion_bd.sh <modelo.onnx> <video>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ENGINE="$(cd "$HERE/.." && pwd)"; VISION="$(cd "$ENGINE/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"; export PATH="$PGBIN:$PATH"
TMP="$(mktemp -d)"; PORT=54340; chown -R postgres "$TMP"; R=(runuser -u postgres --)
trap '"${R[@]}" pg_ctl -D "$TMP/d" -m immediate stop >/dev/null 2>&1 || true' EXIT
"${R[@]}" initdb -D "$TMP/d" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${R[@]}" pg_ctl -D "$TMP/d" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
Q=("${R[@]}" psql -h "$TMP" -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${Q[@]}" -f "$VISION/supabase/tests/00_supabase_stub.sql"
for f in "$VISION"/supabase/migrations/*.sql; do "${Q[@]}" -f "$f"; done
"${Q[@]}" <<'SQL'
create role motor_prueba login in role vision_engine;
-- Configuración que haría el propietario desde la app:
update vision.cameras set analysis_enabled = true where name = 'Cámara Good Barber';
insert into vision.counting_lines (camera_id, name, point_a, point_b, entry_side)
select id, 'Puerta GB (prueba)', '[0.5, 0.2]', '[0.5, 0.95]', 'left' from vision.cameras where name = 'Cámara Good Barber';
-- Cobertura compartida: la misma cámara ve también la puerta de Glamour Studio.
insert into vision.counting_lines (camera_id, business_id, name, point_a, point_b, entry_side)
select c.id, b.id, 'Puerta GS (prueba)', '[0.05, 0.4]', '[0.95, 0.4]', 'left'
from vision.cameras c, vision.businesses b where c.name = 'Cámara Good Barber' and b.slug = 'glamour-studio';
insert into vision.stations (business_id, camera_id, name, kind, zone, dwell_threshold_seconds, release_grace_seconds)
select business_id, id, 'Zona de prueba', 'otro', '[[0.0,0.25],[0.45,0.25],[0.45,0.45],[0.0,0.45]]', 5, 3
from vision.cameras where name = 'Cámara Good Barber';
SQL
cd "$ENGINE" && .venv/bin/python - "$1" "$2" "host=$TMP port=$PORT dbname=postgres user=motor_prueba" <<'PY'
import sys, time, cv2
from sbv_engine.store import Store
from sbv_engine.camera import CameraWorker
from sbv_engine.detector import YoloxPersonDetector
model, video, dsn = sys.argv[1:4]
store = Store(dsn)
cams = store.load_cameras()
assert len(cams) == 1 and len(cams[0].lines) == 2 and len(cams[0].zones) == 1, cams
cam = cams[0]
base = time.time()
w = CameraWorker(cam, store, YoloxPersonDetector(model), analysis_fps=5, source=video, clock=lambda: base)
cap = cv2.VideoCapture(video); fps = cap.get(cv2.CAP_PROP_FPS) or 10; step = round(fps / 5); n = 0
w._set_status("online")
while True:
    ok, f = cap.read()
    if not ok: break
    n += 1
    if n % step: continue
    ts = base + n / fps
    w.last_seen = ts; w._frames += 1
    w.process_frame(f, ts)
w.flush()
store.heartbeat("motor-prueba", cam.site_id, "0.1.0", base, {"camaras": {cam.name: "online"}})
print("procesado:", n, "cuadros")
PY
echo "--- Resultados en la base (escritos por motor_prueba, rol vision_engine):"
"${Q[@]}" -A -F' | ' -c "select 'traffic_hourly', b.name, sum(entries), sum(exits), sum(visits_estimated), max(people_detected_max), sum(observed_seconds) from vision.traffic_hourly t join vision.businesses b on b.id = t.business_id group by b.name order by b.name" \
  -c "select 'modelo', model, count(*) from vision.cameras group by model" \
  -c "select 'vision_events', b.name, event_type, count(*) from vision.vision_events e join vision.businesses b on b.id = e.business_id group by b.name, event_type order by 2, 3" \
  -c "select 'ocupacion', sum(occupied_seconds), sum(observed_seconds), sum(sessions) from vision.station_occupancy_hourly" \
  -c "select 'estado_estacion', state from vision.station_live_state" \
  -c "select 'personas_dentro_est', b.name, people_inside_estimate from vision.business_live_state l join vision.businesses b on b.id = l.business_id order by 2" \
  -c "select 'camara', status, fps is not null from vision.camera_health" \
  -c "select 'latido', id, last_heartbeat_at is not null from vision.engine_nodes"
