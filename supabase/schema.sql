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
-- FIN DEL ESQUEMA
-- =========================================================
