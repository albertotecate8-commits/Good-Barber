-- Marketing AI Studio — generación directa de imágenes (Cloudflare Workers AI).
--
--   * mkt_ai_usage.units: unidades consumidas por llamada (neuronas de Cloudflare).
--   * mkt_ai_units_today(provider): total del día (UTC) de TODA la app, para
--     detener la generación antes del límite gratuito. Devuelve solo un número
--     agregado (no expone filas de otros negocios).
--
-- Idempotente y sin borrar datos. Reversible con
-- supabase/rollbacks/20261026000000_mkt_image_generation.down.sql

alter table mkt_ai_usage add column if not exists units integer not null default 0;
do $$ begin
  alter table mkt_ai_usage add constraint mkt_ai_usage_units_range check (units between 0 and 100000);
exception when duplicate_object then null; end $$;

create or replace function mkt_ai_units_today(p_provider text)
returns integer
language sql stable security definer set search_path = public
as $$
  select coalesce(sum(units), 0)::integer from mkt_ai_usage
  where provider = p_provider and created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
$$;
revoke execute on function mkt_ai_units_today(text) from anon, public;
grant execute on function mkt_ai_units_today(text) to authenticated;
