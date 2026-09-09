-- =========================================================
-- CORRECCIONES DE LA AUDITORÍA — cobro idempotente (protección doble clic)
-- =========================================================
-- Aplicada en producción el 2026-09-09 sobre el proyecto sisgfnykjzovnaxylxyq.
-- Único cambio de base de datos autorizado en esta ronda de correcciones de
-- auditoría (recuperación de contraseña, administración de clientes,
-- teléfono duplicado, semana cerrada, login, migración legacy y doble clic).
--
-- Envuelve exactamente el mismo INSERT que ya hacía el frontend en
-- createServiceRecordsBatch, pero con una comprobación de idempotencia por
-- sale_id: si un reintento (doble clic, red lenta que reintenta) llega con
-- el MISMO sale_id que uno que ya se guardó, se devuelven las filas ya
-- creadas en vez de insertar una segunda vez. Nunca puede generar un cobro
-- duplicado, sin importar cuántas veces se reintente la misma operación.
--
-- SECURITY INVOKER a propósito (no DEFINER): esta función NO debe saltarse
-- RLS. Corre con los privilegios de quien la llama, así que sigue exigiendo
-- exactamente la misma política service_records_insert que ya existía
-- (is_admin() o barber_id = current_barber_id()). Cero cambios de RLS.
create or replace function public.create_service_records_batch(
  p_barber_id uuid,
  p_client_id uuid,
  p_sale_id uuid,
  p_items jsonb
)
returns setof public.service_records
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay servicios que registrar.';
  end if;

  -- Idempotencia: un sale_id que ya existe significa que esta operación
  -- exacta ya se guardó antes (reintento/doble clic) — se devuelve lo que
  -- ya hay, sin insertar de nuevo.
  if exists (select 1 from public.service_records where sale_id = p_sale_id) then
    return query
      select * from public.service_records where sale_id = p_sale_id order by created_at;
    return;
  end if;

  return query
  insert into public.service_records (
    barber_id, client_id, service_id, service_name, price_cents,
    quantity, discount_cents, notes, created_by, sale_id
  )
  select
    p_barber_id,
    p_client_id,
    (item->>'service_id')::uuid,
    item->>'service_name',
    (item->>'price_cents')::integer,
    coalesce((item->>'quantity')::integer, 1),
    coalesce((item->>'discount_cents')::integer, 0),
    nullif(item->>'notes', ''),
    auth.uid(),
    p_sale_id
  from jsonb_array_elements(p_items) as item
  returning *;
end;
$$;

revoke all on function public.create_service_records_batch(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_service_records_batch(uuid, uuid, uuid, jsonb) to authenticated;
