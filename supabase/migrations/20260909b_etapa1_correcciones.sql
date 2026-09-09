-- =========================================================
-- GOOD BARBER — CORRECCIONES POSTERIORES A LA ETAPA 1
-- =========================================================
-- Aplicada en producción el 2026-09-09 sobre el proyecto sisgfnykjzovnaxylxyq,
-- como dos cambios autorizados por separado tras el reporte de la Etapa 1:
--
--   1. La normalización de teléfono no reconocía "526641234567" y
--      "6641234567" como el mismo número (solo limpiaba formato, no la lada
--      de país). Se corrige para que un mismo número mexicano sea un solo
--      cliente sin importar si viene con "+52", "52", con o sin espacios,
--      paréntesis o guiones.
--
--   2. Se revoca EXECUTE de anon (y de PUBLIC, del que anon lo heredaba) en
--      close_weekly_settlement y en las 8 funciones que solo existen para
--      disparar triggers. Es defensa en profundidad: Postgres ya impedía
--      llamarlas directamente ("trigger functions can only be called as
--      triggers") y close_weekly_settlement ya validaba is_admin() por
--      dentro, así que no había ningún hueco real que cerrar.
--
-- Verificado antes de tocar nada: la tabla clients tenía 0 filas reales en el
-- proyecto en el momento de esta migración, así que no había ningún cliente
-- real que pudiera colisionar bajo la regla nueva. No se modifica ninguna
-- venta, precio, porcentaje ni cita existente.
-- =========================================================

-- =========================================================
-- 1. NORMALIZACIÓN DE TELÉFONO MEXICANO
-- =========================================================

-- Reglas (solo las que se pidieron explícitamente, sin adivinar formatos que
-- no se pidieron):
--   * 10 dígitos                    -> tal cual (ya es el número nacional).
--   * 12 dígitos empezando en "52"  -> se quita la lada de país.
--   * 13 dígitos empezando en "521" -> se quita el viejo prefijo de móvil
--     mexicano "52"+"1" (todavía aparece en datos históricos de WhatsApp).
--   * cualquier otro caso (números extranjeros, etc.) -> los dígitos tal
--     cual, igual que hacía la función anterior.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 10
      then regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 12
      and left(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 2) = '52'
      then right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)
    when length(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')) = 13
      and left(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 3) = '521'
      then right(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 10)
    else nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
  end
$$;

-- phone_normalized es GENERATED ALWAYS ... STORED: reemplazar la función no
-- recalcula las filas existentes. Hay que soltar la columna (lo que suelta
-- también el índice único que depende de ella) y volver a crearla para que
-- los teléfonos ya guardados también se normalicen con la regla nueva.
--
-- ANTES de ejecutar esto en cualquier proyecto con clientes reales:
-- comprobar que ningún par de teléfonos distintos colisione bajo la regla
-- nueva. Si colisionan, es un conflicto real (dos clientes que en realidad
-- son la misma persona, u homónimos con distinto número): NO se resuelve
-- automáticamente, se revisa a mano cuál de los dos registros conservar.
drop index if exists uq_clients_phone_normalized;
alter table public.clients drop column if exists phone_normalized;
alter table public.clients add column phone_normalized text
  generated always as (public.normalize_phone(phone)) stored;
create unique index uq_clients_phone_normalized
  on public.clients(phone_normalized)
  where phone_normalized is not null;

-- =========================================================
-- 2. REVOCAR EXECUTE DE anon (y de PUBLIC) EN FUNCIONES QUE NUNCA
-- DEBERÍA INVOCAR DIRECTAMENTE
-- =========================================================
-- IMPORTANTE: se revoca de PUBLIC, no solo de "anon". Postgres concede
-- EXECUTE a PUBLIC por defecto en toda función nueva, y anon hereda ese
-- permiso igual que cualquier otro rol mientras no se revoque ahí revocar
-- solo "FROM anon" es un no-op si PUBLIC lo sigue teniendo (así fue el primer
-- intento en producción: no tuvo ningún efecto hasta corregirlo así).
--
-- IMPORTANTE: NUNCA se revoca de "authenticated". En Supabase todos los
-- usuarios con sesión (admin y barberos por igual) comparten ese mismo rol
-- de Postgres; la diferencia de permisos la hace is_admin() por dentro de la
-- función, no el rol. Revocar de "authenticated" habría dejado al
-- administrador sin poder cerrar semanas.
--
-- Disparar un trigger NO requiere que el rol que hizo el INSERT/UPDATE tenga
-- EXECUTE sobre la función de trigger: el motor de triggers la invoca
-- directamente, sin pasar por la comprobación de privilegios de una llamada
-- normal. Verificado en producción: los triggers siguen funcionando igual
-- para barberos, admin y el service_role después de este cambio.
revoke execute on function public.close_weekly_settlement(uuid, date, date, integer, integer, numeric, integer, integer) from anon;

revoke execute on function public.appointment_to_service_record() from public;
revoke execute on function public.enforce_service_record_client_owner() from public;
revoke execute on function public.enqueue_appointment_notification() from public;
revoke execute on function public.handle_new_auth_user() from public;
revoke execute on function public.prevent_barber_reopen() from public;
revoke execute on function public.prevent_edit_after_settlement_close() from public;
revoke execute on function public.prevent_role_escalation() from public;
revoke execute on function public.track_service_record_void() from public;

grant execute on function public.appointment_to_service_record() to authenticated, service_role;
grant execute on function public.enforce_service_record_client_owner() to authenticated, service_role;
grant execute on function public.enqueue_appointment_notification() to authenticated, service_role;
grant execute on function public.handle_new_auth_user() to authenticated, service_role;
grant execute on function public.prevent_barber_reopen() to authenticated, service_role;
grant execute on function public.prevent_edit_after_settlement_close() to authenticated, service_role;
grant execute on function public.prevent_role_escalation() to authenticated, service_role;
grant execute on function public.track_service_record_void() to authenticated, service_role;

-- =========================================================
-- FIN DE LAS CORRECCIONES
-- =========================================================
