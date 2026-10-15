-- Huella del esquema de Marketing AI Studio (solo objetos mkt_*).
-- Se ejecuta igual en el stack local y en el proyecto Supabase real para
-- confirmar que ambos tienen exactamente las mismas tablas, columnas,
-- restricciones, políticas, triggers y funciones. Solo lectura.
with cols as (
  select table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '') as k
  from information_schema.columns where table_schema = 'public' and table_name like 'mkt\_%'
), cons as (
  select conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid) as k
  from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text like 'mkt\_%'
), pols as (
  select schemaname || '.' || tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' ||
         coalesce(qual, '') || ':' || coalesce(with_check, '') as k
  from pg_policies where (schemaname = 'public' and tablename like 'mkt\_%') or policyname like 'mkt\_%'
), trgs as (
  select tgrelid::regclass::text || '.' || tgname || ':' || regexp_replace(pg_get_triggerdef(oid), '^CREATE (OR REPLACE )?', '') as k
  from pg_trigger where not tgisinternal and tgname like 'mkt\_%'
), fns as (
  select proname || '(' || pg_get_function_identity_arguments(oid) || '):' || md5(prosrc) || ':' || prosecdef as k
  from pg_proc where pronamespace = 'public'::regnamespace and proname like 'mkt\_%'
), grants as (
  select table_name || ':' || grantee || ':' || privilege_type as k
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name like 'mkt\_%' and grantee in ('anon', 'authenticated')
), rls as (
  select relname || ':' || relrowsecurity as k from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'mkt\_%'
), fnacl as (
  select p.proname || ':' || coalesce(string_agg(a.grantee::regrole::text || '=' || a.privilege_type, ',' order by a.grantee::regrole::text), '') as k
  from pg_proc p left join lateral aclexplode(p.proacl) a on a.grantee = 0 or a.grantee in (
    select oid from pg_roles where rolname in ('anon', 'authenticated'))
  where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\_%' group by p.proname
), storage as (
  select 'bucket:' || id || ':' || public || ':' || coalesce(file_size_limit::text, '') || ':' ||
         array_to_string(array(select unnest(allowed_mime_types) order by 1), ',') as k
  from storage.buckets where id = 'mkt-assets'
), enums as (
  select t.typname || ':' || string_agg(e.enumlabel, ',' order by e.enumsortorder) as k
  from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname like 'mkt\_%' group by t.typname
)
select 'columns' as part, count(*) as n, md5(string_agg(k, '|' order by k)) as hash from cols
union all select 'constraints', count(*), md5(string_agg(k, '|' order by k)) from cons
union all select 'policies', count(*), md5(string_agg(k, '|' order by k)) from pols
union all select 'triggers', count(*), md5(string_agg(k, '|' order by k)) from trgs
union all select 'functions', count(*), md5(string_agg(k, '|' order by k)) from fns
union all select 'grants', count(*), md5(string_agg(k, '|' order by k)) from grants
union all select 'rls', count(*), md5(string_agg(k, '|' order by k)) from rls
union all select 'function_acl', count(*), md5(string_agg(k, '|' order by k)) from fnacl
union all select 'storage_bucket', count(*), md5(string_agg(k, '|' order by k)) from storage
union all select 'enums', count(*), md5(string_agg(k, '|' order by k)) from enums
order by part;
