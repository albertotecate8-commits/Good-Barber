#!/usr/bin/env bash
# Pruebas de la base de datos (migraciones + RLS) contra un PostgreSQL local
# desechable. No toca ningún proyecto de Supabase.
#   Uso: bash supabase/tests/run.sh      (desde vision/)
# Requiere los binarios de PostgreSQL (initdb, pg_ctl, psql).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS="$HERE/../migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown -R postgres "$TMP"
  RUN_AS=(runuser -u postgres --)
fi
cleanup() { "${RUN_AS[@]}" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${RUN_AS[@]}" initdb -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=("${RUN_AS[@]}" psql -h "$TMP" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -f "$HERE/00_supabase_stub.sql"
for f in "$MIGRATIONS"/*.sql; do
  echo "→ migración $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
echo "→ segunda ejecución (idempotencia)"
for f in "$MIGRATIONS"/*.sql; do "${PSQL[@]}" -f "$f"; done
echo "→ pruebas RLS"
"${PSQL[@]}" -f "$HERE/10_rls_tests.sql"

echo "→ respaldo y restauración (solo datos de vision, en una base nueva)"
DUMP=("${RUN_AS[@]}" pg_dump -h "$TMP" -p "$PORT" -U postgres -d postgres)
"${RUN_AS[@]}" createdb -h "$TMP" -p "$PORT" -U postgres restaurada
RPSQL=("${RUN_AS[@]}" psql -h "$TMP" -p "$PORT" -U postgres -d restaurada -v ON_ERROR_STOP=1 -q -X)
"${DUMP[@]}" --schema=vision --data-only --no-owner --no-privileges > "$TMP/vision_datos.sql"
"${DUMP[@]}" --table=auth.users --data-only > "$TMP/auth_users.sql"   # en el proyecto real, Auth ya existe
"${RPSQL[@]}" -f "$HERE/00_supabase_stub.sql"
"${RPSQL[@]}" < "$TMP/auth_users.sql" >/dev/null
for f in "$MIGRATIONS"/*.sql; do
  case "$f" in *_datos_iniciales.sql) continue ;; esac   # nunca antes de restaurar
  "${RPSQL[@]}" -f "$f"
done
"${RPSQL[@]}" < "$TMP/vision_datos.sql" >/dev/null
CONTEO="select string_agg(c.relname || '=' || (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from vision.%I', c.relname), false, true, '')))[1]::text, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'vision' and c.relkind = 'r'"
ORIGINAL=$("${PSQL[@]}" -A -t -c "$CONTEO")
RESTAURADA=$("${RPSQL[@]}" -A -t -c "$CONTEO")
if [ "$ORIGINAL" != "$RESTAURADA" ]; then
  echo "FALLO: la restauración no coincide"; echo "  original:   $ORIGINAL"; echo "  restaurada: $RESTAURADA"; exit 1
fi
echo "  filas por tabla idénticas: $RESTAURADA"
N=$("${RPSQL[@]}" -A -t -c "set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3'; select count(*) from vision.businesses;" | tail -1)
[ "$N" = "2" ] || { echo "FALLO: RLS tras restaurar ($N)"; exit 1; }
if "${RPSQL[@]}" -A -t -c "set role anon; select count(*) from vision.sites;" >/dev/null 2>&1; then
  echo "FALLO: anon accede tras restaurar"; exit 1
fi
echo "  permisos y RLS correctos tras restaurar (viewer ve 2 negocios; anon sin acceso)"

echo "OK: todas las pruebas de base de datos pasaron."
