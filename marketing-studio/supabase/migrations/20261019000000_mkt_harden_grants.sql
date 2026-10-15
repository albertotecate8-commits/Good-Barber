-- Marketing AI Studio — endurecimiento de privilegios.
--
-- Encontrado al aplicar las migraciones en un proyecto Supabase real: Supabase
-- concede por defecto TODOS los privilegios de cada tabla y función nueva de
-- `public` a anon y authenticated. RLS ya bloqueaba las filas, pero quedaban
-- privilegios que la app no necesita (TRUNCATE, REFERENCES, TRIGGER y escritura
-- directa en tablas que solo escribe el servidor o un trigger). Esta migración
-- deja exactamente los privilegios que la app usa.
--
-- Idempotente. Reversible con supabase/rollbacks/20261019000000_mkt_harden_grants.down.sql

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'mkt\_%' loop
    execute format('revoke truncate, references, trigger on %I from anon, authenticated', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

-- Tablas que el navegador solo lee: las escriben triggers, el servidor o el SQL Editor.
revoke insert, update, delete on mkt_admins, mkt_audit_log, mkt_publish_attempts from authenticated;
-- El uso de IA se registra pero no se edita ni se borra.
revoke update, delete on mkt_ai_usage from authenticated;

-- Funciones: anon no ejecuta nada de Marketing AI Studio. Las funciones de
-- trigger no se pueden invocar directamente, pero se retira el permiso igual.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\_%' loop
    execute format('revoke execute on function %s from anon, public', f);
  end loop;
end $$;
grant execute on function mkt_is_admin(), mkt_can_read(uuid), mkt_can_write(uuid), mkt_is_owner(uuid),
  mkt_storage_upload_allowed(text), mkt_storage_business(text) to authenticated;

-- Las funciones de trigger no se invocan por la API: nadie necesita EXECUTE
-- sobre ellas (PostgreSQL solo lo exige al crear el trigger, no al dispararlo).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\_%'
             and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from authenticated', f);
  end loop;
end $$;

-- search_path fijo en las funciones que no lo tenían (aviso 0011 de Supabase).
alter function mkt_touch_updated_at() set search_path = public;
alter function mkt_guard_social_status() set search_path = public;
alter function mkt_guard_content_status() set search_path = public;
alter function mkt_guard_asset() set search_path = public;
alter function mkt_guard_ai_usage() set search_path = public;
alter function mkt_storage_business(text) set search_path = public;
