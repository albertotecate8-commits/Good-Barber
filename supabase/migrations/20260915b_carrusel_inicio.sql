-- =========================================================
-- GOOD BARBER — Carrusel de la portada (la baraja de INICIO)
--
-- Colección de las fotografías que giran en la baraja 3D de la portada.
-- Hasta ahora estaban incrustadas en el código (cliente/js/screens.js, la
-- constante BARAJA), así que cambiar una foto exigía editar y desplegar.
--
-- INDEPENDIENTE de featured_cuts: son dos bloques distintos de INICIO.
--   · hero_slides    -> la baraja de la portada, arriba. Formato 3:4.
--   · featured_cuts  -> los cortes destacados, más abajo. Formato 2:3.
-- No comparten tabla, ni vista, ni carpeta del bucket, ni componente.
-- Esta migración NO toca featured_cuts, public_featured_cuts, services,
-- barbers, settings, citas, clientes ni finanzas.
--
-- Idempotente y aditiva. Sin DROP de datos.
-- =========================================================

create table if not exists public.hero_slides (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  sort_order integer not null default 0,
  active boolean not null default true,
  -- Arte plano (el logotipo oficial, por ejemplo): la imagen no se acerca.
  -- El Ken Burns le recortaría el rótulo por los lados. La TARJETA sigue
  -- girando con la baraja; lo único quieto es la imagen dentro de ella.
  no_zoom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.hero_slides is
  'Fotografías de la baraja 3D de la portada de INICIO. Independiente de featured_cuts.';
comment on column public.hero_slides.name is
  'Texto que se lee en el pie de la tarjeta cuando está al frente.';
comment on column public.hero_slides.image_url is
  'URL pública de la fotografía (bucket media, carpeta inicio). Formato 3:4.';
comment on column public.hero_slides.no_zoom is
  'true = arte plano: la imagen no se acerca ni se desatura.';

drop trigger if exists trg_hero_slides_updated_at on public.hero_slides;
create trigger trg_hero_slides_updated_at
  before update on public.hero_slides
  for each row execute function public.set_updated_at();

create index if not exists hero_slides_order_idx
  on public.hero_slides (sort_order, name)
  where active;

-- ---------------------------------------------------------
-- RLS — mismo criterio que services y featured_cuts
-- ---------------------------------------------------------
alter table public.hero_slides enable row level security;

drop policy if exists hero_slides_select on public.hero_slides;
create policy hero_slides_select on public.hero_slides
  for select using ((select public.is_active_profile()));

drop policy if exists hero_slides_insert_admin on public.hero_slides;
create policy hero_slides_insert_admin on public.hero_slides
  for insert with check ((select public.is_admin()));

drop policy if exists hero_slides_update_admin on public.hero_slides;
create policy hero_slides_update_admin on public.hero_slides
  for update using ((select public.is_admin()));

drop policy if exists hero_slides_delete_admin on public.hero_slides;
create policy hero_slides_delete_admin on public.hero_slides
  for delete using ((select public.is_admin()));

-- ---------------------------------------------------------
-- Vista pública — solo lectura, solo lo visible
-- ---------------------------------------------------------
create or replace view public.public_hero_slides as
  select id, name, image_url, sort_order, no_zoom
  from public.hero_slides
  where active
  order by sort_order, name;

alter view public.public_hero_slides set (security_invoker = false);

revoke all on public.public_hero_slides from anon, authenticated;
grant select on public.public_hero_slides to anon, authenticated;

-- ---------------------------------------------------------
-- Las tres tarjetas que la portada ya mostraba, ahora como registros
-- editables. Se siembran con las MISMAS rutas del repositorio y en el MISMO
-- orden, así que la portada se ve exactamente igual tras esta migración: lo
-- único que cambia es que ya se pueden editar desde el panel.
--
-- Solo se insertan si la tabla está vacía, para que volver a ejecutar esto
-- no reviva una tarjeta que el administrador haya borrado.
-- ---------------------------------------------------------
insert into public.hero_slides (name, image_url, sort_order, no_zoom)
select v.name, v.image_url, v.sort_order, v.no_zoom
from (values
  ('Good Barber', 'img/galeria/g1-logo.jpg',      1, true),
  ('High Fade',   'img/galeria/g2-high-fade.jpg', 2, false),
  ('Fresh Cut',   'img/galeria/g3-corte.jpg',     3, false)
) as v(name, image_url, sort_order, no_zoom)
where not exists (select 1 from public.hero_slides);

notify pgrst, 'reload schema';
