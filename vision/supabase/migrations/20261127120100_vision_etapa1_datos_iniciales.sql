-- =====================================================================
-- SMART BUSINESS VISION AI — ETAPA 1: DATOS INICIALES
-- Migración: 20261127120100_vision_etapa1_datos_iniciales.sql
-- =====================================================================
-- Solo datos CONFIRMADOS por el propietario. No se inventan estaciones,
-- empleados, horarios ni métricas:
--   * 1 establecimiento.
--   * 2 negocios: Good Barber y Glamour Studio.
--   * Horario de Good Barber (confirmado):
--       lunes a viernes 14:00–20:00, sábado 11:00–20:00, domingo cerrado.
--   * Horario de Glamour Studio: SIN registrar (pendiente de confirmar).
--   * 2 cámaras TP-Link Tapo C100, una por negocio, con el análisis
--     desactivado (todavía no existe conexión RTSP validada).
--   * Ninguna estación: el propietario las crea desde Configuración.
--
-- Idempotente: si ya existe el establecimiento, no duplica nada.
-- =====================================================================

do $$
declare
  v_site uuid;
  v_gb uuid;
  v_gs uuid;
begin
  select id into v_site from vision.sites order by created_at limit 1;
  if v_site is null then
    insert into vision.sites (name, timezone)
    values ('Establecimiento Good Barber · Glamour Studio', 'America/Mexico_City')
    returning id into v_site;
  end if;

  insert into vision.businesses (site_id, slug, name, accent_color, hours_confirmed, sort_order)
  values (v_site, 'good-barber', 'Good Barber', '#d4a24e', true, 1)
  on conflict (site_id, slug) do nothing;

  insert into vision.businesses (site_id, slug, name, accent_color, hours_confirmed, sort_order)
  values (v_site, 'glamour-studio', 'Glamour Studio', '#d98bb0', false, 2)
  on conflict (site_id, slug) do nothing;

  select id into v_gb from vision.businesses where site_id = v_site and slug = 'good-barber';
  select id into v_gs from vision.businesses where site_id = v_site and slug = 'glamour-studio';

  -- Horario confirmado de Good Barber (0 = domingo … 6 = sábado).
  insert into vision.business_hours (business_id, weekday, is_closed, opens_at, closes_at) values
    (v_gb, 0, true,  null,    null),
    (v_gb, 1, false, '14:00', '20:00'),
    (v_gb, 2, false, '14:00', '20:00'),
    (v_gb, 3, false, '14:00', '20:00'),
    (v_gb, 4, false, '14:00', '20:00'),
    (v_gb, 5, false, '14:00', '20:00'),
    (v_gb, 6, false, '11:00', '20:00')
  on conflict (business_id, weekday) do nothing;

  -- Una cámara por negocio (solo si el negocio aún no tiene ninguna).
  if not exists (select 1 from vision.cameras where business_id = v_gb) then
    insert into vision.cameras (business_id, name, model, analysis_enabled, sort_order)
    values (v_gb, 'Cámara Good Barber', 'TP-Link Tapo C100', false, 1);
  end if;
  if not exists (select 1 from vision.cameras where business_id = v_gs) then
    insert into vision.cameras (business_id, name, model, analysis_enabled, sort_order)
    values (v_gs, 'Cámara Glamour Studio', 'TP-Link Tapo C100', false, 1);
  end if;
end;
$$;
