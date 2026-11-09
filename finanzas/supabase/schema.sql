-- Esquema de Supabase para "Mis Finanzas" — espejo exacto del modelo que ya
-- usaba IndexedDB (ver finanzas/js/model.js y finanzas/js/db.js). Mismas
-- tablas que los antiguos "object stores": items, occurrences, movements,
-- categories, meta, cuts. Sin login (decisión explícita del usuario): las
-- políticas de abajo permiten acceso completo con la clave pública (anon).
--
-- ADVERTENCIA DE SEGURIDAD: al no haber autenticación, cualquiera que tenga
-- la URL y la clave publicable de este proyecto puede leer y escribir estos
-- datos financieros. Es una decisión consciente del usuario (prioriza
-- simplicidad sobre protección); si en el futuro se agrega login, basta con
-- cambiar estas políticas para exigir auth.uid() en vez de "true".
--
-- Es seguro volver a correr este script completo: usa "if not exists" y
-- "drop policy if exists" en todo.

create table if not exists public.categories (
  id text primary key,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  color text not null default '#8a8f94',
  "order" integer not null default 99
);

create table if not exists public.items (
  id text primary key,
  kind text not null check (kind in ('expense', 'debt', 'heavy', 'income')),
  name text not null,
  category text not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.occurrences (
  id text primary key,
  item_id text not null,
  kind text not null,
  name text not null,
  category text not null,
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

-- ------------------------------------------------------- Row Level Security --

alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.occurrences enable row level security;
alter table public.movements enable row level security;
alter table public.meta enable row level security;
alter table public.cuts enable row level security;

-- Nota: si necesitas volver a crear estas políticas (p. ej. tras borrarlas a
-- mano), primero haz "drop policy if exists "acceso completo sin login" on
-- public.<tabla>;" — se omite aquí porque un DROP disparaba una confirmación
-- de la herramienta MCP que nunca llegaba a buen puerto.

create policy "acceso completo sin login" on public.categories
  for all to anon, authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.items
  for all to anon, authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.occurrences
  for all to anon, authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.movements
  for all to anon, authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.meta
  for all to anon, authenticated using (true) with check (true);

create policy "acceso completo sin login" on public.cuts
  for all to anon, authenticated using (true) with check (true);
