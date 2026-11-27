-- Pruebas de RLS y reglas del esquema `vision`. Cada bloque falla con
-- RAISE EXCEPTION si una regla de seguridad no se cumple.

-- ---------- Preparación (como postgres) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a3', 'viewer@test.local'),
  ('00000000-0000-0000-0000-0000000000a4', 'ajeno@test.local')
on conflict do nothing;

select vision.bootstrap_owner('owner@test.local', 'Propietario');

-- Datos iniciales esperados
do $$ begin
  if (select count(*) from vision.businesses) <> 2 then raise exception 'Se esperaban 2 negocios'; end if;
  if (select count(*) from vision.cameras) <> 2 then raise exception 'Se esperaban 2 cámaras'; end if;
  if exists (select 1 from vision.cameras where model <> 'TP-Link Tapo C110') then raise exception 'Las cámaras deben ser Tapo C110'; end if;
  if (select count(*) from vision.stations) <> 0 then raise exception 'No deben existir estaciones inventadas'; end if;
  if (select count(*) from vision.business_hours bh join vision.businesses b on b.id = bh.business_id where b.slug = 'glamour-studio') <> 0
    then raise exception 'Glamour Studio no debe tener horario inventado'; end if;
  if (select count(*) from vision.business_hours bh join vision.businesses b on b.id = bh.business_id where b.slug = 'good-barber') <> 7
    then raise exception 'Good Barber debe tener los 7 días'; end if;
  if (select count(*) from vision.traffic_hourly) + (select count(*) from vision.vision_events) <> 0
    then raise exception 'No deben existir métricas inventadas'; end if;
end $$;

-- ---------- anon: sin acceso a nada ----------
set role anon;
do $$ begin
  begin
    perform 1 from vision.businesses;
    raise exception 'FALLO: anon pudo leer businesses';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- Usuario autenticado SIN membresía (p. ej. un barbero de la app de Good Barber) ----------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a4';
do $$ begin
  if (select count(*) from vision.businesses) <> 0 then raise exception 'FALLO: ajeno ve negocios'; end if;
  if (select count(*) from vision.sites) <> 0 then raise exception 'FALLO: ajeno ve sitios'; end if;
  if (select count(*) from vision.my_memberships()) <> 0 then raise exception 'FALLO: ajeno tiene membresía'; end if;
end $$;
reset role;

-- Intento directo de auto-asignarse propietario con el id real del sitio
do $$
declare v_site uuid := (select id from vision.sites limit 1);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a4', true);
  begin
    insert into vision.members (site_id, user_id, role) values (v_site, '00000000-0000-0000-0000-0000000000a4', 'owner');
    raise exception 'FALLO: ajeno se autoasignó propietario';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.add_member_by_email(v_site, 'ajeno@test.local', 'owner');
    raise exception 'FALLO: ajeno usó add_member_by_email';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.list_members(v_site);
    raise exception 'FALLO: ajeno listó miembros';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.bootstrap_owner('ajeno@test.local');
    raise exception 'FALLO: authenticated pudo ejecutar bootstrap_owner';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Propietario: alta de admin y viewer ----------
do $$
declare v_site uuid := (select id from vision.sites limit 1);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  perform vision.add_member_by_email(v_site, 'admin@test.local', 'admin', 'Admin');
  perform vision.add_member_by_email(v_site, 'VIEWER@test.local', 'viewer', null);
  if (select count(*) from vision.list_members(v_site)) <> 3 then raise exception 'FALLO: se esperaban 3 miembros'; end if;
  begin
    perform vision.add_member_by_email(v_site, 'noexiste@test.local', 'viewer');
    raise exception 'FALLO: aceptó correo inexistente';
  exception when no_data_found then null;
  end;
  -- No se puede degradar al último propietario
  begin
    update vision.members set role = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FALLO: se degradó al último propietario';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Admin: configura, pero no administra usuarios ----------
do $$
declare
  v_site uuid := (select id from vision.sites limit 1);
  v_gb uuid := (select id from vision.businesses where slug = 'good-barber');
  v_gs uuid := (select id from vision.businesses where slug = 'glamour-studio');
  v_cam_gs uuid := (select id from vision.cameras where business_id = (select id from vision.businesses where slug = 'glamour-studio'));
  v_n integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  insert into vision.stations (business_id, name, kind) values (v_gb, 'Silla de prueba', 'silla');
  update vision.business_hours set opens_at = '14:00' where business_id = v_gb and weekday = 1;
  -- Una cámara puede observar estaciones del otro negocio del MISMO establecimiento (C110 que ve ambos espacios)
  insert into vision.stations (business_id, camera_id, name) values (v_gb, v_cam_gs, 'Cruce mismo sitio');
  delete from vision.stations where name = 'Cruce mismo sitio';
  -- Línea de conteo de una cámara de Glamour que cuenta para Good Barber
  insert into vision.counting_lines (camera_id, business_id, name, point_a, point_b, entry_side)
  values (v_cam_gs, v_gb, 'Puerta GB vista por cámara GS', '[0.1,0.5]', '[0.4,0.5]', 'left');
  delete from vision.counting_lines where name = 'Puerta GB vista por cámara GS';
  -- Zona inválida
  begin
    insert into vision.stations (business_id, name, zone) values (v_gb, 'Zona mala', '[[0,0],[2,0],[0,1]]');
    raise exception 'FALLO: aceptó zona fuera de rango';
  exception when check_violation then null;
  end;
  -- Horario inválido (cierra antes de abrir)
  begin
    insert into vision.business_hours (business_id, weekday, is_closed, opens_at, closes_at) values (v_gs, 1, false, '20:00', '10:00');
    raise exception 'FALLO: aceptó horario invertido';
  exception when check_violation then null;
  end;
  begin
    perform vision.add_member_by_email(v_site, 'ajeno@test.local', 'viewer');
    raise exception 'FALLO: admin administró usuarios';
  exception when insufficient_privilege then null;
  end;
  update vision.members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000000a2';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO: admin se ascendió a propietario'; end if;
  -- No puede escribir resultados del motor
  begin
    insert into vision.traffic_hourly (camera_id, business_id, hour_start, entries)
    values (v_cam_gs, v_gs, date_trunc('hour', now()), 99);
    raise exception 'FALLO: admin insertó métricas';
  exception when insufficient_privilege then null;
  end;
  begin
    update vision.security_events set status = 'dismissed';
    raise exception 'FALLO: UPDATE directo de security_events permitido';
  exception when insufficient_privilege then null;
  end;
  -- No puede borrar negocios
  begin
    delete from vision.businesses where id = v_gs;
    raise exception 'FALLO: admin borró un negocio';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Motor de visión (service_role) escribe resultados ----------
do $$
declare
  v_gb uuid := (select id from vision.businesses where slug = 'good-barber');
  v_cam uuid := (select id from vision.cameras where business_id = (select id from vision.businesses where slug = 'good-barber'));
begin
  execute 'set local role service_role';
  insert into vision.traffic_hourly (camera_id, business_id, hour_start, entries, exits, observed_seconds)
  values (v_cam, v_gb, '2026-11-27 21:00:00+00', 4, 3, 3600);
  insert into vision.security_events (business_id, camera_id, category, kind, occurred_at)
  values (v_gb, v_cam, 'analysis_alert', 'after_hours_presence', now());
end $$;

-- ---------- Viewer: solo lectura ----------
do $$
declare
  v_gb uuid := (select id from vision.businesses where slug = 'good-barber');
  v_n integer;
  v_event bigint := (select id from vision.security_events limit 1);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  if (select count(*) from vision.businesses) <> 2 then raise exception 'FALLO: viewer no ve negocios'; end if;
  if (select entries from vision.traffic_daily where business_id = v_gb) <> 4 then raise exception 'FALLO: vista diaria'; end if;
  -- 21:00 UTC = 15:00 en America/Mexico_City
  if (select local_hour from vision.traffic_hourly_local where business_id = v_gb) <> 15 then raise exception 'FALLO: hora local'; end if;
  update vision.businesses set name = 'Hackeado' where id = v_gb;
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO: viewer editó un negocio'; end if;
  begin
    insert into vision.stations (business_id, name) values (v_gb, 'Viewer');
    raise exception 'FALLO: viewer creó estación';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.review_security_event(v_event, 'dismissed', null);
    raise exception 'FALLO: viewer revisó un evento';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Admin revisa un evento de seguridad ----------
do $$
declare v_event bigint := (select id from vision.security_events limit 1);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  perform vision.review_security_event(v_event, 'acknowledged', 'Revisado en la app Tapo');
end $$;
do $$ begin
  if (select status from vision.security_events limit 1) <> 'acknowledged' then raise exception 'FALLO: revisión no guardada'; end if;
  if (select reviewed_by from vision.security_events limit 1) <> '00000000-0000-0000-0000-0000000000a2' then raise exception 'FALLO: reviewed_by'; end if;
end $$;

-- ---------- Historial protegido: no se borra una cámara con métricas ----------
do $$
declare v_cam uuid := (select id from vision.cameras where business_id = (select id from vision.businesses where slug = 'good-barber'));
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    delete from vision.cameras where id = v_cam;
    raise exception 'FALLO: se borró una cámara con historial';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------- Zona horaria inválida ----------
do $$ begin
  begin
    update vision.sites set timezone = 'Marte/Olympus';
    raise exception 'FALLO: aceptó zona horaria inválida';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- Borrar en Auth la cuenta del único propietario no debe fallar ----------
do $$ begin
  begin
    delete from auth.users where email = 'owner@test.local';
    if exists (select 1 from vision.members where user_id = '00000000-0000-0000-0000-0000000000a1') then
      raise exception 'FALLO: la membresía no se borró en cascada';
    end if;
    raise exception 'rollback_ok';
  exception when raise_exception then
    if sqlerrm <> 'rollback_ok' then raise; end if;
  end;
  if not exists (select 1 from auth.users where email = 'owner@test.local') then
    raise exception 'FALLO: el bloque de prueba no revirtió';
  end if;
end $$;

-- ---------- Cámara de OTRO establecimiento: nunca ----------
do $$
declare v_site2 uuid; v_biz2 uuid; v_gb uuid := (select id from vision.businesses where slug = 'good-barber'); v_cam2 uuid;
begin
  insert into vision.sites (name) values ('Otro local') returning id into v_site2;
  insert into vision.businesses (site_id, slug, name) values (v_site2, 'otro', 'Otro') returning id into v_biz2;
  insert into vision.cameras (business_id, name) values (v_biz2, 'Cámara otro local') returning id into v_cam2;
  begin
    insert into vision.stations (business_id, camera_id, name) values (v_gb, v_cam2, 'Cruce de sitios');
    raise exception 'FALLO: aceptó cámara de otro establecimiento';
  exception when check_violation then null;
  end;
  begin
    insert into vision.counting_lines (camera_id, business_id, name, point_a, point_b, entry_side) values (v_cam2, v_gb, 'x', '[0.1,0.5]', '[0.4,0.5]', 'left');
    raise exception 'FALLO: línea con negocio de otro establecimiento';
  exception when check_violation then null;
  end;
  delete from vision.cameras where id = v_cam2;
  delete from vision.businesses where id = v_biz2;
  delete from vision.sites where id = v_site2;
end $$;

-- ---------- Motor de visión: usuario con permisos mínimos (nunca service_role) ----------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'vision_engine_prueba') then
    create role vision_engine_prueba login in role vision_engine;
  end if;
end $$;

do $$
declare
  v_gb uuid := (select id from vision.businesses where slug = 'good-barber');
  v_cam uuid := (select id from vision.cameras where business_id = (select id from vision.businesses where slug = 'good-barber'));
  v_n integer;
begin
  execute 'set local role vision_engine_prueba';
  -- Lee la configuración que necesita
  if (select count(*) from vision.cameras) <> 2 then raise exception 'FALLO: el motor no lee cámaras'; end if;
  perform 1 from vision.business_hours limit 1;
  -- Escribe resultados (incluye columnas identity y upsert)
  insert into vision.engine_nodes (id, site_id, version, last_heartbeat_at)
  select 'motor-prueba', id, '0.0', now() from vision.sites limit 1
  on conflict (id) do update set last_heartbeat_at = excluded.last_heartbeat_at;
  insert into vision.camera_health (camera_id, status, last_seen_at) values (v_cam, 'online', now())
  on conflict (camera_id) do update set status = excluded.status, last_seen_at = excluded.last_seen_at;
  insert into vision.camera_status_events (camera_id, status, occurred_at) values (v_cam, 'online', now());
  insert into vision.vision_events (business_id, camera_id, event_type, occurred_at, track_ref, confidence)
  values (v_gb, v_cam, 'line_entry', now(), 't-1', 0.9);
  insert into vision.traffic_hourly (camera_id, business_id, hour_start, entries, observed_seconds)
  values (v_cam, v_gb, '2026-11-28 18:00:00+00', 1, 600)
  on conflict (camera_id, business_id, hour_start) do update set entries = vision.traffic_hourly.entries + 1;
  insert into vision.security_events (business_id, camera_id, category, kind, occurred_at)
  values (v_gb, v_cam, 'unconfirmed', 'after_hours_motion', now());
  -- Prohibido: miembros, configuración, borrar, revisar eventos, auth
  begin
    perform 1 from vision.members;
    raise exception 'FALLO: el motor lee members';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.list_members((select id from vision.sites limit 1));
    raise exception 'FALLO: el motor ejecuta list_members';
  exception when insufficient_privilege then null;
  end;
  begin
    update vision.businesses set name = 'X';
    raise exception 'FALLO: el motor cambia la configuración';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into vision.stations (business_id, name) values (v_gb, 'Motor');
    raise exception 'FALLO: el motor crea estaciones';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from vision.traffic_hourly;
    raise exception 'FALLO: el motor borra métricas';
  exception when insufficient_privilege then null;
  end;
  begin
    update vision.security_events set status = 'dismissed';
    raise exception 'FALLO: el motor revisa eventos de seguridad';
  exception when insufficient_privilege then null;
  end;
  begin
    perform vision.review_security_event(1, 'dismissed', null);
    raise exception 'FALLO: el motor ejecuta review_security_event';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from auth.users;
    raise exception 'FALLO: el motor lee auth.users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from vision.employees;
    raise exception 'FALLO: el motor lee empleados';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Los usuarios de la app no heredan permisos del motor
do $$ begin
  if pg_has_role('authenticated', 'vision_engine', 'member') or pg_has_role('anon', 'vision_engine', 'member') then
    raise exception 'FALLO: authenticated/anon heredan del motor';
  end if;
end $$;

-- ---------- Registro público bloqueado (GoTrue inserta como supabase_auth_admin) ----------
do $$ begin
  execute 'set local role supabase_auth_admin';
  begin
    insert into auth.users (email) values ('intruso@test.local');
    raise exception 'FALLO: el registro público creó una cuenta';
  exception when insufficient_privilege then null;
  end;
  -- La API de administración puede crear cuentas marcadas
  insert into auth.users (email, raw_app_meta_data) values ('aprovisionado@test.local', '{"vision_provisioned": true}');
  delete from auth.users where email = 'aprovisionado@test.local';
end $$;

-- ---------- Diagnóstico de red: solo owner/admin; el motor y viewer no ----------
do $$
declare v_site uuid := (select id from vision.sites limit 1);
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
  insert into vision.network_checks (site_id, public_ipv4, wan_ip_modem, verdict) values (v_site, '189.200.10.5', '100.72.1.1', 'cgnat');
  if (select count(*) from vision.network_checks) <> 1 then raise exception 'FALLO: admin no ve su diagnóstico'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a3', true);
  if (select count(*) from vision.network_checks) <> 0 then raise exception 'FALLO: viewer ve diagnósticos de red'; end if;
  begin
    insert into vision.network_checks (site_id, verdict) values (v_site, 'incompleto');
    raise exception 'FALLO: viewer insertó diagnóstico';
  exception when insufficient_privilege then null;
  end;
end $$;
do $$ begin
  execute 'set local role vision_engine_prueba';
  begin
    perform 1 from vision.network_checks;
    raise exception 'FALLO: el motor lee diagnósticos de red';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'RLS OK' as resultado;
-- (fin)
