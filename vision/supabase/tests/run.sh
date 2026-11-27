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
echo "OK: todas las pruebas de base de datos pasaron."
