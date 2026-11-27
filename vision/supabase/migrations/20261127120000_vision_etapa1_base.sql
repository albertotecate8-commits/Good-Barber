-- =====================================================================
-- SMART BUSINESS VISION AI — ETAPA 1: MODELO BASE
-- Migración: 20261127120000_vision_etapa1_base.sql
-- =====================================================================
-- Qué crea:
--   * Esquema propio `vision` (aislado de `public`, donde viven las tablas
--     de la app de Good Barber). Nada de esta migración lee ni modifica
--     tablas de `public`.
--   * Tablas de configuración (sitio, miembros, negocios, horarios,
--     cámaras, estaciones, líneas virtuales).
--   * Tablas para resultados del motor de visión (eventos, métricas
--     horarias, estado en vivo, salud de cámaras, latidos del motor y
--     eventos de seguridad). SOLO el motor (service_role) escribe en ellas.
--   * Tablas preparadas para la administración futura (empleados, tipos de
--     servicio, registro manual de servicios). Sin interfaz en la Etapa 1.
--   * Vistas de lectura con `security_invoker` (respetan RLS).
--   * Funciones de seguridad y políticas RLS en TODAS las tablas.
--
-- Qué NO guarda, por diseño:
--   * Vídeo, imágenes, audio ni flujos de cámara.
--   * Credenciales de cámaras ni URLs RTSP (viven solo en el servidor de
--     procesamiento, como variables de entorno).
--   * Rasgos faciales ni identificadores permanentes de personas:
--     `track_ref` es un identificador efímero del tracker, válido solo
--     durante un seguimiento.
--
-- Cómo aplicarla: ver vision/docs/BASE-DE-DATOS.md.
-- Es idempotente: se puede volver a ejecutar completa.
-- =====================================================================

create schema if not exists vision;

comment on schema vision is
  'Smart Business Vision AI: configuración, métricas y eventos del motor de visión. Sin vídeo ni credenciales.';

-- =====================================================================
-- 1. UTILIDADES
-- =====================================================================

create or replace function vision.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Punto normalizado [x, y] con 0 <= x,y <= 1 (relativo al encuadre, así no
-- depende de la resolución de la cámara).
create or replace function vision.is_valid_point(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null then
    return true;
  end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2 then
    return false;
  end if;
  if jsonb_typeof(p -> 0) <> 'number' or jsonb_typeof(p -> 1) <> 'number' then
    return false;
  end if;
  return (p ->> 0)::numeric between 0 and 1
     and (p ->> 1)::numeric between 0 and 1;
end;
$$;

-- Polígono: arreglo de 3 a 32 puntos normalizados.
create or replace function vision.is_valid_polygon(poly jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  pt jsonb;
begin
  if poly is null then
    return true;
  end if;
  if jsonb_typeof(poly) <> 'array'
     or jsonb_array_length(poly) < 3
     or jsonb_array_length(poly) > 32 then
    return false;
  end if;
  for pt in select value from jsonb_array_elements(poly) loop
    if pt is null or not vision.is_valid_point(pt) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function vision.validate_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria no válida: %', new.timezone using errcode = '22023';
  end if;
  return new;
end;
$$;

-- =====================================================================
-- 2. CONFIGURACIÓN
-- =====================================================================

-- Un "sitio" es el establecimiento físico. Hoy hay uno (con dos negocios),
-- pero el modelo admite más sitios y más negocios en el futuro.
create table if not exists vision.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  timezone text not null default 'America/Mexico_City',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_sites_updated_at on vision.sites;
create trigger trg_sites_updated_at before update on vision.sites
  for each row execute function vision.set_updated_at();
drop trigger if exists trg_sites_timezone on vision.sites;
create trigger trg_sites_timezone before insert or update of timezone on vision.sites
  for each row execute function vision.validate_timezone();

-- Quién puede entrar a la app y con qué rol. Tener una cuenta en Supabase
-- Auth NO da acceso: hace falta una fila activa aquí.
--   owner  → todo, incluida la gestión de usuarios.
--   admin  → configuración (negocios, cámaras, estaciones, horarios) y
--            revisión de eventos de seguridad.
--   viewer → solo lectura.
create table if not exists vision.members (
  site_id uuid not null references vision.sites(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'viewer')),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_id, user_id)
);

create index if not exists members_user_idx on vision.members(user_id);

drop trigger if exists trg_members_updated_at on vision.members;
create trigger trg_members_updated_at before update on vision.members
  for each row execute function vision.set_updated_at();

create table if not exists vision.businesses (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references vision.sites(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  accent_color text not null default '#d4a24e' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  -- false = el horario registrado todavía no ha sido confirmado por el
  -- propietario (caso actual de Glamour Studio).
  hours_confirmed boolean not null default false,
  -- Umbral de permanencia por defecto para las estaciones de este negocio.
  -- 60 s es un valor inicial EXPERIMENTAL, no una regla definitiva.
  default_dwell_seconds integer not null default 60 check (default_dwell_seconds between 5 and 3600),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, slug)
);

drop trigger if exists trg_businesses_updated_at on vision.businesses;
create trigger trg_businesses_updated_at before update on vision.businesses
  for each row execute function vision.set_updated_at();

-- Horario comercial: un intervalo por día de la semana.
-- weekday: 0 = domingo … 6 = sábado (igual que Date.getDay() en JS).
-- Sin fila para un día = horario sin registrar para ese día.
-- No admite horarios que crucen la medianoche (no es el caso actual).
create table if not exists vision.business_hours (
  business_id uuid not null references vision.businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  is_closed boolean not null default false,
  opens_at time,
  closes_at time,
  updated_at timestamptz not null default now(),
  primary key (business_id, weekday),
  constraint business_hours_consistency check (
    (is_closed and opens_at is null and closes_at is null)
    or (not is_closed and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

drop trigger if exists trg_business_hours_updated_at on vision.business_hours;
create trigger trg_business_hours_updated_at before update on vision.business_hours
  for each row execute function vision.set_updated_at();

-- Cámaras. SIN credenciales ni URL RTSP: solo datos descriptivos.
-- stream_profile: perfil RTSP que usará el motor en el servidor
--   stream1 = alta resolución, stream2 = baja resolución (recomendado para
--   análisis por consumo de CPU y ancho de banda; se valida en la Etapa 2).
create table if not exists vision.cameras (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references vision.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  model text not null default 'TP-Link Tapo C100' check (char_length(model) <= 60),
  location_note text check (location_note is null or char_length(location_note) <= 200),
  stream_profile text not null default 'stream2' check (stream_profile in ('stream1', 'stream2')),
  -- Intención del propietario: que el motor procese esta cámara cuando
  -- exista. NO significa que esté conectada (eso lo dice camera_health).
  analysis_enabled boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cameras_business_idx on vision.cameras(business_id);

drop trigger if exists trg_cameras_updated_at on vision.cameras;
create trigger trg_cameras_updated_at before update on vision.cameras
  for each row execute function vision.set_updated_at();

-- Estaciones (sillas, mesas, lavabos…). El propietario las crea; nunca se
-- asume cuántas hay. `zone` es un polígono normalizado sobre el encuadre de
-- `camera_id`; null = zona todavía sin dibujar.
-- Ocupación de una estación ≠ servicio realizado ≠ cobro.
create table if not exists vision.stations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references vision.businesses(id) on delete cascade,
  camera_id uuid references vision.cameras(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null default 'otro' check (kind in ('silla', 'mesa', 'lavabo', 'espera', 'otro')),
  zone jsonb check (vision.is_valid_polygon(zone)),
  -- null = usar businesses.default_dwell_seconds.
  dwell_threshold_seconds integer check (dwell_threshold_seconds is null or dwell_threshold_seconds between 5 and 3600),
  -- Tiempo sin presencia antes de considerar la estación liberada.
  release_grace_seconds integer not null default 15 check (release_grace_seconds between 0 and 600),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists stations_business_idx on vision.stations(business_id);
create index if not exists stations_camera_idx on vision.stations(camera_id);

drop trigger if exists trg_stations_updated_at on vision.stations;
create trigger trg_stations_updated_at before update on vision.stations
  for each row execute function vision.set_updated_at();

-- La cámara de una estación debe pertenecer al mismo negocio.
create or replace function vision.enforce_station_camera_business()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.camera_id is not null and not exists (
    select 1 from vision.cameras c
    where c.id = new.camera_id and c.business_id = new.business_id
  ) then
    raise exception 'La cámara seleccionada no pertenece a este negocio.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stations_camera_business on vision.stations;
create trigger trg_stations_camera_business before insert or update of camera_id, business_id on vision.stations
  for each row execute function vision.enforce_station_camera_business();

-- Líneas virtuales de conteo (se configuran en la Etapa 4).
-- Segmento A→B en coordenadas normalizadas; entry_side indica de qué lado
-- de la recta dirigida A→B queda el interior del negocio.
create table if not exists vision.counting_lines (
  id uuid primary key default gen_random_uuid(),
  camera_id uuid not null references vision.cameras(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  point_a jsonb not null check (vision.is_valid_point(point_a)),
  point_b jsonb not null check (vision.is_valid_point(point_b)),
  entry_side text not null check (entry_side in ('left', 'right')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (point_a <> point_b)
);

create index if not exists counting_lines_camera_idx on vision.counting_lines(camera_id);

drop trigger if exists trg_counting_lines_updated_at on vision.counting_lines;
create trigger trg_counting_lines_updated_at before update on vision.counting_lines
  for each row execute function vision.set_updated_at();

-- =====================================================================
-- 3. RESULTADOS DEL MOTOR DE VISIÓN (solo escribe service_role)
-- =====================================================================

-- Latido del motor de visión. Si no hay filas, el motor nunca se conectó y
-- la app muestra todos los indicadores como "pendiente de conexión".
create table if not exists vision.engine_nodes (
  id text primary key check (char_length(id) between 1 and 60),
  site_id uuid not null references vision.sites(id) on delete cascade,
  version text check (version is null or char_length(version) <= 40),
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  detail jsonb not null default '{}'::jsonb
);

-- Salud por cámara, reportada por el motor. Sin fila = nunca se ha probado.
create table if not exists vision.camera_health (
  camera_id uuid primary key references vision.cameras(id) on delete cascade,
  status text not null check (status in ('online', 'offline', 'error')),
  last_seen_at timestamptz,
  last_frame_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  fps numeric(6, 2) check (fps is null or fps >= 0),
  updated_at timestamptz not null default now()
);

-- Historial de conexiones/desconexiones.
create table if not exists vision.camera_status_events (
  id bigint generated always as identity primary key,
  camera_id uuid not null references vision.cameras(id) on delete cascade,
  status text not null check (status in ('online', 'offline', 'error')),
  occurred_at timestamptz not null,
  detail text check (detail is null or char_length(detail) <= 500)
);

create index if not exists camera_status_events_camera_time_idx
  on vision.camera_status_events(camera_id, occurred_at desc);

-- Eventos individuales con fecha y hora: cruces de línea y entradas/salidas
-- de zona. Una persona detectada no es un cliente confirmado.
create table if not exists vision.vision_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references vision.businesses(id) on delete restrict,
  camera_id uuid not null references vision.cameras(id) on delete restrict,
  event_type text not null check (event_type in ('line_entry', 'line_exit', 'zone_enter', 'zone_exit')),
  occurred_at timestamptz not null,
  -- Identificador efímero del tracker (ByteTrack). No identifica personas.
  track_ref text check (track_ref is null or char_length(track_ref) <= 64),
  line_id uuid references vision.counting_lines(id) on delete set null,
  station_id uuid references vision.stations(id) on delete set null,
  confidence real check (confidence is null or confidence between 0 and 1),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vision_events_business_time_idx
  on vision.vision_events(business_id, occurred_at desc);

-- Métricas por hora y por cámara. hour_start en UTC, truncado a la hora.
--   people_detected_max: máximo de personas detectadas simultáneamente.
--   entries / exits:     cruces de línea registrados.
--   visits_estimated:    estimación de visitas (no clientes confirmados).
--   observed_seconds:    segundos de esa hora en que la cámara se analizó
--                        de verdad; 0 = sin información, no "cero personas".
create table if not exists vision.traffic_hourly (
  camera_id uuid not null references vision.cameras(id) on delete restrict,
  business_id uuid not null references vision.businesses(id) on delete restrict,
  hour_start timestamptz not null,
  people_detected_max integer not null default 0 check (people_detected_max >= 0),
  entries integer not null default 0 check (entries >= 0),
  exits integer not null default 0 check (exits >= 0),
  visits_estimated integer not null default 0 check (visits_estimated >= 0),
  observed_seconds integer not null default 0 check (observed_seconds between 0 and 3600),
  updated_at timestamptz not null default now(),
  primary key (camera_id, hour_start)
);

create index if not exists traffic_hourly_business_time_idx
  on vision.traffic_hourly(business_id, hour_start desc);

create table if not exists vision.station_occupancy_hourly (
  station_id uuid not null references vision.stations(id) on delete restrict,
  business_id uuid not null references vision.businesses(id) on delete restrict,
  hour_start timestamptz not null,
  occupied_seconds integer not null default 0 check (occupied_seconds >= 0),
  observed_seconds integer not null default 0 check (observed_seconds between 0 and 3600),
  sessions integer not null default 0 check (sessions >= 0),
  updated_at timestamptz not null default now(),
  primary key (station_id, hour_start),
  check (occupied_seconds <= observed_seconds)
);

create index if not exists station_occupancy_business_time_idx
  on vision.station_occupancy_hourly(business_id, hour_start desc);

-- Estado en vivo de cada estación.
create table if not exists vision.station_live_state (
  station_id uuid primary key references vision.stations(id) on delete cascade,
  state text not null check (state in ('occupied', 'free', 'unknown')),
  since timestamptz not null,
  updated_at timestamptz not null default now()
);

-- Estimado de personas dentro de cada negocio (entradas − salidas, con
-- correcciones del motor). Siempre es un ESTIMADO.
create table if not exists vision.business_live_state (
  business_id uuid primary key references vision.businesses(id) on delete cascade,
  people_inside_estimate integer not null check (people_inside_estimate >= 0),
  updated_at timestamptz not null default now()
);

-- Eventos de seguridad.
--   category: camera_alert   = viene de la cámara / conexión (p. ej. desconexión)
--             analysis_alert = la generó el análisis del motor
--             unconfirmed    = evento sin confirmar (baja confianza)
--   status:   open → acknowledged | dismissed (revisión humana)
create table if not exists vision.security_events (
  id bigint generated always as identity primary key,
  business_id uuid not null references vision.businesses(id) on delete cascade,
  camera_id uuid references vision.cameras(id) on delete set null,
  category text not null check (category in ('camera_alert', 'analysis_alert', 'unconfirmed')),
  kind text not null check (kind in (
    'after_hours_presence', 'after_hours_motion',
    'camera_offline', 'camera_recovered', 'engine_offline'
  )),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  source text not null default 'vision_engine' check (source in ('vision_engine', 'manual')),
  occurred_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_business_time_idx
  on vision.security_events(business_id, occurred_at desc);
create index if not exists security_events_open_idx
  on vision.security_events(business_id) where status = 'open';

-- =====================================================================
-- 4. ADMINISTRACIÓN FUTURA (estructura lista, sin interfaz en Etapa 1)
-- La identidad de un empleado NUNCA se infiere por cámara: estos datos son
-- siempre manuales.
-- =====================================================================

create table if not exists vision.employees (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references vision.sites(id) on delete cascade,
  -- Negocio principal (opcional: alguien puede trabajar en ambos).
  business_id uuid references vision.businesses(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_employees_updated_at on vision.employees;
create trigger trg_employees_updated_at before update on vision.employees
  for each row execute function vision.set_updated_at();

create table if not exists vision.service_types (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references vision.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  default_duration_minutes integer check (default_duration_minutes is null or default_duration_minutes between 1 and 600),
  default_price_cents integer check (default_price_cents is null or default_price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

drop trigger if exists trg_service_types_updated_at on vision.service_types;
create trigger trg_service_types_updated_at before update on vision.service_types
  for each row execute function vision.set_updated_at();

create table if not exists vision.service_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references vision.businesses(id) on delete restrict,
  employee_id uuid references vision.employees(id) on delete set null,
  station_id uuid references vision.stations(id) on delete set null,
  service_type_id uuid references vision.service_types(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer generated always as (
    case when ended_at is null then null
         else extract(epoch from (ended_at - started_at))::integer end
  ) stored,
  price_cents integer check (price_cents is null or price_cents >= 0),
  source text not null default 'manual' check (source in ('manual')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

create index if not exists service_logs_business_time_idx
  on vision.service_logs(business_id, started_at desc);

drop trigger if exists trg_service_logs_updated_at on vision.service_logs;
create trigger trg_service_logs_updated_at before update on vision.service_logs
  for each row execute function vision.set_updated_at();

-- =====================================================================
-- 5. FUNCIONES DE SEGURIDAD
-- SECURITY DEFINER para que las políticas puedan consultar `members` sin
-- recursión de RLS. search_path vacío y nombres calificados.
-- =====================================================================

create or replace function vision.member_role(p_site uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from vision.members m
  where m.site_id = p_site
    and m.user_id = auth.uid()
    and m.active
$$;

create or replace function vision.is_member(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select vision.member_role(p_site) is not null
$$;

create or replace function vision.can_manage(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(vision.member_role(p_site) in ('owner', 'admin'), false)
$$;

create or replace function vision.is_owner(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(vision.member_role(p_site) = 'owner', false)
$$;

create or replace function vision.business_site(p_business uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.site_id from vision.businesses b where b.id = p_business
$$;

create or replace function vision.camera_site(p_camera uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.site_id
  from vision.cameras c
  join vision.businesses b on b.id = c.business_id
  where c.id = p_camera
$$;

create or replace function vision.station_site(p_station uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.site_id
  from vision.stations s
  join vision.businesses b on b.id = s.business_id
  where s.id = p_station
$$;

-- Nunca dejar un sitio sin propietario activo.
create or replace function vision.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_site uuid := coalesce(old.site_id, new.site_id);
  v_remaining integer;
begin
  if old.role = 'owner' and old.active and (
       tg_op = 'DELETE'
       or new.role <> 'owner'
       or not new.active
     ) then
    select count(*) into v_remaining
    from vision.members m
    where m.site_id = v_site
      and m.role = 'owner'
      and m.active
      and m.user_id <> old.user_id;
    if v_remaining = 0 then
      raise exception 'No se puede quitar al último propietario activo.' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_protect_last_owner on vision.members;
create trigger trg_members_protect_last_owner before update or delete on vision.members
  for each row execute function vision.protect_last_owner();

-- =====================================================================
-- 6. FUNCIONES DE APLICACIÓN (RPC)
-- =====================================================================

-- Sitios a los que pertenece el usuario, con su rol.
create or replace function vision.my_memberships()
returns table (site_id uuid, site_name text, timezone text, role text, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.timezone, m.role, m.display_name
  from vision.members m
  join vision.sites s on s.id = m.site_id
  where m.user_id = auth.uid() and m.active
  order by s.created_at
$$;

-- Lista de miembros de un sitio, con su correo (solo para miembros).
create or replace function vision.list_members(p_site uuid)
returns table (user_id uuid, email text, role text, display_name text, active boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not vision.is_member(p_site) then
    raise exception 'Sin acceso a este establecimiento.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.display_name, m.active, m.created_at
    from vision.members m
    join auth.users u on u.id = m.user_id
    where m.site_id = p_site
    order by m.created_at;
end;
$$;

-- El propietario da acceso a una cuenta que YA existe en Supabase Auth.
-- (La creación de cuentas se hace en el Dashboard de Supabase; el registro
-- público debe estar desactivado.)
create or replace function vision.add_member_by_email(
  p_site uuid,
  p_email text,
  p_role text,
  p_display_name text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if not vision.is_owner(p_site) then
    raise exception 'Solo el propietario puede administrar usuarios.' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'viewer') then
    raise exception 'Rol no válido.' using errcode = '22023';
  end if;
  select u.id into v_user
  from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
  if v_user is null then
    raise exception 'No existe una cuenta con ese correo. Créala primero en Supabase → Authentication → Users.'
      using errcode = 'P0002';
  end if;
  insert into vision.members (site_id, user_id, role, display_name, active)
  values (p_site, v_user, p_role, nullif(btrim(coalesce(p_display_name, '')), ''), true)
  on conflict (site_id, user_id) do update
    set role = excluded.role,
        display_name = coalesce(excluded.display_name, vision.members.display_name),
        active = true;
  return v_user;
end;
$$;

-- Revisión humana de un evento de seguridad (owner/admin). Solo cambia los
-- campos de revisión; el resto del evento es inmutable desde la app.
create or replace function vision.review_security_event(
  p_event bigint,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_business uuid;
begin
  select e.business_id into v_business from vision.security_events e where e.id = p_event;
  if v_business is null then
    raise exception 'Evento no encontrado.' using errcode = 'P0002';
  end if;
  if not vision.can_manage(vision.business_site(v_business)) then
    raise exception 'Sin permiso para revisar eventos.' using errcode = '42501';
  end if;
  if p_status not in ('open', 'acknowledged', 'dismissed') then
    raise exception 'Estado no válido.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'La nota no puede pasar de 500 caracteres.' using errcode = '22001';
  end if;
  update vision.security_events
     set status = p_status,
         review_note = nullif(btrim(coalesce(p_note, '')), ''),
         reviewed_by = case when p_status = 'open' then null else auth.uid() end,
         reviewed_at = case when p_status = 'open' then null else now() end
   where id = p_event;
end;
$$;

-- Alta del PRIMER propietario. Solo se ejecuta desde el SQL Editor de
-- Supabase (rol postgres) o con service_role; nunca desde el navegador.
create or replace function vision.bootstrap_owner(p_email text, p_display_name text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_site uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then
    raise exception 'No existe una cuenta con el correo %. Créala en Authentication → Users.', p_email;
  end if;
  select s.id into v_site from vision.sites s order by s.created_at limit 1;
  if v_site is null then
    raise exception 'No hay ningún establecimiento. Ejecuta primero la migración de datos iniciales.';
  end if;
  insert into vision.members (site_id, user_id, role, display_name, active)
  values (v_site, v_user, 'owner', p_display_name, true)
  on conflict (site_id, user_id) do update set role = 'owner', active = true;
  return v_user;
end;
$$;

-- =====================================================================
-- 7. VISTAS DE LECTURA (security_invoker = respetan el RLS de quien consulta)
-- Las fechas/horas "locales" usan la zona horaria del establecimiento.
-- =====================================================================

create or replace view vision.camera_overview
with (security_invoker = true) as
select
  c.id,
  c.business_id,
  c.name,
  c.model,
  c.location_note,
  c.stream_profile,
  c.analysis_enabled,
  c.sort_order,
  c.active,
  h.status as health_status,
  h.last_seen_at,
  h.last_frame_at,
  h.last_error,
  h.fps,
  h.updated_at as health_updated_at
from vision.cameras c
left join vision.camera_health h on h.camera_id = c.id;

create or replace view vision.traffic_hourly_local
with (security_invoker = true) as
select
  t.business_id,
  t.camera_id,
  t.hour_start,
  (t.hour_start at time zone s.timezone)::date as local_date,
  extract(hour from (t.hour_start at time zone s.timezone))::integer as local_hour,
  t.people_detected_max,
  t.entries,
  t.exits,
  t.visits_estimated,
  t.observed_seconds
from vision.traffic_hourly t
join vision.businesses b on b.id = t.business_id
join vision.sites s on s.id = b.site_id;

create or replace view vision.traffic_daily
with (security_invoker = true) as
select
  business_id,
  local_date,
  max(people_detected_max) as people_detected_max,
  sum(entries)::integer as entries,
  sum(exits)::integer as exits,
  sum(visits_estimated)::integer as visits_estimated,
  sum(observed_seconds)::integer as observed_seconds
from vision.traffic_hourly_local
group by business_id, local_date;

create or replace view vision.station_occupancy_daily
with (security_invoker = true) as
select
  o.station_id,
  o.business_id,
  (o.hour_start at time zone s.timezone)::date as local_date,
  sum(o.occupied_seconds)::integer as occupied_seconds,
  sum(o.observed_seconds)::integer as observed_seconds,
  sum(o.sessions)::integer as sessions
from vision.station_occupancy_hourly o
join vision.businesses b on b.id = o.business_id
join vision.sites s on s.id = b.site_id
group by o.station_id, o.business_id, (o.hour_start at time zone s.timezone)::date;

-- =====================================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================================

alter table vision.sites enable row level security;
alter table vision.members enable row level security;
alter table vision.businesses enable row level security;
alter table vision.business_hours enable row level security;
alter table vision.cameras enable row level security;
alter table vision.stations enable row level security;
alter table vision.counting_lines enable row level security;
alter table vision.engine_nodes enable row level security;
alter table vision.camera_health enable row level security;
alter table vision.camera_status_events enable row level security;
alter table vision.vision_events enable row level security;
alter table vision.traffic_hourly enable row level security;
alter table vision.station_occupancy_hourly enable row level security;
alter table vision.station_live_state enable row level security;
alter table vision.business_live_state enable row level security;
alter table vision.security_events enable row level security;
alter table vision.employees enable row level security;
alter table vision.service_types enable row level security;
alter table vision.service_logs enable row level security;

-- ---- sites ----
drop policy if exists sites_select on vision.sites;
create policy sites_select on vision.sites for select to authenticated
  using (vision.is_member(id));
drop policy if exists sites_update on vision.sites;
create policy sites_update on vision.sites for update to authenticated
  using (vision.is_owner(id)) with check (vision.is_owner(id));

-- ---- members ----
drop policy if exists members_select on vision.members;
create policy members_select on vision.members for select to authenticated
  using (vision.is_member(site_id));
drop policy if exists members_insert on vision.members;
create policy members_insert on vision.members for insert to authenticated
  with check (vision.is_owner(site_id));
drop policy if exists members_update on vision.members;
create policy members_update on vision.members for update to authenticated
  using (vision.is_owner(site_id)) with check (vision.is_owner(site_id));
drop policy if exists members_delete on vision.members;
create policy members_delete on vision.members for delete to authenticated
  using (vision.is_owner(site_id));

-- ---- businesses ----
drop policy if exists businesses_select on vision.businesses;
create policy businesses_select on vision.businesses for select to authenticated
  using (vision.is_member(site_id));
drop policy if exists businesses_insert on vision.businesses;
create policy businesses_insert on vision.businesses for insert to authenticated
  with check (vision.can_manage(site_id));
drop policy if exists businesses_update on vision.businesses;
create policy businesses_update on vision.businesses for update to authenticated
  using (vision.can_manage(site_id)) with check (vision.can_manage(site_id));
-- Sin política DELETE: los negocios se desactivan, no se borran (conserva historial).

-- ---- business_hours ----
drop policy if exists business_hours_select on vision.business_hours;
create policy business_hours_select on vision.business_hours for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));
drop policy if exists business_hours_write on vision.business_hours;
create policy business_hours_write on vision.business_hours for all to authenticated
  using (vision.can_manage(vision.business_site(business_id)))
  with check (vision.can_manage(vision.business_site(business_id)));

-- ---- cameras ----
drop policy if exists cameras_select on vision.cameras;
create policy cameras_select on vision.cameras for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));
drop policy if exists cameras_write on vision.cameras;
create policy cameras_write on vision.cameras for all to authenticated
  using (vision.can_manage(vision.business_site(business_id)))
  with check (vision.can_manage(vision.business_site(business_id)));

-- ---- stations ----
drop policy if exists stations_select on vision.stations;
create policy stations_select on vision.stations for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));
drop policy if exists stations_write on vision.stations;
create policy stations_write on vision.stations for all to authenticated
  using (vision.can_manage(vision.business_site(business_id)))
  with check (vision.can_manage(vision.business_site(business_id)));

-- ---- counting_lines ----
drop policy if exists counting_lines_select on vision.counting_lines;
create policy counting_lines_select on vision.counting_lines for select to authenticated
  using (vision.is_member(vision.camera_site(camera_id)));
drop policy if exists counting_lines_write on vision.counting_lines;
create policy counting_lines_write on vision.counting_lines for all to authenticated
  using (vision.can_manage(vision.camera_site(camera_id)))
  with check (vision.can_manage(vision.camera_site(camera_id)));

-- ---- Tablas del motor: lectura para miembros, escritura solo service_role
--      (service_role omite RLS; no existe política de escritura para
--      authenticated, y además no tiene GRANT de escritura). ----
drop policy if exists engine_nodes_select on vision.engine_nodes;
create policy engine_nodes_select on vision.engine_nodes for select to authenticated
  using (vision.is_member(site_id));

drop policy if exists camera_health_select on vision.camera_health;
create policy camera_health_select on vision.camera_health for select to authenticated
  using (vision.is_member(vision.camera_site(camera_id)));

drop policy if exists camera_status_events_select on vision.camera_status_events;
create policy camera_status_events_select on vision.camera_status_events for select to authenticated
  using (vision.is_member(vision.camera_site(camera_id)));

drop policy if exists vision_events_select on vision.vision_events;
create policy vision_events_select on vision.vision_events for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));

drop policy if exists traffic_hourly_select on vision.traffic_hourly;
create policy traffic_hourly_select on vision.traffic_hourly for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));

drop policy if exists station_occupancy_hourly_select on vision.station_occupancy_hourly;
create policy station_occupancy_hourly_select on vision.station_occupancy_hourly for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));

drop policy if exists station_live_state_select on vision.station_live_state;
create policy station_live_state_select on vision.station_live_state for select to authenticated
  using (vision.is_member(vision.station_site(station_id)));

drop policy if exists business_live_state_select on vision.business_live_state;
create policy business_live_state_select on vision.business_live_state for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));

-- La revisión se hace con vision.review_security_event(); no hay UPDATE directo.
drop policy if exists security_events_select on vision.security_events;
create policy security_events_select on vision.security_events for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));

-- ---- Administración futura ----
drop policy if exists employees_select on vision.employees;
create policy employees_select on vision.employees for select to authenticated
  using (vision.is_member(site_id));
drop policy if exists employees_write on vision.employees;
create policy employees_write on vision.employees for all to authenticated
  using (vision.can_manage(site_id)) with check (vision.can_manage(site_id));

drop policy if exists service_types_select on vision.service_types;
create policy service_types_select on vision.service_types for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));
drop policy if exists service_types_write on vision.service_types;
create policy service_types_write on vision.service_types for all to authenticated
  using (vision.can_manage(vision.business_site(business_id)))
  with check (vision.can_manage(vision.business_site(business_id)));

drop policy if exists service_logs_select on vision.service_logs;
create policy service_logs_select on vision.service_logs for select to authenticated
  using (vision.is_member(vision.business_site(business_id)));
drop policy if exists service_logs_write on vision.service_logs;
create policy service_logs_write on vision.service_logs for all to authenticated
  using (vision.can_manage(vision.business_site(business_id)))
  with check (vision.can_manage(vision.business_site(business_id)));

-- =====================================================================
-- 9. PRIVILEGIOS (defensa en profundidad además de RLS)
-- `anon` (visitantes sin sesión) no tiene acceso a NADA del esquema.
-- =====================================================================

revoke all on schema vision from public, anon;
revoke all on all tables in schema vision from public, anon, authenticated;
revoke all on all functions in schema vision from public, anon, authenticated;
revoke all on all sequences in schema vision from public, anon, authenticated;

grant usage on schema vision to authenticated, service_role;

-- Configuración: lectura y escritura (RLS decide quién).
grant select, insert, update, delete on
  vision.members,
  vision.business_hours,
  vision.cameras,
  vision.stations,
  vision.counting_lines,
  vision.employees,
  vision.service_types,
  vision.service_logs
to authenticated;
grant select, insert, update on vision.businesses to authenticated;
grant select, update on vision.sites to authenticated;

-- Resultados del motor: solo lectura para la app.
grant select on
  vision.engine_nodes,
  vision.camera_health,
  vision.camera_status_events,
  vision.vision_events,
  vision.traffic_hourly,
  vision.station_occupancy_hourly,
  vision.station_live_state,
  vision.business_live_state,
  vision.security_events,
  vision.camera_overview,
  vision.traffic_hourly_local,
  vision.traffic_daily,
  vision.station_occupancy_daily
to authenticated;

-- El motor de visión (service_role) escribe resultados.
grant all on all tables in schema vision to service_role;
grant usage, select on all sequences in schema vision to service_role;

-- Funciones que la app puede llamar.
grant execute on function
  vision.member_role(uuid),
  vision.is_member(uuid),
  vision.can_manage(uuid),
  vision.is_owner(uuid),
  vision.business_site(uuid),
  vision.camera_site(uuid),
  vision.station_site(uuid),
  vision.is_valid_point(jsonb),
  vision.is_valid_polygon(jsonb),
  vision.my_memberships(),
  vision.list_members(uuid),
  vision.add_member_by_email(uuid, text, text, text),
  vision.review_security_event(bigint, text, text)
to authenticated;

grant execute on all functions in schema vision to service_role;
-- bootstrap_owner: deliberadamente SIN grant para authenticated.

-- Que PostgREST recargue el esquema.
notify pgrst, 'reload schema';
