-- Revierte 20261019000000_mkt_harden_grants.sql devolviendo los privilegios
-- por defecto de Supabase a authenticated (no recomendado: RLS sigue
-- protegiendo las filas, pero vuelve a haber privilegios innecesarios).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'mkt\_%' loop
    execute format('grant truncate, references, trigger on %I to authenticated', t);
  end loop;
end $$;
grant insert, update, delete on mkt_admins, mkt_audit_log, mkt_publish_attempts to authenticated;
grant update, delete on mkt_ai_usage to authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\_%'
             and p.prorettype = 'trigger'::regtype loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
alter function mkt_touch_updated_at() reset search_path;
alter function mkt_guard_social_status() reset search_path;
alter function mkt_guard_content_status() reset search_path;
alter function mkt_guard_asset() reset search_path;
alter function mkt_guard_ai_usage() reset search_path;
alter function mkt_storage_business(text) reset search_path;
