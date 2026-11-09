-- Esquema de Supabase para "Mis Finanzas" — administración de 3 negocios
-- (Barbería, Uñas, Afores) + lo personal, con autenticación y datos
-- compartidos entre los dos usuarios (Administrador / Colaborador).
--
-- Espejo del modelo que antes vivía en IndexedDB (finanzas/js/model.js y
-- finanzas/js/db.js), con dos añadidos: una tabla "businesses" (editable,
-- no hardcodeada) a la que items/occurrences/movements/categories pueden
-- apuntar vía "business_id" (NULL = general/personal, nunca inventado), y
-- una tabla "profiles" ligada a auth.users para saber quién es admin y
-- quién colaborador, y quién registró cada movimiento (created_by).
--
-- Seguridad: con login real, todas las políticas exigen "authenticated"
-- (ya no hay acceso anónimo). El primer correo que se registra queda como
-- Administrador automáticamente (lo decide el trigger handle_new_user);
-- el resto, Colaborador. Un usuario no puede cambiar su propio rol
-- (prevent_role_escalation). No hay claves secretas en el frontend: la
-- clave publicable (anon/publishable) es la única que usa la app.
--
-- Es seguro volver a correr este script completo en un proyecto nuevo: usa
-- "if not exists" en todo lo que lo admite. Si ya tienes datos y vienes de
-- una versión anterior de este archivo (sin negocios/perfiles), aplica en
-- su lugar las migraciones incrementales — ver la nota al final.

create table if not exists public.categories (
  id text primary key,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  color text not null default '#8a8f94',
  "order" integer not null default 99,
  business_id text -- NULL = categoría general; si no, pertenece a un negocio
);

create table if not exists public.businesses (
  id text primary key,
  name text not null,
  color text not null default '#8a8f94',
  "order" integer not null default 99,
  active boolean not null default true
);

insert into public.businesses (id, name, color, "order") values
  ('barberia', 'Barbería', '#17a05c', 1),
  ('unas', 'Uñas', '#b2e528', 2),
  ('afores', 'Afores', '#e08600', 3)
on conflict (id) do nothing;

create table if not exists public.items (
  id text primary key,
  kind text not null check (kind in ('expense', 'debt', 'heavy', 'income')),
  name text not null,
  category text not null,
  business_id text, -- NULL = general/personal, no es de Barbería/Uñas/Afores
  amount numeric not null default 0,
  recurrence text not null default 'once',
  start_date date,
  anchor_day integer,
  variable boolean not null default false,
  cut_based boolean not null default false,
  balance numeric,
  status_note text not null default '',
  reference text not null default '',
  note text not null default '',
  active boolean not null default true,
  canceled_at date,
  seeded boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.occurrences (
  id text primary key,
  item_id text not null,
  kind text not null,
  name text not null,
  category text not null,
  business_id text,
  due_date date not null,
  amount numeric not null default 0,
  status text not null default 'pending',
  paid_amount numeric,
  paid_date date,
  note text not null default '',
  movement_id text,
  created_at timestamptz not null default now()
);
create index if not exists occurrences_item_id_idx on public.occurrences (item_id);
create index if not exists occurrences_due_date_idx on public.occurrences (due_date);
create index if not exists occurrences_status_idx on public.occurrences (status);

create table if not exists public.movements (
  id text primary key,
  type text not null check (type in ('income', 'expense')),
  concept text not null,
  category text not null,
  business_id text,
  kind text,
  amount numeric not null default 0,
  date date not null,
  status text not null default 'done',
  note text not null default '',
  item_id text,
  occurrence_id text,
  partial boolean not null default false,
  balance_before numeric,
  balance_after numeric,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists movements_date_idx on public.movements (date);
create index if not exists movements_item_id_idx on public.movements (item_id);
create index if not exists movements_occurrence_id_idx on public.movements (occurrence_id);

create table if not exists public.meta (
  key text primary key,
  value jsonb
);

create table if not exists public.cuts (
  id text primary key,
  start_date date not null,
  end_date date not null,
  expected numeric not null default 0,
  received numeric not null default 0,
  difference numeric not null default 0,
  status text not null default 'closed',
  closed_at timestamptz not null default now()
);

-- ------------------------------------------------------------- Perfiles --

-- Un perfil por usuario de auth.users: nombre, correo y rol. "is_test" solo
-- existe para marcar cuentas de prueba de desarrollo (nunca lo usa la app
-- en producción) de modo que no cuenten como "el primer usuario real" al
-- decidir quién es Administrador.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'collaborator' check (role in ('admin', 'collaborator')),
  is_test boolean not null default false,
  created_at timestamptz not null default now()
);

-- El primer perfil que se crea (ignorando los marcados is_test) queda como
-- admin; todos los que siguen, collaborator. Se ejecuta con los privilegios
-- del dueño de la función (security definer) porque el usuario que se
-- acaba de registrar todavía no tiene permiso para insertar en profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles where not is_test) into is_first;
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    case when is_first then 'admin' else 'collaborator' end
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie puede cambiar su propio rol (ni admin ni colaborador) por su cuenta.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() = old.id then
    raise exception 'No puedes cambiar tu propio rol.';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

-- Las funciones de arriba solo deben dispararse como triggers, nunca
-- llamarse directamente como endpoint RPC público.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.prevent_role_escalation() from public, anon, authenticated;

-- ------------------------------------------------------- Row Level Security --

alter table public.categories enable row level security;
alter table public.businesses enable row level security;
alter table public.items enable row level security;
alter table public.occurrences enable row level security;
alter table public.movements enable row level security;
alter table public.meta enable row level security;
alter table public.cuts enable row level security;
alter table public.profiles enable row level security;

-- Cualquier usuario con sesión ve y edita todo — los datos son compartidos
-- entre el Administrador y el Colaborador por diseño (sección 13 del
-- rediseño: "ambos deben ver exactamente los mismos datos").
create policy "acceso completo sin login" on public.categories
  for all to authenticated using (true) with check (true);

create policy "acceso para usuarios con sesión" on public.businesses
  for all to authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.items
  for all to authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.occurrences
  for all to authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.movements
  for all to authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.meta
  for all to authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.cuts
  for all to authenticated using (true) with check (true);

-- Perfiles: todos ven todos los perfiles (para mostrar "Registrado por…"),
-- pero cada quien solo puede actualizar el suyo (y nunca su propio rol,
-- por el trigger de arriba).
create policy "ver todos los perfiles" on public.profiles
  for select to authenticated using (true);

create policy "actualizar mi propio perfil" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- -----------------------------------------------------------------------
-- Nota sobre migraciones incrementales: si este proyecto ya tenía datos con
-- el esquema anterior (sin negocios ni perfiles, con acceso anon), el
-- camino seguro no es volver a correr este archivo tal cual — es aplicar
-- ALTER TABLE ... ADD COLUMN IF NOT EXISTS para las columnas nuevas y
-- ALTER POLICY ... TO authenticated (en vez de DROP + CREATE) para retirar
-- el acceso anónimo, igual que se hizo en este proyecto real. Un DROP
-- POLICY/TRIGGER o un DELETE directo contra la base, ejecutados a través de
-- la herramienta MCP de Supabase, se quedan esperando una confirmación que
-- nunca llega — por eso todo en este archivo evita DROP.
