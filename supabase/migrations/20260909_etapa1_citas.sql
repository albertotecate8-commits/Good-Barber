-- =========================================================
-- GOOD BARBER — ETAPA 1: SISTEMA CENTRAL DE CITAS
-- =========================================================
-- APLICADA en producción el 2026-09-09 sobre el proyecto sisgfnykjzovnaxylxyq,
-- en 11 migraciones aisladas (etapa1_a … etapa1_k) para poder localizar
-- con precisión cualquier fallo. Este archivo es el equivalente consolidado.
--
-- Principios de esta migración:
--   * 100% ADITIVA. No borra ninguna tabla, columna ni política existente.
--   * No toca la lógica financiera (service_records, weekly_periods,
--     settlements, daily_promotions, settings de reparto 60/40).
--   * Las citas (appointments) y los registros de trabajo (service_records)
--     son cosas DISTINTAS y viven en tablas distintas. Una cita completada
--     GENERA un service_record; nunca se mezclan.
--   * La protección anti doble reserva vive en PostgreSQL, no en JavaScript.
--
-- CAMBIOS DE COMPORTAMIENTO EXISTENTE (los 3 únicos, ver reporte):
--   1. clients.barber_id pasa a ser NULLABLE y cambia de significado:
--      de "dueño del cliente" a "barbero que lo registró".
--   2. La política clients_select se amplía: el barbero ve los clientes que
--      registró Y los que tienen cita/servicio con él (antes: solo los suyos).
--   3. El trigger enforce_service_record_client_owner deja de exigir que el
--      cliente pertenezca al barbero (incompatible con cliente compartido);
--      sigue exigiendo que el cliente exista.
-- =========================================================

-- Necesaria para poder combinar "barber_id WITH =" y "rango WITH &&"
-- dentro de la misma restricción de exclusión.
create extension if not exists btree_gist;

-- =========================================================
-- 20.1  NORMALIZACIÓN DE TELÉFONO + CLIENTE ÚNICO POR BARBERÍA
-- =========================================================

-- Deja solo dígitos: "+52 (664) 123-4567" -> "526641234567".
-- IMMUTABLE porque se usa en una columna generada y en un índice.
-- search_path fijo: sin esto, un rol capaz de crear objetos en el esquema
-- public podría suplantar a regexp_replace. Lo detectó el linter de Supabase.
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$$;

-- barber_id deja de ser obligatorio: una reserva pública crea el cliente sin
-- barbero "dueño". Se conserva la columna (y los datos existentes) como
-- "quién lo registró", para no romper el panel del barbero.
alter table public.clients alter column barber_id drop not null;

alter table public.clients add column if not exists phone_normalized text
  generated always as (public.normalize_phone(phone)) stored;

alter table public.clients add column if not exists email text;

-- Un teléfono = un cliente en toda la barbería (la deduplicación que pediste).
create unique index if not exists uq_clients_phone_normalized
  on public.clients(phone_normalized)
  where phone_normalized is not null;

-- =========================================================
-- 20.2  CAMPOS PÚBLICOS DE BARBEROS Y SERVICIOS
-- =========================================================

alter table public.barbers add column if not exists photo_url text;
alter table public.barbers add column if not exists bio text;
alter table public.barbers add column if not exists public_visible boolean not null default true;

alter table public.services add column if not exists description text;
alter table public.services add column if not exists icon text;
alter table public.services add column if not exists public_visible boolean not null default true;

-- La duración es obligatoria para poder calcular disponibilidad. Se asignan
-- las duraciones iniciales POR SERVICIO (no un valor único para todos),
-- emparejando por nombre con los servicios que ya existen en la base. No se
-- crea ningún servicio nuevo. Todas son editables después desde el panel.
update public.services set duration_minutes = v.minutes
from (values
  ('Corte de cabello', 30),
  ('Arreglo de barba', 15),
  ('Arreglo de ceja', 10),
  ('Corte + barba', 45),
  ('Corte + cejas', 40),
  ('Corte + barba + cejas', 60)
) as v(name, minutes)
where public.services.name = v.name;

-- Cualquier servicio que exista y no esté en la lista anterior no se queda
-- sin duración (haría imposible calcular sus horarios).
update public.services set duration_minutes = 30 where duration_minutes is null;

alter table public.services alter column duration_minutes set default 30;
alter table public.services alter column duration_minutes set not null;
alter table public.services drop constraint if exists services_duration_valid;
alter table public.services add constraint services_duration_valid
  check (duration_minutes > 0 and duration_minutes <= 480);

-- =========================================================
-- 20.3  CONFIGURACIÓN PÚBLICA (todo administrable, nada hardcodeado)
-- =========================================================

alter table public.settings add column if not exists tagline text default 'Mejora tu estilo';
alter table public.settings add column if not exists logo_url text;
alter table public.settings add column if not exists hero_image_url text;
alter table public.settings add column if not exists address text;
alter table public.settings add column if not exists phone text;
alter table public.settings add column if not exists whatsapp text;
alter table public.settings add column if not exists instagram text;
alter table public.settings add column if not exists promo_text text;
alter table public.settings add column if not exists promo_active boolean not null default false;
-- Interruptor general: si se apaga, la web pública deja de aceptar reservas.
alter table public.settings add column if not exists booking_enabled boolean not null default true;
-- Granularidad de los INICIOS de cita que se le ofrecen al cliente (minutos).
-- Con 15: 4:00, 4:15, 4:30, 4:45… La duración real de la cita la marca el
-- servicio, no este valor.
alter table public.settings add column if not exists slot_minutes integer not null default 15;
-- Cuántos días hacia adelante se puede reservar.
alter table public.settings add column if not exists max_days_ahead integer not null default 30;
-- Antelación mínima: no se puede reservar dentro de las próximas N horas.
alter table public.settings add column if not exists min_hours_notice integer not null default 1;

alter table public.settings drop constraint if exists settings_slot_minutes_valid;
alter table public.settings add constraint settings_slot_minutes_valid
  check (slot_minutes between 5 and 240);
alter table public.settings drop constraint if exists settings_max_days_ahead_valid;
alter table public.settings add constraint settings_max_days_ahead_valid
  check (max_days_ahead between 1 and 365);

-- =========================================================
-- 20.4  HORARIOS DE TRABAJO Y BLOQUEOS
-- =========================================================

-- Horario semanal recurrente. Se permiten varias filas por día para turnos
-- partidos (ej. 10:00-14:00 y 16:00-20:00).
-- weekday sigue la convención de PostgreSQL: 0=domingo … 6=sábado.
create table if not exists public.barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint barber_schedules_time_valid check (end_time > start_time)
);
create index if not exists idx_barber_schedules_barber on public.barber_schedules(barber_id, weekday);

drop trigger if exists trg_barber_schedules_updated_at on public.barber_schedules;
create trigger trg_barber_schedules_updated_at
  before update on public.barber_schedules
  for each row execute function public.set_updated_at();

-- Bloqueos puntuales: vacaciones, comida, día festivo, hueco cerrado.
-- barber_id NULL = bloqueo para toda la barbería.
create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid references public.barbers(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint schedule_blocks_time_valid check (ends_at > starts_at)
);
create index if not exists idx_schedule_blocks_barber_time on public.schedule_blocks(barber_id, starts_at, ends_at);
create index if not exists idx_schedule_blocks_created_by on public.schedule_blocks(created_by);

-- Punto de partida para que la agenda funcione desde el primer día:
-- Lunes a Sábado, 11:00-20:00, solo para barberos que aún no tengan horario.
-- El administrador lo cambia después desde el panel (Etapa 2).
insert into public.barber_schedules (barber_id, weekday, start_time, end_time)
select b.id, d.weekday, '11:00'::time, '20:00'::time
from public.barbers b
cross join (values (1),(2),(3),(4),(5),(6)) as d(weekday)
where not exists (select 1 from public.barber_schedules s where s.barber_id = b.id);

-- =========================================================
-- 20.5  APPOINTMENTS — LA AGENDA ÚNICA CENTRAL
-- =========================================================

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  service_id uuid not null references public.services(id) on delete restrict,

  -- Snapshot al momento de reservar: si mañana cambia el precio del catálogo,
  -- esta cita conserva lo que se le prometió al cliente.
  service_name text not null,
  price_cents integer not null check (price_cents >= 0),
  duration_minutes integer not null check (duration_minutes > 0),

  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Rango [inicio, fin): 4:00-4:30 y 4:30-5:00 NO se solapan; 4:00-4:30 y
  -- 4:15-4:45 SÍ. Es la columna sobre la que actúa la restricción de exclusión.
  time_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'public'
    check (source in ('public', 'admin', 'barber')),
  booking_code text not null unique,

  -- Copia de los datos de contacto tal como los dio el cliente al reservar.
  client_name text not null,
  client_phone text,
  client_email text,
  notes text,

  -- Enlace 1:1 con el registro financiero. UNIQUE = una cita nunca puede
  -- generar dos service_records.
  service_record_id uuid unique references public.service_records(id) on delete set null,

  created_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint appointments_time_valid check (ends_at > starts_at)
);

create index if not exists idx_appointments_barber_start on public.appointments(barber_id, starts_at);
create index if not exists idx_appointments_client on public.appointments(client_id);
create index if not exists idx_appointments_service on public.appointments(service_id);
create index if not exists idx_appointments_status_start on public.appointments(status, starts_at);
create index if not exists idx_appointments_created_by on public.appointments(created_by);

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- ANTI DOBLE RESERVA — la autoridad final es la base de datos
-- ---------------------------------------------------------
-- Es FÍSICAMENTE IMPOSIBLE que dos citas activas del mismo barbero se
-- solapen, sin importar quién las cree: web pública, panel de admin, panel
-- del barbero o una llamada directa a la API. Las canceladas y los no_show
-- no bloquean el horario.
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (barber_id with =, time_range with &&)
  where (status in ('pending', 'confirmed', 'completed'));

-- =========================================================
-- 20.6  COLA DE NOTIFICACIONES (preparada, sin integrar nada)
-- =========================================================
-- Aquí se encolan los mensajes. NO hay ninguna integración de WhatsApp
-- todavía: nadie consume esta cola. Cuando se conecte un proveedor, solo
-- habrá que leer las filas 'pending' y marcarlas 'sent'.
create table if not exists public.notification_queue (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmation', 'reminder', 'cancellation', 'reschedule')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms', 'email')),
  recipient_phone text,
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  scheduled_for timestamptz not null default now(),
  attempts integer not null default 0,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_notification_queue_pending
  on public.notification_queue(status, scheduled_for) where status = 'pending';
create index if not exists idx_notification_queue_appointment
  on public.notification_queue(appointment_id);

create or replace function public.enqueue_appointment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notification_queue (appointment_id, kind, recipient_phone, payload)
    values (new.id, 'confirmation', new.client_phone,
            jsonb_build_object('booking_code', new.booking_code, 'starts_at', new.starts_at,
                               'service', new.service_name, 'client_name', new.client_name));
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    insert into public.notification_queue (appointment_id, kind, recipient_phone, payload)
    values (new.id, 'cancellation', new.client_phone,
            jsonb_build_object('booking_code', new.booking_code, 'starts_at', new.starts_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_appointment_notification on public.appointments;
create trigger trg_enqueue_appointment_notification
  after insert or update on public.appointments
  for each row execute function public.enqueue_appointment_notification();

-- =========================================================
-- 20.7  CITA COMPLETADA -> REGISTRO FINANCIERO (sin duplicar)
-- =========================================================
-- El trigger existente enforce_service_record_client_owner exigía que el
-- cliente perteneciera al barbero. Con cliente compartido por barbería eso
-- ya no aplica; se conserva la validación de que el cliente exista.
create or replace function public.enforce_service_record_client_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null then
    if not exists (select 1 from public.clients where id = new.client_id) then
      raise exception 'El cliente indicado no existe.';
    end if;
  end if;
  return new;
end;
$$;

-- Al marcar una cita como 'completed' se crea su service_record y se enlaza.
-- La columna service_record_id es UNIQUE y aquí se comprueba antes de
-- insertar: doble protección contra generar dos registros de la misma cita.
create or replace function public.appointment_to_service_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_tz text;
  v_local timestamp;
begin
  -- Blindaje: una vez enlazado el registro financiero, ese enlace no se puede
  -- borrar ni cambiar. Sin esto, alguien podría hacer
  -- UPDATE ... SET service_record_id = null, status = 'completed'
  -- y generar un SEGUNDO service_record de la misma cita (dinero duplicado).
  if old.service_record_id is not null
     and new.service_record_id is distinct from old.service_record_id then
    raise exception 'El registro de servicio de esta cita ya fue generado y no puede modificarse.';
  end if;

  -- Una vez completada, los datos que ya se convirtieron en dinero quedan
  -- congelados: cambiarlos dejaría la cita y su service_record inconsistentes.
  if old.status = 'completed'
     and (new.price_cents is distinct from old.price_cents
       or new.duration_minutes is distinct from old.duration_minutes
       or new.starts_at is distinct from old.starts_at
       or new.service_id is distinct from old.service_id) then
    raise exception 'No se puede cambiar el precio, la duración, el servicio ni la fecha de una cita ya completada.';
  end if;

  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  if new.service_record_id is not null then
    return new; -- ya tiene registro: no se duplica
  end if;

  select timezone into v_tz from public.settings where id limit 1;
  v_local := new.starts_at at time zone coalesce(v_tz, 'America/Mexico_City');

  insert into public.service_records (
    barber_id, client_id, service_id, service_name, price_cents,
    quantity, discount_cents, record_date, record_time, status, notes, created_by
  ) values (
    new.barber_id, new.client_id, new.service_id, new.service_name, new.price_cents,
    1, 0, v_local::date, v_local::time, 'completed',
    'Generado desde la cita ' || new.booking_code, auth.uid()
  )
  returning id into v_record_id;

  new.service_record_id := v_record_id;
  new.completed_at := coalesce(new.completed_at, now());
  return new;
end;
$$;

drop trigger if exists trg_appointment_to_service_record on public.appointments;
create trigger trg_appointment_to_service_record
  before update on public.appointments
  for each row execute function public.appointment_to_service_record();

-- =========================================================
-- 20.8  RLS DE LAS TABLAS NUEVAS + AJUSTE DE clients
-- =========================================================

alter table public.appointments enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.notification_queue enable row level security;

-- ---- appointments: el anónimo NUNCA lee ni escribe aquí directamente ----
drop policy if exists appointments_select on public.appointments;
create policy appointments_select on public.appointments
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists appointments_insert on public.appointments;
create policy appointments_insert on public.appointments
  for insert with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists appointments_update on public.appointments;
create policy appointments_update on public.appointments
  for update using ((select public.is_admin()) or barber_id = (select public.current_barber_id()))
  with check ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

-- Sin DELETE: las citas se cancelan (status), no se borran.

-- ---- barber_schedules: el admin configura, el barbero solo consulta ----
drop policy if exists barber_schedules_select on public.barber_schedules;
create policy barber_schedules_select on public.barber_schedules
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()));

drop policy if exists barber_schedules_write_admin on public.barber_schedules;
drop policy if exists barber_schedules_insert_admin on public.barber_schedules;
create policy barber_schedules_insert_admin on public.barber_schedules
  for insert with check ((select public.is_admin()));
drop policy if exists barber_schedules_update_admin on public.barber_schedules;
create policy barber_schedules_update_admin on public.barber_schedules
  for update using ((select public.is_admin()));
drop policy if exists barber_schedules_delete_admin on public.barber_schedules;
create policy barber_schedules_delete_admin on public.barber_schedules
  for delete using ((select public.is_admin()));

-- ---- schedule_blocks ----
drop policy if exists schedule_blocks_select on public.schedule_blocks;
create policy schedule_blocks_select on public.schedule_blocks
  for select using ((select public.is_admin()) or barber_id = (select public.current_barber_id()) or barber_id is null);

drop policy if exists schedule_blocks_insert_admin on public.schedule_blocks;
create policy schedule_blocks_insert_admin on public.schedule_blocks
  for insert with check ((select public.is_admin()));
drop policy if exists schedule_blocks_update_admin on public.schedule_blocks;
create policy schedule_blocks_update_admin on public.schedule_blocks
  for update using ((select public.is_admin()));
drop policy if exists schedule_blocks_delete_admin on public.schedule_blocks;
create policy schedule_blocks_delete_admin on public.schedule_blocks
  for delete using ((select public.is_admin()));

-- ---- notification_queue: solo el admin la ve; se escribe por trigger ----
drop policy if exists notification_queue_select on public.notification_queue;
create policy notification_queue_select on public.notification_queue
  for select using ((select public.is_admin()));

-- ---- clients: cliente compartido, visibilidad por relación ----
-- El barbero sigue viendo los clientes que él registró (para que su flujo
-- actual de "nuevo cliente" no cambie) Y ahora también los que tienen cita o
-- servicio con él. El admin ve todos. El anónimo, ninguno.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (
    (select public.is_admin())
    or barber_id = (select public.current_barber_id())
    or exists (
      select 1 from public.service_records sr
      where sr.client_id = clients.id and sr.barber_id = (select public.current_barber_id())
    )
    or exists (
      select 1 from public.appointments a
      where a.client_id = clients.id and a.barber_id = (select public.current_barber_id())
    )
  );

-- INSERT/UPDATE/DELETE de clients se quedan exactamente como estaban.

-- =========================================================
-- 20.9  VISTAS PÚBLICAS (lo único que el anónimo puede leer)
-- =========================================================
-- Se exponen SOLO columnas seguras. En particular NUNCA se expone
-- barbers.default_percentage (el reparto 60/40 es información de negocio).
-- Estas vistas son security definer por diseño: leen la tabla base saltando
-- RLS, pero solo devuelven columnas curadas y filas públicas.

create or replace view public.public_services as
  select id, name, description, icon, price_cents, duration_minutes, sort_order
  from public.services
  where active and public_visible
  order by sort_order;

create or replace view public.public_barbers as
  select b.id, b.name, b.photo_url, b.bio
  from public.barbers b
  join public.profiles p on p.id = b.profile_id
  where b.active and b.public_visible and p.active
  order by b.name;

create or replace view public.public_business as
  select business_name, tagline, logo_url, hero_image_url, address, phone, whatsapp,
         instagram, promo_text, promo_active, booking_enabled, slot_minutes,
         max_days_ahead, min_hours_notice, timezone, currency
  from public.settings
  where id;

-- ---------------------------------------------------------
-- IMPORTANTE (riesgo real cerrado aquí):
-- Supabase concede por defecto ALL sobre los objetos nuevos del esquema
-- public a anon/authenticated. Además, public_services y public_business son
-- vistas AUTO-ACTUALIZABLES (una sola tabla base, sin joins), y al ser
-- security definer escribirían saltándose el RLS de la tabla base. Sin este
-- REVOKE, un anónimo podría hacer UPDATE de precios o DELETE de servicios
-- a través de la vista. Se revoca todo y se concede únicamente SELECT.
-- ---------------------------------------------------------
revoke all on public.public_services from anon, authenticated;
revoke all on public.public_barbers from anon, authenticated;
revoke all on public.public_business from anon, authenticated;

-- Explícito, no confiando en el valor por defecto: las vistas deben leer la
-- tabla base con los permisos de su propietario (así devuelven las filas
-- públicas aunque quien consulte sea anónimo y no pase el RLS).
alter view public.public_services set (security_invoker = false);
alter view public.public_barbers set (security_invoker = false);
alter view public.public_business set (security_invoker = false);

grant select on public.public_services to anon, authenticated;
grant select on public.public_barbers to anon, authenticated;
grant select on public.public_business to anon, authenticated;

-- Defensa en profundidad sobre las tablas nuevas: el RLS ya las protege
-- (sin política aplicable, anon no lee ni escribe), pero se quita también el
-- permiso de tabla que Supabase concede por defecto.
revoke all on public.appointments from anon;
revoke all on public.barber_schedules from anon;
revoke all on public.schedule_blocks from anon;
revoke all on public.notification_queue from anon;
revoke all on public.clients from anon;

-- =========================================================
-- 20.10  FUNCIÓN SEGURA DE DISPONIBILIDAD
-- =========================================================
-- Devuelve ÚNICAMENTE los huecos libres. Nunca revela quién tiene reservado
-- un horario ocupado: los ocupados simplemente no salen en el resultado.
create or replace function public.public_available_slots(
  p_barber_id uuid,
  p_date date,
  p_service_id uuid
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_tz text;
  v_slot_minutes integer;
  v_max_days integer;
  v_min_notice integer;
  v_enabled boolean;
  v_duration integer;
begin
  select timezone, slot_minutes, max_days_ahead, min_hours_notice, booking_enabled
    into v_tz, v_slot_minutes, v_max_days, v_min_notice, v_enabled
  from public.settings where id limit 1;

  if not coalesce(v_enabled, false) then
    return; -- reservas desactivadas por el administrador
  end if;

  -- La fecha debe caer en la ventana permitida por el administrador.
  if p_date < (now() at time zone v_tz)::date
     or p_date > ((now() at time zone v_tz)::date + v_max_days) then
    return;
  end if;

  -- El barbero debe ser público y activo.
  if not exists (select 1 from public.public_barbers where id = p_barber_id) then
    return;
  end if;

  -- El servicio debe ser público y activo.
  select duration_minutes into v_duration
  from public.public_services where id = p_service_id;
  if v_duration is null then
    return;
  end if;

  return query
  with bounds as (
    select
      ((p_date::text || ' ' || s.start_time::text)::timestamp at time zone v_tz) as day_start,
      ((p_date::text || ' ' || s.end_time::text)::timestamp at time zone v_tz)   as day_end
    from public.barber_schedules s
    where s.barber_id = p_barber_id
      and s.active
      and s.weekday = extract(dow from p_date)::smallint
  ),
  candidates as (
    select gs as slot_start, gs + make_interval(mins => v_duration) as slot_end
    from bounds b
    cross join lateral generate_series(
      b.day_start,
      b.day_end - make_interval(mins => v_duration),
      make_interval(mins => v_slot_minutes)
    ) as gs
  )
  select c.slot_start, c.slot_end
  from candidates c
  where c.slot_start >= now() + make_interval(hours => v_min_notice)
    and not exists (
      select 1 from public.appointments a
      where a.barber_id = p_barber_id
        and a.status in ('pending', 'confirmed', 'completed')
        and a.time_range && tstzrange(c.slot_start, c.slot_end, '[)')
    )
    and not exists (
      select 1 from public.schedule_blocks bl
      where (bl.barber_id = p_barber_id or bl.barber_id is null)
        and tstzrange(bl.starts_at, bl.ends_at, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
  order by c.slot_start;
end;
$$;

revoke all on function public.public_available_slots(uuid, date, uuid) from public;
grant execute on function public.public_available_slots(uuid, date, uuid) to anon, authenticated;

-- =========================================================
-- 20.11  RESERVA PÚBLICA (transaccional)
-- =========================================================
create or replace function public.gen_booking_code()
returns text
language sql
volatile
set search_path = public, pg_catalog
as $$
  select 'GB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5))
$$;

-- anon no necesita llamar directamente a estas dos auxiliares: solo se usan
-- desde dentro de book_appointment (que corre como propietario) y desde la
-- columna generada de clients (que evalúa el rol autenticado que inserta).
revoke all on function public.gen_booking_code() from public, anon;
grant execute on function public.gen_booking_code() to authenticated, service_role;

revoke all on function public.normalize_phone(text) from public, anon;
grant execute on function public.normalize_phone(text) to authenticated, service_role;

create or replace function public.book_appointment(
  p_barber_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_client_name text,
  p_client_phone text,
  p_client_email text default null,
  p_notes text default null
)
returns public.appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service public.public_services;
  v_enabled boolean;
  v_phone text;
  v_client_id uuid;
  v_code text;
  v_appt public.appointments;
  v_active_count integer;
  v_tz text;
begin
  select timezone into v_tz from public.settings where id limit 1;
  if coalesce(trim(p_client_name), '') = '' then
    raise exception 'El nombre es obligatorio.';
  end if;

  v_phone := public.normalize_phone(p_client_phone);
  if v_phone is null or length(v_phone) < 8 then
    raise exception 'El teléfono no es válido.';
  end if;

  select booking_enabled into v_enabled from public.settings where id limit 1;
  if not coalesce(v_enabled, false) then
    raise exception 'Las reservas están desactivadas en este momento.';
  end if;

  select * into v_service from public.public_services where id = p_service_id;
  if v_service.id is null then
    raise exception 'El servicio seleccionado no está disponible.';
  end if;

  if not exists (select 1 from public.public_barbers where id = p_barber_id) then
    raise exception 'El barbero seleccionado no está disponible.';
  end if;

  -- El horario tiene que ser uno de los que la función de disponibilidad
  -- ofrece de verdad. Esto impide que alguien invente una hora manualmente.
  if not exists (
    select 1 from public.public_available_slots(
      p_barber_id,
      (p_starts_at at time zone v_tz)::date,
      p_service_id
    ) s
    where s.slot_start = p_starts_at
  ) then
    raise exception 'Ese horario ya no está disponible.';
  end if;

  -- Cliente único por teléfono. La autoridad final es el UNIQUE INDEX sobre
  -- phone_normalized, no este SELECT: si dos reservas simultáneas con el
  -- mismo teléfono pasan a la vez por aquí, ambas verán "no existe" y ambas
  -- intentarán insertar. La que pierda recibe unique_violation, y en vez de
  -- fallar reutiliza el cliente que acaba de crear la otra.
  select id into v_client_id from public.clients where phone_normalized = v_phone;

  if v_client_id is null then
    begin
      insert into public.clients (barber_id, name, phone, email)
      values (null, trim(p_client_name), p_client_phone, p_client_email)
      returning id into v_client_id;
    exception when unique_violation then
      select id into v_client_id from public.clients where phone_normalized = v_phone;
      if v_client_id is null then
        raise exception 'No se pudo registrar el cliente. Inténtalo de nuevo.';
      end if;
    end;
  end if;

  -- Cliente preexistente (o recién ganado por la carrera): NO se sobrescriben
  -- sus datos — cualquiera que conozca un teléfono ajeno podría cambiarle el
  -- nombre o el correo. Solo se rellenan campos vacíos. El nombre que escribió
  -- quien reserva queda igualmente guardado en appointments.client_name.
  update public.clients
     set name  = case when coalesce(trim(name), '') = '' then trim(p_client_name) else name end,
         email = coalesce(email, p_client_email)
   where id = v_client_id;

  -- Freno anti-abuso: máximo 3 citas activas futuras por teléfono.
  select count(*) into v_active_count
  from public.appointments
  where client_id = v_client_id
    and status in ('pending', 'confirmed')
    and starts_at > now();
  if v_active_count >= 3 then
    raise exception 'Ya tienes 3 citas activas. Cancela una antes de reservar otra.';
  end if;

  v_code := public.gen_booking_code();

  begin
    insert into public.appointments (
      barber_id, client_id, service_id, service_name, price_cents, duration_minutes,
      starts_at, ends_at, status, source, booking_code,
      client_name, client_phone, client_email, notes, confirmed_at
    ) values (
      p_barber_id, v_client_id, p_service_id, v_service.name, v_service.price_cents,
      v_service.duration_minutes,
      p_starts_at, p_starts_at + make_interval(mins => v_service.duration_minutes),
      'confirmed', 'public', v_code,
      trim(p_client_name), p_client_phone, p_client_email, p_notes, now()
    )
    returning * into v_appt;
  exception
    when exclusion_violation then
      -- Alguien tomó ese horario entre la consulta y el guardado.
      raise exception 'Ese horario acaba de ser reservado. Elige otro, por favor.';
    when unique_violation then
      raise exception 'No se pudo generar la reserva. Inténtalo de nuevo.';
  end;

  return v_appt;
end;
$$;

revoke all on function public.book_appointment(uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;

-- =========================================================
-- 20.12  STORAGE PARA IMÁGENES (logo, banner, fotos de barberos)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

drop policy if exists "media_admin_insert" on storage.objects;
create policy "media_admin_insert" on storage.objects
  for insert with check (bucket_id = 'media' and (select public.is_admin()));

drop policy if exists "media_admin_update" on storage.objects;
create policy "media_admin_update" on storage.objects
  for update using (bucket_id = 'media' and (select public.is_admin()));

drop policy if exists "media_admin_delete" on storage.objects;
create policy "media_admin_delete" on storage.objects
  for delete using (bucket_id = 'media' and (select public.is_admin()));

-- =========================================================
-- FIN ETAPA 1
-- =========================================================
