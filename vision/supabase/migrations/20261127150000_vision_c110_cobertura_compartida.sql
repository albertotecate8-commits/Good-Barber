-- =====================================================================
-- SMART BUSINESS VISION AI — CÁMARAS TAPO C110 Y COBERTURA COMPARTIDA
-- Migración: 20261127150000_vision_c110_cobertura_compartida.sql
-- =====================================================================
-- Corrección del propietario (27 nov 2026):
--   * El modelo real es TP-Link Tapo C110, no C100. Hay DOS cámaras.
--   * La primera C110 ve los espacios de AMBOS negocios.
--
-- Cambios:
--   1. Modelo por defecto y registros existentes: Tapo C100 → Tapo C110.
--   2. Una cámara puede observar estaciones y puertas de cualquier negocio
--      del MISMO establecimiento (antes: solo del suyo).
--   3. Cada línea de conteo indica a qué negocio pertenecen sus entradas
--      (`counting_lines.business_id`; null = negocio de la cámara).
--   4. `traffic_hourly` guarda una fila por cámara, NEGOCIO y hora. El
--      máximo de personas detectadas puede ser null para un negocio cuando
--      esa cámara no lo mide (no se inventa un número).
-- Idempotente.
-- =====================================================================

-- 1. Modelo real
alter table vision.cameras alter column model set default 'TP-Link Tapo C110';
update vision.cameras set model = 'TP-Link Tapo C110' where model = 'TP-Link Tapo C100';

-- 2. Estaciones: la cámara debe ser del mismo establecimiento (no del mismo negocio)
create or replace function vision.enforce_station_camera_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.camera_id is not null and not exists (
    select 1
    from vision.cameras c
    join vision.businesses bc on bc.id = c.business_id
    join vision.businesses bs on bs.id = new.business_id
    where c.id = new.camera_id and bc.site_id = bs.site_id
  ) then
    raise exception 'La cámara seleccionada no pertenece a este establecimiento.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 3. Líneas de conteo con negocio explícito
alter table vision.counting_lines
  add column if not exists business_id uuid references vision.businesses(id) on delete cascade;
create index if not exists counting_lines_business_idx on vision.counting_lines(business_id);

create or replace function vision.enforce_line_business_site()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.business_id is not null and not exists (
    select 1
    from vision.cameras c
    join vision.businesses bc on bc.id = c.business_id
    join vision.businesses bl on bl.id = new.business_id
    where c.id = new.camera_id and bc.site_id = bl.site_id
  ) then
    raise exception 'El negocio de la línea no pertenece al establecimiento de la cámara.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_counting_lines_business_site on vision.counting_lines;
create trigger trg_counting_lines_business_site before insert or update of business_id, camera_id on vision.counting_lines
  for each row execute function vision.enforce_line_business_site();

-- 4. Métricas por cámara + negocio + hora
alter table vision.traffic_hourly drop constraint if exists traffic_hourly_pkey;
alter table vision.traffic_hourly add constraint traffic_hourly_pkey primary key (camera_id, business_id, hour_start);
alter table vision.traffic_hourly alter column people_detected_max drop not null;
alter table vision.traffic_hourly alter column people_detected_max drop default;

revoke all on function vision.enforce_line_business_site() from public, anon, authenticated;

notify pgrst, 'reload schema';
