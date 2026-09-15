-- =========================================================
-- GOOD BARBER — Cortes destacados de INICIO
--
-- Colección de contenido editorial para la página pública: las láminas
-- verticales de cortes que se muestran en INICIO. NO son servicios: no
-- tienen precio ni duración, no se reservan, no entran en la agenda ni en
-- finanzas, y no comparten ninguna columna con public.services.
--
-- Por qué una tabla nueva y no una existente:
--   · settings es una fila única (id boolean primary key check (id)), así
--     que no puede guardar una colección de N elementos.
--   · services tiene precio, duración y reservas; meter aquí contenido que
--     no se vende ensuciaría el catálogo, la agenda y los cobros.
--   · barbers es el equipo, no contenido.
--   · daily_promotions es financiera (descuento por barbero y día).
-- Ninguna encaja. Esta es la estructura mínima que hace falta.
--
-- Idempotente. Sin DROP de datos. No toca services, barbers, settings,
-- citas, clientes, finanzas ni RLS de otras tablas.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------
create table if not exists public.featured_cuts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.featured_cuts is
  'Cortes destacados de la página INICIO. Contenido editorial administrable desde el panel. No son servicios reservables.';
comment on column public.featured_cuts.image_url is
  'URL pública de la lámina (bucket media, carpeta cortes). NULL = la tarjeta usa su respaldo visual.';
comment on column public.featured_cuts.active is
  'false = oculto en la página pública. El registro se conserva.';

drop trigger if exists trg_featured_cuts_updated_at on public.featured_cuts;
create trigger trg_featured_cuts_updated_at
  before update on public.featured_cuts
  for each row execute function public.set_updated_at();

-- Orden de lectura de la vista pública.
create index if not exists featured_cuts_order_idx
  on public.featured_cuts (sort_order, name)
  where active;

-- ---------------------------------------------------------
-- 2. RLS — mismo criterio que public.services
-- ---------------------------------------------------------
alter table public.featured_cuts enable row level security;

-- Lectura desde el panel: cualquier perfil activo (admin y barbero).
drop policy if exists featured_cuts_select on public.featured_cuts;
create policy featured_cuts_select on public.featured_cuts
  for select using ((select public.is_active_profile()));

-- Escritura: SOLO administrador.
drop policy if exists featured_cuts_insert_admin on public.featured_cuts;
create policy featured_cuts_insert_admin on public.featured_cuts
  for insert with check ((select public.is_admin()));

drop policy if exists featured_cuts_update_admin on public.featured_cuts;
create policy featured_cuts_update_admin on public.featured_cuts
  for update using ((select public.is_admin()));

drop policy if exists featured_cuts_delete_admin on public.featured_cuts;
create policy featured_cuts_delete_admin on public.featured_cuts
  for delete using ((select public.is_admin()));

-- ---------------------------------------------------------
-- 3. Vista pública — solo lectura, solo lo visible
-- ---------------------------------------------------------
create or replace view public.public_featured_cuts as
  select id, name, description, image_url, sort_order
  from public.featured_cuts
  where active
  order by sort_order, name;

-- La vista lee la tabla base con los permisos de su dueño, igual que
-- public_services y public_barbers. Así el público lee sin necesidad de una
-- política de RLS para anon sobre la tabla.
alter view public.public_featured_cuts set (security_invoker = false);

-- Supabase concede ALL por defecto a anon/authenticated sobre los objetos
-- nuevos del esquema public. Se revoca y se concede SOLO select: el público
-- nunca puede escribir contenido de la web.
revoke all on public.public_featured_cuts from anon, authenticated;
grant select on public.public_featured_cuts to anon, authenticated;

-- ---------------------------------------------------------
-- 4. Los cinco cortes iniciales, como REGISTROS EDITABLES
--
-- Solo se insertan si la tabla está vacía, para que volver a ejecutar esta
-- migración no reviva un corte que el administrador haya borrado.
-- Sin image_url a propósito: la lámina se sube desde el panel
-- (Configuración -> Cortes destacados), no desde aquí.
-- ---------------------------------------------------------
insert into public.featured_cuts (name, sort_order)
select v.name, v.sort_order
from (values
  ('Corte clásico',     1),
  ('Desvanecido bajo',  2),
  ('Taper Fade',        3),
  ('Mohicano',          4),
  ('Desvanecido medio', 5)
) as v(name, sort_order)
where not exists (select 1 from public.featured_cuts);

-- ---------------------------------------------------------
-- 5. Avisar a la API REST para que recargue el esquema.
--    SIN ESTO PostgREST sigue sirviendo desde su copia en memoria y la web
--    no ve la vista nueva aunque aquí todo se aplique bien.
-- ---------------------------------------------------------
notify pgrst, 'reload schema';
