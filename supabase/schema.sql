-- =========================================================
-- GOOD BARBER — ESQUEMA DE BASE DE DATOS SUPABASE
-- =========================================================
-- Ejecutar completo en: Supabase Dashboard > SQL Editor > New query
-- Es seguro volver a ejecutar (usa IF NOT EXISTS / OR REPLACE donde aplica),
-- excepto los INSERT de datos semilla que solo deben correr una vez
-- (están protegidos con ON CONFLICT DO NOTHING).
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. FUNCIÓN GENÉRICA: actualizar updated_at
-- =========================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 2. TABLA: profiles
-- Un perfil por usuario de Supabase Auth (auth.users.id = profiles.id)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default 'barber' check (role in ('admin', 'barber')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================
-- 3. TABLA: barbers
-- Extiende profiles con datos propios del negocio de barbería.
-- =========================================================
create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  default_percentage numeric(5,2) not null default 60.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_barbers_updated_at on public.barbers;
create trigger trg_barbers_updated_at
  before update on public.barbers
  for each row execute function public.set_updated_at();

-- =========================================================
-- 4. TABLA: clients
-- =========================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  name text not null,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clients_barber on public.clients(barber_id);

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- =========================================================
-- 5. TABLA: services (catálogo administrable)
-- =========================================================
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  duration_minutes integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

-- =========================================================
-- 6. TABLA: service_records (un registro por servicio realizado)
-- =========================================================
create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  service_id uuid not null references public.services(id),
  service_name text not null,
  price_cents integer not null check (price_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  record_date date not null default (now() at time zone 'America/Mexico_City')::date,
  record_time time not null default (now() at time zone 'America/Mexico_City')::time,
  status text not null default 'completed' check (status in ('completed', 'cancelled', 'pending')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_records_barber_date on public.service_records(barber_id, record_date);
create index if not exists idx_service_records_client on public.service_records(client_id);

drop trigger if exists trg_service_records_updated_at on public.service_records;
create trigger trg_service_records_updated_at
  before update on public.service_records
  for each row execute function public.set_updated_at();

-- =========================================================
-- 7. TABLA: daily_promotions
-- Descuento plano aplicado al total de un día (comportamiento original).
-- =========================================================
create table if not exists public.daily_promotions (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  record_date date not null,
  discount_cents integer not null default 0 check (discount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_id, record_date)
);

drop trigger if exists trg_daily_promotions_updated_at on public.daily_promotions;
create trigger trg_daily_promotions_updated_at
  before update on public.daily_promotions
  for each row execute function public.set_updated_at();

-- =========================================================
-- 8. TABLA: weekly_periods (estado de cada semana por barbero)
-- =========================================================
create table if not exists public.weekly_periods (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'reopened')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_id, week_start_date)
);

drop trigger if exists trg_weekly_periods_updated_at on public.weekly_periods;
create trigger trg_weekly_periods_updated_at
  before update on public.weekly_periods
  for each row execute function public.set_updated_at();

-- =========================================================
-- 9. TABLA: settlements ("corte del sábado")
-- Snapshot inmutable del cierre semanal.
-- =========================================================
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  weekly_period_id uuid references public.weekly_periods(id) on delete set null,
  barber_id uuid not null references public.barbers(id) on delete cascade,
  week_start_date date not null,
  week_end_date date not null,
  total_cents integer not null default 0,
  extra_adjustment_cents integer not null default 0,
  barber_percentage numeric(5,2) not null default 60.00,
  barber_share_cents integer not null default 0,
  business_share_cents integer not null default 0,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (barber_id, week_start_date)
);

drop trigger if exists trg_settlements_updated_at on public.settlements;
create trigger trg_settlements_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

-- =========================================================
-- 10. TABLA: settings (configuración global, fila única)
-- =========================================================
create table if not exists public.settings (
  id boolean primary key default true check (id),
  business_name text not null default 'Good Barber',
  currency text not null default 'MXN',
  default_barber_percentage numeric(5,2) not null default 60.00,
  timezone text not null default 'America/Mexico_City',
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

insert into public.settings (id) values (true) on conflict (id) do nothing;

-- =========================================================
-- 11. DATOS SEMILLA: catálogo de servicios original
-- =========================================================
insert into public.services (name, price_cents, sort_order)
select v.name, v.price_cents, v.sort_order
from (values
  ('Corte de cabello', 12000, 1),
  ('Arreglo de barba', 5000, 2),
  ('Arreglo de ceja', 3000, 3),
  ('Corte + barba', 17000, 4),
  ('Corte + cejas', 15000, 5),
  ('Corte + barba + cejas', 19900, 6)
) as v(name, price_cents, sort_order)
where not exists (select 1 from public.services);

-- =========================================================
-- 12. TRIGGER: crear profile automáticamente al crear un usuario en Auth
-- Rol por defecto SIEMPRE 'barber'. El primer admin se promueve
-- manualmente una sola vez (ver README, sección "Crear el primer administrador").
-- =========================================================
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'barber',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- =========================================================
-- 13. FUNCIONES DE SEGURIDAD (SECURITY DEFINER para evitar recursión en RLS)
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

create or replace function public.is_active_profile()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create or replace function public.current_barber_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from public.barbers where profile_id = auth.uid();
$$;

-- =========================================================
-- 14. TRIGGER: impedir que un usuario se auto-asigne rol/estado admin
-- Defensa adicional además de las políticas RLS.
-- =========================================================
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_admin() then
    raise exception 'No tienes permiso para modificar el rol o el estado de la cuenta.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Igual para reabrir semanas cerradas: solo el admin puede reabrir.
create or replace function public.prevent_barber_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'closed' and new.status <> 'closed' and not public.is_admin() then
    raise exception 'Solo un administrador puede reabrir una semana cerrada.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_barber_reopen on public.weekly_periods;
create trigger trg_prevent_barber_reopen
  before update on public.weekly_periods
  for each row execute function public.prevent_barber_reopen();

-- =========================================================
-- 15. ROW LEVEL SECURITY
-- =========================================================
alter table public.profiles enable row level security;
alter table public.barbers enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.service_records enable row level security;
alter table public.daily_promotions enable row level security;
alter table public.weekly_periods enable row level security;
alter table public.settlements enable row level security;
alter table public.settings enable row level security;

-- ---- profiles ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (public.is_admin());

-- ---- barbers ----
drop policy if exists barbers_select on public.barbers;
create policy barbers_select on public.barbers
  for select using (public.is_admin() or profile_id = auth.uid());

drop policy if exists barbers_all_admin on public.barbers;
create policy barbers_insert_admin on public.barbers
  for insert with check (public.is_admin());
create policy barbers_update_admin on public.barbers
  for update using (public.is_admin());
create policy barbers_delete_admin on public.barbers
  for delete using (public.is_admin());

-- ---- clients ----
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert with check (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete using (public.is_admin());

-- ---- services (catálogo visible para todos los autenticados activos) ----
drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using (public.is_active_profile());

drop policy if exists services_write_admin on public.services;
create policy services_insert_admin on public.services
  for insert with check (public.is_admin());
create policy services_update_admin on public.services
  for update using (public.is_admin());
create policy services_delete_admin on public.services
  for delete using (public.is_admin());

-- ---- service_records ----
drop policy if exists service_records_select on public.service_records;
create policy service_records_select on public.service_records
  for select using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists service_records_insert on public.service_records;
create policy service_records_insert on public.service_records
  for insert with check (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists service_records_update on public.service_records;
create policy service_records_update on public.service_records
  for update using (public.is_admin() or barber_id = public.current_barber_id());

-- Sin policy de DELETE: cancelaciones se hacen con status='cancelled'.

-- ---- daily_promotions ----
drop policy if exists daily_promotions_select on public.daily_promotions;
create policy daily_promotions_select on public.daily_promotions
  for select using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists daily_promotions_insert on public.daily_promotions;
create policy daily_promotions_insert on public.daily_promotions
  for insert with check (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists daily_promotions_update on public.daily_promotions;
create policy daily_promotions_update on public.daily_promotions
  for update using (public.is_admin() or barber_id = public.current_barber_id());

-- ---- weekly_periods ----
-- Abrir/cerrar/reabrir semanas es una función exclusiva del administrador
-- (el panel de barbero no incluye esa acción, ver sección "Semanas" del admin).
drop policy if exists weekly_periods_select on public.weekly_periods;
create policy weekly_periods_select on public.weekly_periods
  for select using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists weekly_periods_insert on public.weekly_periods;
create policy weekly_periods_insert on public.weekly_periods
  for insert with check (public.is_admin());

drop policy if exists weekly_periods_update on public.weekly_periods;
create policy weekly_periods_update on public.weekly_periods
  for update using (public.is_admin());

-- ---- settlements ----
-- El "corte" (cierre semanal con reparto) también es exclusivo del administrador.
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select using (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert with check (public.is_admin());

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements
  for update using (public.is_admin());

-- ---- settings ----
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select using (public.is_active_profile());

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update using (public.is_admin());

-- =========================================================
-- 16. CORRECCIONES DE LA AUDITORÍA FINAL
-- Esta sección es idempotente y segura de re-ejecutar en un proyecto que ya
-- tenía el esquema anterior instalado (usa DROP ... IF EXISTS antes de cada
-- ADD, y CREATE OR REPLACE para funciones). Vuelve a correr TODO este
-- archivo para aplicar estas correcciones a un proyecto existente.
-- =========================================================

-- ---- 16.1 Validación de porcentajes (0-100) ----
-- Antes no existía ningún límite: un valor fuera de rango (ej. -10 o 250)
-- podía guardarse y arruinar el reparto 60/40 sin ningún aviso.
alter table public.barbers drop constraint if exists barbers_default_percentage_range;
alter table public.barbers add constraint barbers_default_percentage_range
  check (default_percentage >= 0 and default_percentage <= 100);

alter table public.settlements drop constraint if exists settlements_barber_percentage_range;
alter table public.settlements add constraint settlements_barber_percentage_range
  check (barber_percentage >= 0 and barber_percentage <= 100);

alter table public.settings drop constraint if exists settings_default_percentage_range;
alter table public.settings add constraint settings_default_percentage_range
  check (default_barber_percentage >= 0 and default_barber_percentage <= 100);

-- ---- 16.2 Integridad cliente/barbero en service_records ----
-- Antes un barbero podía guardar un service_record con client_id de OTRO
-- barbero (RLS no lo comprobaba, solo la propiedad del propio registro).
-- No exponía datos ajenos (la fila del cliente sigue protegida por su propia
-- política RLS), pero permitía asociar registros a clientes que no le
-- pertenecen. Este trigger lo bloquea en el servidor.
create or replace function public.enforce_service_record_client_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_barber_id uuid;
begin
  if new.client_id is not null then
    select barber_id into v_client_barber_id from public.clients where id = new.client_id;
    if v_client_barber_id is null then
      raise exception 'El cliente indicado no existe.';
    end if;
    if v_client_barber_id <> new.barber_id then
      raise exception 'No puedes asociar un registro a un cliente de otro barbero.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_service_record_client_owner on public.service_records;
create trigger trg_enforce_service_record_client_owner
  before insert or update on public.service_records
  for each row execute function public.enforce_service_record_client_owner();

-- ---- 16.3 profiles: quitar la superficie de auto-edición ----
-- Ningún flujo del frontend permite que un usuario edite su propia fila de
-- `profiles` (los cambios de nombre los hace el admin; la contraseña se
-- cambia vía Supabase Auth, no en esta tabla). La política anterior permitía
-- de todas formas UPDATE propio de columnas como `email` o `name` llamando
-- directamente a la API. Se restringe a solo administrador; SELECT propio
-- se mantiene igual (necesario para cargar el perfil al iniciar sesión).
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ---- 16.4 WITH CHECK explícito en políticas de propiedad ----
-- Postgres ya aplicaba el mismo USING como WITH CHECK por defecto cuando no
-- se especifica (por lo que esto no cambia el comportamiento), pero se deja
-- explícito para que quede claro que un barbero NUNCA puede reasignar
-- barber_id a otro barbero mediante UPDATE.
drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update using (public.is_admin() or barber_id = public.current_barber_id())
  with check (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists service_records_update on public.service_records;
create policy service_records_update on public.service_records
  for update using (public.is_admin() or barber_id = public.current_barber_id())
  with check (public.is_admin() or barber_id = public.current_barber_id());

drop policy if exists daily_promotions_update on public.daily_promotions;
create policy daily_promotions_update on public.daily_promotions
  for update using (public.is_admin() or barber_id = public.current_barber_id())
  with check (public.is_admin() or barber_id = public.current_barber_id());

-- ---- 16.5 Cierre de semana atómico (RPC) ----
-- Antes el cierre de semana se hacía en 3 llamadas separadas desde el
-- navegador (crear/leer weekly_period -> marcarlo closed -> upsert de
-- settlement). Bajo concurrencia real (dos pestañas de admin, o un doble
-- clic) existía una condición de carrera: ambas peticiones podían ver "no
-- existe todavía" y ambas intentar crear la misma fila de weekly_periods,
-- disparando un error de llave duplicada. Esta función hace las dos
-- escrituras en una sola transacción atómica del lado del servidor, y
-- vuelve a comprobar is_admin() de forma independiente a RLS.
create or replace function public.close_weekly_settlement(
  p_barber_id uuid,
  p_week_start date,
  p_week_end date,
  p_total_cents integer,
  p_extra_adjustment_cents integer,
  p_barber_percentage numeric,
  p_barber_share_cents integer,
  p_business_share_cents integer
)
returns public.settlements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_id uuid;
  v_settlement public.settlements;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede cerrar una semana.';
  end if;

  insert into public.weekly_periods (barber_id, week_start_date, week_end_date, status, closed_at)
  values (p_barber_id, p_week_start, p_week_end, 'closed', now())
  on conflict (barber_id, week_start_date)
  do update set status = 'closed', closed_at = now(), week_end_date = excluded.week_end_date
  returning id into v_period_id;

  insert into public.settlements (
    weekly_period_id, barber_id, week_start_date, week_end_date,
    total_cents, extra_adjustment_cents, barber_percentage,
    barber_share_cents, business_share_cents, status, created_by
  ) values (
    v_period_id, p_barber_id, p_week_start, p_week_end,
    p_total_cents, p_extra_adjustment_cents, p_barber_percentage,
    p_barber_share_cents, p_business_share_cents, 'completed', auth.uid()
  )
  on conflict (barber_id, week_start_date)
  do update set
    weekly_period_id = excluded.weekly_period_id,
    total_cents = excluded.total_cents,
    extra_adjustment_cents = excluded.extra_adjustment_cents,
    barber_percentage = excluded.barber_percentage,
    barber_share_cents = excluded.barber_share_cents,
    business_share_cents = excluded.business_share_cents,
    status = 'completed'
  returning * into v_settlement;

  return v_settlement;
end;
$$;

revoke all on function public.close_weekly_settlement(uuid, date, date, integer, integer, numeric, integer, integer) from public;
grant execute on function public.close_weekly_settlement(uuid, date, date, integer, integer, numeric, integer, integer) to authenticated;

-- =========================================================
-- 17. CONFIGURACIÓN INICIAL AUTOSERVICIO (creación del primer admin)
-- =========================================================

-- Permite que operaciones server-side (Edge Functions con service_role) modifiquen
-- role/active sin necesitar una sesión de admin ya autenticada — necesario para el
-- arranque inicial (todavía no existe ningún admin). auth.role() lee el claim "role"
-- del JWT de la petición: 'service_role' solo puede presentarlo el propio backend de
-- Supabase (nunca un navegador, la service_role key nunca sale de las Edge Functions),
-- así que esto no abre ninguna vía de escalación para barberos/usuarios normales.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_admin()
     and auth.role() <> 'service_role' then
    raise exception 'No tienes permiso para modificar el rol o el estado de la cuenta.';
  end if;
  return new;
end;
$$;

-- Promueve a un usuario a admin ÚNICAMENTE si todavía no existe ningún admin.
-- Chequeo atómico (dentro de la misma función) para evitar condiciones de carrera
-- entre dos peticiones de "configuración inicial" simultáneas. Solo puede ejecutarla
-- el rol service_role (revocado de public/authenticated/anon), es decir, únicamente
-- la Edge Function bootstrap-admin desde el servidor.
create or replace function public.promote_first_admin(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_count integer;
  v_profile public.profiles;
begin
  select count(*) into v_admin_count from public.profiles where role = 'admin';
  if v_admin_count > 0 then
    raise exception 'Ya existe un administrador. No se puede crear otro mediante configuración inicial.';
  end if;

  update public.profiles
  set role = 'admin'
  where id = p_user_id
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'Perfil no encontrado para el usuario indicado.';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.promote_first_admin(uuid) from public;
revoke all on function public.promote_first_admin(uuid) from authenticated;
revoke all on function public.promote_first_admin(uuid) from anon;
grant execute on function public.promote_first_admin(uuid) to service_role;

-- Función auxiliar de solo-lectura para que el frontend (con la publishable key,
-- sin sesión) sepa si mostrar "Configuración inicial" o el mensaje de cuentas
-- cerradas. No expone ningún dato sensible, solo un booleano.
create or replace function public.admin_exists()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'admin');
$$;

revoke all on function public.admin_exists() from public;
grant execute on function public.admin_exists() to anon;
grant execute on function public.admin_exists() to authenticated;

-- =========================================================
-- 18. VENTAS CON VARIOS SERVICIOS, EDICIÓN POR EL BARBERO Y ANULACIÓN AUDITABLE
-- Idempotente y 100% aditivo: no borra ni renombra ninguna columna existente,
-- todas las columnas nuevas son NULL-able o tienen DEFAULT que reproduce
-- exactamente el comportamiento anterior para las filas ya existentes.
-- =========================================================

-- sale_id: agrupa varias filas de service_records creadas en una misma
-- operación de "registrar servicios" (una venta con varios servicios).
-- NULL en todas las filas históricas (no rompe nada, no se muestran agrupadas).
alter table public.service_records add column if not exists sale_id uuid;
create index if not exists idx_service_records_sale on public.service_records(sale_id);

-- quantity: por defecto 1, así que el total de cada fila histórica no cambia
-- (price_cents * 1 - discount_cents = price_cents - discount_cents, igual que antes).
alter table public.service_records add column if not exists quantity integer not null default 1;
alter table public.service_records drop constraint if exists service_records_quantity_positive;
alter table public.service_records add constraint service_records_quantity_positive check (quantity > 0);

-- Auditoría de anulación: quién y cuándo. NULL en todo lo existente.
alter table public.service_records add column if not exists voided_at timestamptz;
alter table public.service_records add column if not exists voided_by uuid references public.profiles(id);

-- Trigger: registra automáticamente voided_at/voided_by cuando un registro pasa
-- a status='cancelled' (por el barbero o por el admin), y los limpia si se reabre.
create or replace function public.track_service_record_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and (old.status is distinct from 'cancelled') then
    new.voided_at = now();
    new.voided_by = auth.uid();
  elsif new.status <> 'cancelled' and old.status = 'cancelled' then
    new.voided_at = null;
    new.voided_by = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_track_service_record_void on public.service_records;
create trigger trg_track_service_record_void
  before update on public.service_records
  for each row execute function public.track_service_record_void();

-- Trigger: protege la integridad de las liquidaciones ya calculadas. Un barbero
-- no puede crear ni editar un registro cuya fecha caiga dentro de una semana ya
-- CERRADA (para su barber_id); el administrador sí puede (igual que ya podía
-- cancelar/reabrir en semanas cerradas desde el panel, sin cambios ahí).
create or replace function public.prevent_edit_after_settlement_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed boolean;
begin
  if public.is_admin() then
    return new;
  end if;

  select exists (
    select 1 from public.weekly_periods wp
    where wp.status = 'closed'
      and (
        (wp.barber_id = new.barber_id and new.record_date between wp.week_start_date and wp.week_end_date)
        or (tg_op = 'UPDATE' and wp.barber_id = old.barber_id and old.record_date between wp.week_start_date and wp.week_end_date)
      )
  ) into v_closed;

  if v_closed then
    raise exception 'No puedes crear ni editar un servicio en una semana ya cerrada. Pide al administrador que lo ajuste.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_edit_after_settlement_close on public.service_records;
create trigger trg_prevent_edit_after_settlement_close
  before insert or update on public.service_records
  for each row execute function public.prevent_edit_after_settlement_close();

-- =========================================================
-- 19. AUDITORÍA FINAL: rendimiento de RLS + índices de FK faltantes
-- Puramente rendimiento, CERO cambio de semántica: se envuelve cada llamada
-- a is_admin()/is_active_profile()/current_barber_id()/auth.uid() dentro de
-- las políticas en "(select ...)" para que Postgres la evalúe una sola vez
-- por consulta (InitPlan) en vez de una vez por fila. Mismo resultado,
-- más rápido a medida que crezcan las tablas. Patrón recomendado por el
-- propio linter de Supabase (auth_rls_initplan).
-- =========================================================

-- ---- profiles ----
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check ((select public.is_admin()));

-- ---- barbers ----
drop policy if exists barbers_select on public.barbers;
create policy barbers_select on public.barbers
  for select using ((select public.is_admin()) or profile_id = (select auth.uid()));

drop policy if exists barbers_insert_admin on public.barbers;
create policy barbers_insert_admin on public.barbers
  for insert with check ((select public.is_admin()));
drop policy if exists barbers_update_admin on public.barbers;
create policy barbers_update_admin on public.barbers
  for update using ((select public.is_admin()));
drop policy if exists barbers_delete_admin on public.barbers;
create policy barbers_delete_admin on public.barbers
  for delete using ((select public.is_admin()));

-- ---- clients ----
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update using ((select public.is_admin()) or barber_id = (select public.current_barber_id()))
  with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete using ((select public.is_admin()));

-- ---- services ----
drop policy if exists services_select on public.services;
create policy services_select on public.services
  for select using ((select public.is_active_profile()));

drop policy if exists services_insert_admin on public.services;
create policy services_insert_admin on public.services
  for insert with check ((select public.is_admin()));
drop policy if exists services_update_admin on public.services;
create policy services_update_admin on public.services
  for update using ((select public.is_admin()));
drop policy if exists services_delete_admin on public.services;
create policy services_delete_admin on public.services
  for delete using ((select public.is_admin()));

-- ---- service_records ----
drop policy if exists service_records_select on public.service_records;
create policy service_records_select on public.service_records
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists service_records_insert on public.service_records;
create policy service_records_insert on public.service_records
  for insert with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists service_records_update on public.service_records;
create policy service_records_update on public.service_records
  for update using ((select public.is_admin()) or barber_id = (select public.current_barber_id()))
  with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

-- ---- daily_promotions ----
drop policy if exists daily_promotions_select on public.daily_promotions;
create policy daily_promotions_select on public.daily_promotions
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists daily_promotions_insert on public.daily_promotions;
create policy daily_promotions_insert on public.daily_promotions
  for insert with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists daily_promotions_update on public.daily_promotions;
create policy daily_promotions_update on public.daily_promotions
  for update using ((select public.is_admin()) or barber_id = (select public.current_barber_id()))
  with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

-- ---- weekly_periods ----
drop policy if exists weekly_periods_select on public.weekly_periods;
create policy weekly_periods_select on public.weekly_periods
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists weekly_periods_insert on public.weekly_periods;
create policy weekly_periods_insert on public.weekly_periods
  for insert with check ((select public.is_admin()));

drop policy if exists weekly_periods_update on public.weekly_periods;
create policy weekly_periods_update on public.weekly_periods
  for update using ((select public.is_admin()));

-- ---- settlements ----
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert with check ((select public.is_admin()));

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements
  for update using ((select public.is_admin()));

-- ---- settings ----
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select using ((select public.is_active_profile()));

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update using ((select public.is_admin()));

-- ---- Índices de FK faltantes (INFO del advisor de rendimiento) ----
create index if not exists idx_service_records_created_by on public.service_records(created_by);
create index if not exists idx_service_records_service_id on public.service_records(service_id);
create index if not exists idx_service_records_voided_by on public.service_records(voided_by);
create index if not exists idx_settlements_created_by on public.settlements(created_by);
create index if not exists idx_settlements_weekly_period_id on public.settlements(weekly_period_id);

-- =========================================================
-- FIN DEL ESQUEMA
-- =========================================================
