-- =====================================================================
-- SMART BUSINESS VISION AI — POLÍTICAS SEPARADAS POR ACCIÓN E ÍNDICES
-- Migración: 20261127130200_vision_politicas_e_indices.sql
-- =====================================================================
-- Recomendación del Performance Advisor de Supabase:
--   * Las políticas `*_write FOR ALL` se solapaban con `*_select` en SELECT.
--     Se reemplazan por políticas INSERT / UPDATE / DELETE con EXACTAMENTE la
--     misma condición (can_manage). Lectura: sigue siendo `*_select`
--     (is_member). Quién puede hacer qué NO cambia.
--   * Índices para las llaves foráneas sin índice.
-- Idempotente.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('business_hours', 'vision.can_manage(vision.business_site(business_id))'),
      ('cameras',        'vision.can_manage(vision.business_site(business_id))'),
      ('stations',       'vision.can_manage(vision.business_site(business_id))'),
      ('counting_lines', 'vision.can_manage(vision.camera_site(camera_id))'),
      ('employees',      'vision.can_manage(site_id)'),
      ('service_types',  'vision.can_manage(vision.business_site(business_id))'),
      ('service_logs',   'vision.can_manage(vision.business_site(business_id))')
    ) as t(tabla, condicion)
  loop
    execute format('drop policy if exists %I on vision.%I', r.tabla || '_write', r.tabla);
    execute format('drop policy if exists %I on vision.%I', r.tabla || '_insert', r.tabla);
    execute format('drop policy if exists %I on vision.%I', r.tabla || '_update', r.tabla);
    execute format('drop policy if exists %I on vision.%I', r.tabla || '_delete', r.tabla);
    execute format('create policy %I on vision.%I for insert to authenticated with check (%s)', r.tabla || '_insert', r.tabla, r.condicion);
    execute format('create policy %I on vision.%I for update to authenticated using (%s) with check (%s)', r.tabla || '_update', r.tabla, r.condicion, r.condicion);
    execute format('create policy %I on vision.%I for delete to authenticated using (%s)', r.tabla || '_delete', r.tabla, r.condicion);
  end loop;
end;
$$;

create index if not exists employees_business_idx on vision.employees(business_id);
create index if not exists employees_site_idx on vision.employees(site_id);
create index if not exists engine_nodes_site_idx on vision.engine_nodes(site_id);
create index if not exists security_events_camera_idx on vision.security_events(camera_id);
create index if not exists security_events_reviewed_by_idx on vision.security_events(reviewed_by);
create index if not exists service_logs_created_by_idx on vision.service_logs(created_by);
create index if not exists service_logs_employee_idx on vision.service_logs(employee_id);
create index if not exists service_logs_service_type_idx on vision.service_logs(service_type_id);
create index if not exists service_logs_station_idx on vision.service_logs(station_id);
create index if not exists vision_events_camera_idx on vision.vision_events(camera_id);
create index if not exists vision_events_line_idx on vision.vision_events(line_id);
create index if not exists vision_events_station_idx on vision.vision_events(station_id);

notify pgrst, 'reload schema';
