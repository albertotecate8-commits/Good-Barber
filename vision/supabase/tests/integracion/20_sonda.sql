-- Sonda: cuántas filas ve cada rol en cada tabla/vista de `public`.
-- Vive en un esquema aparte (zz_sonda) para no alterar `public`.
create schema if not exists zz_sonda;
create or replace function zz_sonda.conteos()
returns table (objeto text, filas text)
language plpgsql
security invoker
as $$
declare r record; n bigint;
begin
  for r in
    select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname
  loop
    begin
      execute format('select count(*) from public.%I', r.relname) into n;
      objeto := r.relname; filas := n::text;
    exception when others then
      objeto := r.relname; filas := 'ERROR ' || sqlstate;
    end;
    return next;
  end loop;
end;
$$;
grant usage on schema zz_sonda to anon, authenticated, service_role;
grant execute on function zz_sonda.conteos() to anon, authenticated, service_role;
