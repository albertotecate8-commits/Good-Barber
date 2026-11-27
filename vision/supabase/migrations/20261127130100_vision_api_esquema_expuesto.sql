-- =====================================================================
-- SMART BUSINESS VISION AI — EXPONER EL ESQUEMA `vision` EN LA DATA API
-- Migración: 20261127130100_vision_api_esquema_expuesto.sql
-- =====================================================================
-- Equivale a agregar `vision` en Project Settings → Data API → Exposed
-- schemas, usando la configuración en base de datos de PostgREST
-- (rol `authenticator`, parámetro pgrst.db_schemas). Exponer el esquema NO
-- da acceso a nadie: `anon` no tiene USAGE sobre `vision` y todo lo demás lo
-- deciden los GRANT y las políticas RLS de las migraciones anteriores.
--
-- Si alguien cambia la lista de esquemas en el panel de Supabase, revisar
-- que `vision` siga presente (o volver a ejecutar esta migración).
-- Idempotente. En bases sin el rol `authenticator` (pruebas locales) no hace nada.
-- =====================================================================

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute $q$alter role authenticator set pgrst.db_schemas = 'public, graphql_public, vision'$q$;
    perform pg_notify('pgrst', 'reload config');
    perform pg_notify('pgrst', 'reload schema');
  end if;
end;
$$;
