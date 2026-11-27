-- =====================================================================
-- SMART BUSINESS VISION AI — BLOQUEO DEL REGISTRO PÚBLICO (defensa en BD)
-- Migración: 20261127130000_vision_bloqueo_registro.sql
-- =====================================================================
-- Impide que se creen cuentas por el registro público de Supabase Auth
-- (POST /auth/v1/signup), aunque el interruptor «Allow new users to sign up»
-- esté encendido. También bloquea los inicios de sesión anónimos.
--
-- Se permite crear una cuenta solo si:
--   * la inserción la hace un rol administrativo directamente en la base
--     (SQL Editor / conector: current_user distinto de supabase_auth_admin), o
--   * la cuenta trae app_metadata.vision_provisioned = true, algo que solo
--     puede fijar la API de administración (service_role), nunca un visitante.
--
-- Nota: el botón «Add user» del panel de Supabase no envía ese metadato, así
-- que también queda bloqueado mientras exista este trigger (ver
-- docs/BASE-DE-DATOS.md §Cuentas).
-- Idempotente.
-- =====================================================================

create or replace function vision.guard_auth_user_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'supabase_auth_admin' then
    return new;
  end if;
  if coalesce(new.raw_app_meta_data ->> 'vision_provisioned', '') = 'true' then
    return new;
  end if;
  raise exception 'Registro público desactivado en Smart Business Vision.'
    using errcode = '42501';
end;
$$;

comment on function vision.guard_auth_user_insert() is
  'Bloquea el registro público y anónimo en Supabase Auth. Las cuentas las crea un administrador.';

revoke all on function vision.guard_auth_user_insert() from public, anon, authenticated;

drop trigger if exists vision_guard_auth_user_insert on auth.users;
create trigger vision_guard_auth_user_insert
  before insert on auth.users
  for each row execute function vision.guard_auth_user_insert();
