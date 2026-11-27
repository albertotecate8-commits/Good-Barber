-- =====================================================================
-- SMART BUSINESS VISION AI — ROL DE PERMISOS MÍNIMOS PARA EL MOTOR
-- Migración: 20261127120200_vision_rol_motor.sql
-- =====================================================================
-- El motor de visión (servidor de procesamiento) NUNCA usa la service_role.
-- Se conecta a PostgreSQL con un usuario propio que hereda de este rol
-- (`vision_engine`, sin login), cuyos permisos son exactamente:
--
--   LEER       configuración: sites, businesses, business_hours, cameras,
--              stations, counting_lines.
--   ESCRIBIR   resultados: engine_nodes, camera_health, camera_status_events,
--              vision_events, traffic_hourly, station_occupancy_hourly,
--              station_live_state, business_live_state, security_events.
--   NADA       members, empleados, servicios, auth.*, borrar filas, cambiar
--              configuración, revisar eventos de seguridad.
--
-- El usuario con login (y su contraseña) NO se crea aquí: lo crea el
-- propietario en el SQL Editor (ver docs/BASE-DE-DATOS.md §Motor). Así
-- ninguna contraseña queda en el repositorio.
--
-- Idempotente.
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'vision_engine') then
    create role vision_engine nologin nobypassrls;
  end if;
end;
$$;

comment on role vision_engine is
  'Smart Business Vision: permisos mínimos del motor de visión. Sin login; los usuarios del motor heredan de este rol.';

revoke all on schema vision from vision_engine;
revoke all on all tables in schema vision from vision_engine;
revoke all on all functions in schema vision from vision_engine;
grant usage on schema vision to vision_engine;

-- Configuración: solo lectura.
grant select on
  vision.sites,
  vision.businesses,
  vision.business_hours,
  vision.cameras,
  vision.stations,
  vision.counting_lines
to vision_engine;

-- Resultados con estado (se actualizan con upsert): leer, insertar, actualizar.
grant select, insert, update on
  vision.engine_nodes,
  vision.camera_health,
  vision.traffic_hourly,
  vision.station_occupancy_hourly,
  vision.station_live_state,
  vision.business_live_state
to vision_engine;

-- Bitácoras: solo agregar (security_events también se lee para no duplicar
-- alertas abiertas). Nunca UPDATE ni DELETE: la revisión humana de eventos
-- se hace desde la app.
grant insert on vision.vision_events, vision.camera_status_events to vision_engine;
grant select, insert on vision.security_events to vision_engine;

grant execute on function vision.is_valid_point(jsonb), vision.is_valid_polygon(jsonb) to vision_engine;

-- ---------------------------------------------------------------------
-- RLS: políticas explícitas para el rol del motor (un proyecto = un
-- establecimiento; el motor trabaja para todo el proyecto).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['sites', 'businesses', 'business_hours', 'cameras', 'stations', 'counting_lines'] loop
    execute format('drop policy if exists %I on vision.%I', t || '_engine_select', t);
    execute format('create policy %I on vision.%I for select to vision_engine using (true)', t || '_engine_select', t);
  end loop;

  foreach t in array array['engine_nodes', 'camera_health', 'traffic_hourly', 'station_occupancy_hourly',
                           'station_live_state', 'business_live_state', 'security_events'] loop
    execute format('drop policy if exists %I on vision.%I', t || '_engine_select', t);
    execute format('create policy %I on vision.%I for select to vision_engine using (true)', t || '_engine_select', t);
  end loop;

  foreach t in array array['engine_nodes', 'camera_health', 'traffic_hourly', 'station_occupancy_hourly',
                           'station_live_state', 'business_live_state', 'security_events',
                           'vision_events', 'camera_status_events'] loop
    execute format('drop policy if exists %I on vision.%I', t || '_engine_insert', t);
    execute format('create policy %I on vision.%I for insert to vision_engine with check (true)', t || '_engine_insert', t);
  end loop;

  foreach t in array array['engine_nodes', 'camera_health', 'traffic_hourly', 'station_occupancy_hourly',
                           'station_live_state', 'business_live_state'] loop
    execute format('drop policy if exists %I on vision.%I', t || '_engine_update', t);
    execute format('create policy %I on vision.%I for update to vision_engine using (true) with check (true)', t || '_engine_update', t);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
