-- =========================================================
-- CMS de contenido público — Good Barber
-- Proyecto de producción: sisgfnykjzovnaxylxyq
--
-- Añade las DOS únicas columnas que faltaban para que el administrador
-- pueda gestionar desde el panel todo el contenido que ve el cliente:
--
--   services.image_url   fotografía propia de cada servicio
--   barbers.sort_order   orden de aparición del equipo
--
-- Todo lo demás (tagline, logo, hero, dirección, teléfono, WhatsApp,
-- Instagram, promoción, reservas on/off, descripción e icono de servicio,
-- foto y biografía de barbero, activo/visible) YA existe en el esquema:
-- solo le faltaba interfaz en el panel.
--
-- No crea tablas. No toca RLS: services/barbers/settings ya tienen
-- escritura restringida a is_admin(). No toca Storage: el bucket 'media'
-- ya existe con lectura pública y escritura solo para administradores.
-- No toca book_appointment ni public_available_slots.
-- Es idempotente: se puede ejecutar más de una vez sin efecto adicional.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Columnas nuevas
-- ---------------------------------------------------------
alter table public.services add column if not exists image_url text;
comment on column public.services.image_url is
  'URL pública de la fotografía del servicio (bucket media). NULL = la interfaz usa su respaldo vectorial.';

alter table public.barbers add column if not exists sort_order integer not null default 0;
comment on column public.barbers.sort_order is
  'Orden de aparición en la página pública. A igual valor, se ordena por nombre.';

-- Índice para el orden público del equipo. Parcial: solo las filas que la
-- vista pública puede devolver, que son las únicas que se ordenan así.
create index if not exists barbers_public_order_idx
  on public.barbers (sort_order, name)
  where active and public_visible;

-- ---------------------------------------------------------
-- 2. Vistas públicas: exponen lo nuevo sin cambiar lo existente
--    Las columnas ya publicadas conservan nombre, tipo y posición;
--    las nuevas se añaden al final, así que nada de lo que ya consume
--    el cliente se ve afectado.
-- ---------------------------------------------------------
create or replace view public.public_services as
  select id, name, description, icon, price_cents, duration_minutes, sort_order, image_url
  from public.services
  where active and public_visible
  order by sort_order;

create or replace view public.public_barbers as
  select b.id, b.name, b.photo_url, b.bio, b.sort_order
  from public.barbers b
  join public.profiles p on p.id = b.profile_id
  where b.active and b.public_visible and p.active
  order by b.sort_order, b.name;

-- Mismos permisos de lectura que ya tenían: anónimo y autenticado.
grant select on public.public_services to anon, authenticated;
grant select on public.public_barbers  to anon, authenticated;
