# Pendientes y decisiones abiertas

## Decisiones del propietario (bloquean pasos siguientes)

1. **Supabase de Vision**: configurado y probado contra el servicio real
   (`BASE-DE-DATOS.md` §0). Falta solo la configuración del servicio Auth que
   el conector no puede cambiar (interruptor de registro, Site URL/Redirect
   URLs y protección de contraseñas filtradas); ver §0.3. El registro ya está
   bloqueado en la base de datos.
2. **Hosting**: aprobar la creación del proyecto en Cloudflare Pages (gratis).
3. **Modelo de detección**: YOLOX (Apache-2.0) vs. Ultralytics YOLO
   (AGPL-3.0). Ver `ARQUITECTURA.md` §3.
4. **Oracle Cloud Always Free**: aprobar el alta (pide tarjeta para
   verificación; sin "upgrade" a pago).
5. **Zona horaria**: confirmada. El establecimiento está en Durango, México;
   se usa `America/Mexico_City` (UTC−6, sin horario de verano desde 2022),
   igual que la app de Good Barber.
6. **Horario de Glamour Studio**: capturarlo y marcarlo como confirmado en
   Ajustes → Horarios.
7. **Estaciones reales** de cada negocio: darlas de alta en Ajustes → Estaciones.

## Etapa 2 (no iniciada — requiere aprobación)

- Activar la "Cuenta de cámara" en la app Tapo y probar RTSP con VLC en la
  red local, **una cámara primero**.
- Auditoría Izzi: IP pública vs. CGNAT, reenvío de puertos, restricción por
  IP de origen, IPv6. Documentar riesgos antes de abrir nada.
- Viabilidad real de Oracle Always Free (capacidad ARM en la región).

## Pendiente técnico conocido de la Etapa 1

- **Editor de zonas y líneas virtuales**: el modelo (`stations.zone`,
  `counting_lines`) y su validación existen; el editor visual necesita una
  captura real de la cámara (Etapas 2 y 4).
- **Capturas periódicas** en el dashboard: cuando exista conexión validada.
- **Notificaciones push propias**: Etapa 6, probadas en un iPhone real.
- **Reportes diario/semanal/mensual y CSV**: las vistas `traffic_daily` y
  `station_occupancy_daily` ya los soportan; la interfaz es de la Etapa 7.
- **Empleados, tipos de servicio y registro manual**: tablas y RLS listas,
  sin interfaz (Etapa 7). No se inventaron nombres.
- **Retención de `vision_events`**: definir política (p. ej. 90 días) cuando
  haya volumen real, por el límite de 500 MB del plan gratuito.
- **Respaldo**: workflow propio de Vision (propuesta en
  `BASE-DE-DATOS.md` §7). Se crea solo con autorización y con sus secretos.
- **Usuario del motor** (`vision_motor_oracle`, hereda de `vision_engine`):
  se crea en la Etapa 2. Hay que verificar que el pooler de Supabase lo acepte.
- Probar la PWA instalada en el iPhone real (pantalla de inicio, área segura,
  recuperación de contraseña: el enlace debe abrirse en el mismo navegador
  donde se pidió, por el flujo PKCE).
