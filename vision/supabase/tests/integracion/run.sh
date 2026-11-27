#!/usr/bin/env bash
# =====================================================================
# Prueba de NO INTERFERENCIA: Good Barber (public) + Smart Business Vision (vision)
# =====================================================================
# Todo ocurre en un PostgreSQL LOCAL y desechable. No toca Supabase.
# Lee (sin modificar) supabase/schema.sql y supabase/migrations/*.sql de la
# app de Good Barber y comprueba que aplicar el esquema `vision`:
#   1. no cambia el esquema ni los datos de `public`;
#   2. no cambia lo que anon / barbero / admin de Good Barber pueden ver;
#   3. se revierte por completo con DROP SCHEMA vision CASCADE;
#   4. no rompe el borrado de cuentas de Auth;
#   5. se puede respaldar y restaurar.
# Y documenta los efectos cruzados que SÍ existen.
#   Uso (desde vision/):  bash supabase/tests/integracion/run.sh
# =====================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VISION="$(cd "$HERE/../../.." && pwd)"
REPO="$(cd "$VISION/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
export PATH="$PGBIN:$PATH"
export PGOPTIONS="-c client_min_messages=warning"
TMP="$(mktemp -d)"
OUT="${OUT_DIR:-$TMP/evidencia}"
mkdir -p "$OUT"
PORT=54331
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP"; RUN_AS=(runuser -u postgres --); fi
cleanup() { "${RUN_AS[@]}" pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; [ -z "${OUT_DIR:-}" ] && rm -rf "$TMP" || rm -rf "$TMP/data"; }
trap cleanup EXIT
"${RUN_AS[@]}" initdb -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
"${RUN_AS[@]}" createdb -h "$TMP" -p "$PORT" -U postgres gb
"${RUN_AS[@]}" createdb -h "$TMP" -p "$PORT" -U postgres restaurada
Q()  { "${RUN_AS[@]}" psql -h "$TMP" -p "$PORT" -U postgres -d "${DB:-gb}" -X -q -v ON_ERROR_STOP=1 "$@"; }
QT() { Q -A -t "$@"; }
DUMP() { "${RUN_AS[@]}" pg_dump -h "$TMP" -p "$PORT" -U postgres "$@"; }
ok() { echo "  ✔ $*"; }
fail() { echo "  ✘ $*"; exit 1; }

snapshot() { # $1 = etiqueta
  # Se quita la línea \restrict/\unrestrict: es un token aleatorio de pg_dump en cada ejecución.
  DUMP -d gb --schema=public --no-owner | grep -v '^\\\(un\)\?restrict ' > "$OUT/$1.public.sql"
  DUMP -d gb --schema=auth --schema=storage --no-owner | grep -v '^\\\(un\)\?restrict ' > "$OUT/$1.auth_storage.sql"
  Q -f "$HERE/21_ejecutar_sonda.sql" > "$OUT/$1.sonda.txt"
  QT -c "select tgname || ' interno=' || tgisinternal from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1" > "$OUT/$1.triggers_auth_users.txt"
  QT -c "select conrelid::regclass || ' -> ' || conname from pg_constraint where confrelid = 'auth.users'::regclass order by 1" > "$OUT/$1.fk_hacia_auth_users.txt"
  QT -c "select count(*) from pg_trigger where tgrelid = 'auth.users'::regclass and tgisinternal" > "$OUT/$1.triggers_internos_auth_users.txt"
}
same() { # $1 $2 = etiquetas, $3 = sufijo
  if diff -u "$OUT/$1.$3" "$OUT/$2.$3" > "$OUT/diff_$1_$2.$3.diff"; then ok "$3 idéntico ($1 = $2)"; return 0; else echo "  ≠ $3 cambia ($1 → $2), ver $OUT/diff_$1_$2.$3.diff"; return 1; fi
}

echo "1) Good Barber tal como está en el repo"
Q -f "$HERE/00_stub_supabase_completo.sql"
Q -f "$REPO/supabase/schema.sql"
for f in "$REPO"/supabase/migrations/*.sql; do Q -f "$f"; done
Q -f "$HERE/10_semilla_good_barber.sql"
Q -f "$HERE/20_sonda.sql"
snapshot A
ok "esquema de Good Barber + $(ls "$REPO"/supabase/migrations/*.sql | wc -l) migraciones cargadas"

echo "2) Aplicar las migraciones de vision"
for f in "$VISION"/supabase/migrations/*.sql; do Q -f "$f"; done
snapshot B
same A B public.sql || fail "vision modificó el esquema o los datos de public"
same A B sonda.txt || fail "vision cambió lo que ven anon/barbero/admin en public"
same A B auth_storage.sql || fail "vision modificó auth/storage"
same A B triggers_auth_users.txt || fail "vision añadió triggers de usuario en auth.users"
echo "  ℹ FK hacia auth.users antes: $(wc -l < "$OUT/A.fk_hacia_auth_users.txt"), después: $(wc -l < "$OUT/B.fk_hacia_auth_users.txt") (triggers internos RI: $(cat "$OUT/A.triggers_internos_auth_users.txt") → $(cat "$OUT/B.triggers_internos_auth_users.txt"))"

echo "3) Usar vision con la cuenta EXISTENTE del administrador (sin crear cuentas)"
QT -c "select vision.bootstrap_owner('admin@gb.test', 'Propietario')" >/dev/null
snapshot C
same A C public.sql || fail "dar acceso en vision cambió public"
same A C sonda.txt || fail "dar acceso en vision cambió la visibilidad en public"
N=$(QT -c "set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002'; select count(*) from vision.businesses;" | tail -1)
[ "$N" = "0" ] && ok "el barbero de Good Barber ve 0 negocios en vision" || fail "el barbero ve vision ($N)"
N=$(QT -c "set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001'; select count(*) from vision.businesses;" | tail -1)
[ "$N" = "2" ] && ok "el propietario ve los 2 negocios en vision" || fail "el propietario no ve vision ($N)"
N=$(QT -c "set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001'; select count(*) from public.clients;" | tail -1)
ok "el admin de Good Barber sigue viendo sus clientes ($N) después de entrar a vision"

echo "4) Borrar una cuenta de Auth que es propietaria de vision"
if QT -c "begin; delete from auth.users where email = 'admin@gb.test'; rollback;" >/dev/null 2>"$OUT/borrado_auth.err"; then
  ok "Supabase Auth puede borrar la cuenta (la membresía se elimina en cascada)"
else
  echo "  ✘ borrar la cuenta en Auth FALLA: $(tr '\n' ' ' < "$OUT/borrado_auth.err")"; exit 1
fi

echo "5) Reversión total: DROP SCHEMA vision CASCADE"
QT -c "drop schema vision cascade" >/dev/null
snapshot D
same A D public.sql || fail "la reversión dejó cambios en public"
same A D sonda.txt || fail "la reversión dejó cambios de visibilidad"
same A D fk_hacia_auth_users.txt || fail "quedaron FK hacia auth.users"
same A D triggers_internos_auth_users.txt || fail "quedaron triggers internos"

echo "6) Respaldo y recuperación"
for f in "$VISION"/supabase/migrations/*.sql; do Q -f "$f"; done
QT -c "select vision.bootstrap_owner('admin@gb.test', 'Propietario')" >/dev/null
QT -c "insert into vision.stations (business_id, name, kind) select id, 'Silla de prueba', 'silla' from vision.businesses where slug = 'good-barber'" >/dev/null
# (a) el workflow actual: --schema=public
DUMP -d gb --schema=public --no-owner --no-privileges > "$OUT/respaldo_actual.sql"
grep -q "vision\." "$OUT/respaldo_actual.sql" && fail "el respaldo actual incluye vision (inesperado)" || ok "el respaldo actual (--schema=public) NO incluye vision: hoy no se respaldaría"
# (b) respaldo propuesto: solo datos de vision
DUMP -d gb --schema=vision --data-only --no-owner --no-privileges > "$OUT/respaldo_vision_datos.sql"
# Recuperación en un proyecto nuevo: auth existe (mismos usuarios), se aplica la
# migración BASE (sin datos iniciales) y luego los datos del respaldo.
DB=restaurada Q -f "$HERE/00_stub_supabase_completo.sql"
DUMP -d gb --table=auth.users --data-only > "$OUT/auth_users_para_prueba.sql"
DB=restaurada Q < "$OUT/auth_users_para_prueba.sql" >/dev/null
DB=restaurada Q -f "$(ls "$VISION"/supabase/migrations/*_base.sql)"
DB=restaurada Q < "$OUT/respaldo_vision_datos.sql" >/dev/null
R=$(DB=restaurada QT -c "select (select count(*) from vision.businesses)||'/'||(select count(*) from vision.stations)||'/'||(select count(*) from vision.members)||'/'||(select count(*) from vision.business_hours)")
O=$(QT -c "select (select count(*) from vision.businesses)||'/'||(select count(*) from vision.stations)||'/'||(select count(*) from vision.members)||'/'||(select count(*) from vision.business_hours)")
[ "$R" = "$O" ] && ok "restauración: negocios/estaciones/miembros/horarios = $R (igual al original)" || fail "restauración incompleta: $R vs $O"
N=$(DB=restaurada QT -c "set role authenticated; set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001'; select count(*) from vision.stations;" | tail -1)
[ "$N" = "1" ] && ok "tras restaurar, RLS y permisos funcionan (el propietario ve su estación)" || fail "RLS tras restaurar ($N)"
N=$(DB=restaurada QT -c "set role anon; select count(*) from vision.sites;" 2>/dev/null | tail -1 || true)
[ -z "$N" ] && ok "tras restaurar, anon sigue sin acceso" || fail "anon accede tras restaurar"

echo "7) Efecto cruzado conocido: crear una cuenta NUEVA solo para vision en el proyecto de Good Barber"
QT -c "insert into auth.users (id, email) values ('dddddddd-0000-4000-8000-000000000009', 'solo-vision@test.local')" >/dev/null
P=$(QT -c "select role || ' activo=' || active from public.profiles where id = 'dddddddd-0000-4000-8000-000000000009'")
echo "  ⚠ el trigger on_auth_user_created de Good Barber le creó un perfil: $P"
Q -c "\pset format unaligned" -c "\pset tuples_only on" -c "set role authenticated" \
  -c "set request.jwt.claim.sub = 'dddddddd-0000-4000-8000-000000000009'" \
  -c "select '    ve en public: ' || string_agg(objeto || '=' || filas, ', ') from zz_sonda.conteos() where filas <> '0' and filas not like 'ERROR%'" | tail -1
echo
echo "RESULTADO: aplicar, usar y revertir vision no modifica public, auth ni storage de Good Barber."
echo "Evidencia en: $OUT"
