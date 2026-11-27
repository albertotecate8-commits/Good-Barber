# Fase 1 — estado por entregable (27 nov 2026)

> **Corrección de inventario:** dos **Tapo C110** (no C100). La primera ve los
> espacios de ambos negocios. Ficha técnica y riesgos: `CONEXION-CAMARAS.md`.

**URL de la app:** https://smart-business-vision.netlify.app (Netlify, plan
gratuito, sitio estático; decisión del propietario ante el bloqueo de
credenciales de Cloudflare).

## Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | App publicada y accesible desde iPhone | **Publicada**; falta verificar en un iPhone real | Rutas 200; cabeceras CSP/HSTS; manifest `application/manifest+json`; E2E en Chromium con emulación de iPhone 14 |
| 2 | Conexión real de Supabase | ✔ | Todas las llamadas del sitio publicado a `mwyerhivkvumsepxynyq` responden 200 |
| 3 | Acceso de propietario | ✔ | Inicio y cierre de sesión, sesión persistente, protección de 4 rutas privadas y contraseña incorrecta rechazada (sitio publicado) |
| 4 | Lectura real de las dos cámaras | **Bloqueado** | Ver «Bloqueos» |
| 5 | Detección de personas | ✔ **con video público**; pendiente con las cámaras | YOLOX-Nano: 17 ms/cuadro (x86, 2 hilos); revisión visual de detecciones |
| 6 | Conteo de entradas y salidas | ✔ lógica + integración; pendiente con las cámaras | 10 pruebas de lógica (anti-duplicados, temblor sobre la línea, cruces fuera del segmento); integración: 10 entradas y 10 salidas escritas por el rol limitado |
| 7 | Ocupación por zonas | ✔ lógica + integración; pendiente con las cámaras | Permanencia, tolerancia de salida, sesiones; editor de zonas probado en el sitio publicado contra la base real |
| 8 | Estadísticas reales en el dashboard | Pendiente | El dashboard ya lee las tablas reales; están vacías porque no hay cámaras conectadas (no se inventa nada) |
| 9 | Eventos de seguridad | Implementado; pendiente de prueba con las cámaras | Desconexión/reconexión y presencia fuera de horario confirmado (alerta o «sin confirmar» según la confianza), con deduplicación de 15 min |
| 10 | Estabilidad y documentación | Parcial | Reconexión con espera progresiva; las pruebas de horas continuas requieren las cámaras |

## Entregables de código

- `vision/engine/`: motor (detección, ByteTrack, líneas, zonas, vigilancia,
  métricas por hora como incrementos, latido). Usa el rol `vision_engine`.
- `vision/src/components/settings/GeometryEditor.tsx` y `CountingLines.tsx`:
  editor de zonas (Ajustes → Estaciones → «Zona») y de líneas (Ajustes →
  Cámaras → «Líneas de entrada y salida»). Usa las mismas coordenadas
  normalizadas que el motor.
- `vision/netlify.toml`: compilación estática + revisión de secretos antes de
  publicar.

## Bloqueos (no se fingen como resueltos)

1. **Cámaras → servidor de procesamiento.** Las Tapo C110 solo aceptan
   conexiones RTSP entrantes y no hay ningún equipo en el local. La única vía
   con $0 es abrir el puerto 554 del módem de Izzi **solo** hacia la IP del
   servidor gratuito. Para eso falta:
   - Saber si la línea de Izzi tiene IP pública o CGNAT. Se comprueba en el
     local; capturas de `AUDITORIA-SEGURIDAD-INTEGRACION.md` §5.4. Con CGNAT
     y sin IP pública gratuita, **la conexión remota es imposible** bajo las
     condiciones actuales.
   - Si el módem permite restringir por IP de origen. Si no, no se recomienda
     abrir el puerto.
   - La «Cuenta de cámara» en la app Tapo (usuario y contraseña RTSP) y una
     prueba con VLC en la red local, primero con una sola cámara.
   - La cuenta gratuita de Oracle Cloud. El registro exige que el
     propietario verifique su identidad con tarjeta; no existe un conector
     que pueda hacerlo.
   - Advertencia: RTSP viaja **sin cifrar** aunque tenga contraseña.
2. **Recuperación de contraseña desde el sitio publicado.** Los logs de Auth
   muestran que Supabase sustituye el destino por la Site URL por defecto
   (`http://localhost:3000`). Corregirlo exige cambiar la configuración de
   Auth (Site URL y Redirect URLs), que solo se hace desde el panel o con un
   token de la Management API que funcione. Mientras tanto, el administrador
   técnico puede restablecer contraseñas.
