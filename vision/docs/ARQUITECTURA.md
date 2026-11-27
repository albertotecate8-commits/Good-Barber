# Smart Business Vision AI — Arquitectura y auditoría técnica

Estado: **Etapa 1 implementada** (aplicación base, modelo de datos y RLS).
Nada de lo que sigue crea recursos en la nube: cada paso que lo requiera
espera aprobación del propietario.

## 1. Lo que ya existía en el repositorio

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `/` (raíz) | App de administración de Good Barber (citas, servicios, cortes, CMS) | HTML/CSS/JS sin build + Supabase (`sisgfnykjzovnaxylxyq`) |
| `/cliente`, `/reservar` | Web pública y reservas | HTML/JS estático |
| `/finanzas` | Finanzas de 3 negocios | HTML/JS + **otro** proyecto Supabase (`mwskrwkkiuifedatuvca`) |
| `/supabase` | Esquema y Edge Functions de Good Barber | SQL + Deno |

No había ningún documento de requisitos de visión por computadora ni código
de cámaras. **No se modificó ninguna de esas apps.**

### Qué se reutilizó

- **Tokens de diseño** de `css/styles.css` (negro profundo, grafito, dorado
  champagne `#d4a24e`, contraste AA ya corregido) → `src/app/globals.css`.
- **Patrones de seguridad** de `supabase/schema.sql`: RLS en todas las
  tablas, funciones `security definer` con `search_path` fijo, roles que el
  usuario no puede autoasignarse, nada de `service_role` en el frontend.
- **Zona horaria** `America/Mexico_City` que ya usa la app de Good Barber.
- **Patrón PWA** "primero la red" del service worker existente.
- **Decisión de aislamiento** de `finanzas/`: app aparte en su carpeta, sin
  tocar la app de la raíz.

## 2. Arquitectura de la Etapa 1

```
iPhone (PWA)  ──HTTPS──►  Cloudflare Pages (archivos estáticos de vision/out)
     │
     └──HTTPS (clave publishable + JWT de sesión)──►  Supabase
                                                       ├─ Auth (correo/contraseña)
                                                       └─ Postgres, esquema `vision` + RLS

(Etapas 2+)  Motor de visión (Python) ──RTSP──► cámaras Tapo C100
             └──HTTPS (service_role, solo en el servidor)──► Supabase: métricas y eventos
```

- **Next.js 16 + TypeScript con `output: "export"`**: el sitio es 100 %
  estático. No usa funciones de servidor, Workers ni middleware, así que se
  sirve en el plan gratuito de Cloudflare Pages sin adaptadores.
- **Autenticación en el cliente** con `@supabase/supabase-js` (PKCE).
  Las rutas internas se protegen en la interfaz, pero la protección real es
  RLS: aunque alguien manipule el JavaScript, la base no le devuelve nada.
- **Esquema propio `vision`** en Postgres, separado de `public`.
- **Sin vídeo, sin capturas, sin credenciales de cámara** en la app o la base.

### Estructura de carpetas

```
vision/
  src/app/                     Rutas (App Router, exportación estática)
    login/, restablecer/       Acceso y recuperación de contraseña
    (app)/inicio/              Dashboard general (ambos negocios + comparativa)
    (app)/negocio/?n=<slug>    Sección por negocio (Good Barber, Glamour Studio, futuros)
    (app)/seguridad/           Eventos, horario actual, conexión de cámaras
    (app)/ajustes/…            Negocios, cámaras, estaciones, horarios, usuarios, cuenta
  src/components/ui/           Botones, campos, hojas modales, avisos, etiquetas de calidad
  src/components/layout/       Shell, navegación inferior, protecciones de acceso
  src/components/dashboard/    Tarjetas de indicadores, listas de cámaras/estaciones/eventos
  src/lib/domain/              Lógica pura y probada: horarios, indicadores, validación, errores
  src/lib/data/queries.ts      ÚNICO punto de acceso a Supabase
  src/lib/auth, site, hooks    Sesión, establecimiento/rol actual, carga de datos
  supabase/migrations/         SQL versionado
  supabase/tests/              Pruebas de RLS contra un PostgreSQL local desechable
  public/                      Manifest PWA, service worker, iconos, cabeceras de Cloudflare
```

### Regla de "no inventar datos" (implementada en `src/lib/domain/indicators.ts`)

| Situación | Lo que muestra |
|---|---|
| El motor de visión nunca ha enviado un latido | **Pendiente** + motivo |
| El motor existe pero no hay filas del periodo, o la cámara no se observó | **Sin datos** (nunca "0") |
| Hay filas reales | El valor con etiqueta **Real** o **Estimado** |
| El motor dejó de latir | Último valor + **Desactualizado** |

"Personas dentro" y "visitas" siempre son **Estimado**. Una persona
detectada no es un cliente; una estación ocupada no es un servicio ni un
cobro. La etiqueta **Manual** queda lista para el registro de servicios.

## 3. Evaluación de la arquitectura objetivo (sin crear nada)

### Supabase (gratis)

- **Límite de proyectos gratuitos**: el plan Free permite **2 proyectos
  activos** por organización, y ya existen dos (Good Barber y Finanzas).
  Un tercer proyecto gratuito no es posible sin pausar uno o pagar.
- **Recomendación**: aplicar las migraciones en el proyecto **existente de
  Good Barber**, dentro del esquema aislado `vision`. Ventajas: $0, la
  cuenta de administrador actual puede reutilizarse, el registro público ya
  está desactivado. Aislamiento: las tablas no se mezclan con `public` y los
  barberos con cuenta en esa app **no ven nada** de `vision` (no tienen fila
  en `vision.members`; está cubierto por las pruebas).
- **Límites a vigilar**: 500 MB de base de datos → por eso se guardan
  métricas **por hora** y eventos puntuales, nunca detecciones cuadro a
  cuadro. Los proyectos gratuitos se pausan tras ~1 semana sin actividad; el
  latido del motor evitaría eso cuando exista.
- **Respaldo**: el workflow `backup-database.yml` actual solo respalda
  `public`. Si se aprueba usar ese proyecto, hay que añadir `--schema=vision`
  (pendiente; no se tocó el workflow de producción sin aprobación).

### Cloudflare Pages (gratis)

Compatible: build estático (`npm run build` → `out/`), sin funciones. Se
incluye `public/_headers` con CSP, HSTS y caché. Configuración del proyecto
(cuando se apruebe): directorio raíz `vision`, comando `npm run build`,
salida `out`, variables `NEXT_PUBLIC_*`, `NODE_VERSION=22`.

### Motor de visión: modelo y licencias (decisión pendiente)

| Componente | Licencia | Comentario |
|---|---|---|
| Ultralytics YOLOv8 / YOLO11 | **AGPL-3.0** (o licencia comercial de pago) | Muy buen soporte. AGPL obliga a publicar el código si se distribuye o se ofrece como servicio en red a terceros. Uso interno privado es defendible, pero **debe decidirlo el propietario**. |
| YOLOX (Megvii) | Apache-2.0 | Alternativa permisiva; modelos Nano/Tiny ligeros para CPU. |
| ByteTrack | MIT | Seguimiento; sin problema. |
| OpenCV | Apache-2.0 | Captura/decodificación. |
| FFmpeg | LGPL/GPL según compilación | Solo como herramienta del servidor; no se distribuye. |

Recomendación técnica: **YOLOX-Nano/Tiny (Apache-2.0) + ByteTrack** para
evitar obligaciones AGPL, salvo que se acepte AGPL para uso interno. No se
eligió ni descargó ningún modelo.

### Oracle Cloud Always Free (sujeto a verificación)

> Actualizado en `AUDITORIA-SEGURIDAD-INTEGRACION.md` §4–5: hay reportes (sin confirmar) de que en 2026 el cupo ARM gratuito bajó a 2 OCPU/12 GB; se planifica para ese caso.

- Instancias Ampere A1 (ARM) gratuitas, sujetas a **disponibilidad real**
  ("Out of capacity" es frecuente en algunas regiones).
- El alta pide **tarjeta** para verificar identidad. La cuenta debe quedar en
  el nivel Always Free sin "upgrade" para no generar cargos. **No se creó
  nada**; requiere aprobación explícita.
- Las instancias inactivas pueden ser reclamadas por Oracle.
- Rendimiento esperado en CPU ARM: modelos "nano" sobre `stream2` (baja
  resolución) muestreando pocos cuadros por segundo. **Se medirá** en las
  Etapas 3 y 5; no se promete ninguna cifra antes de medir.

### El riesgo principal: llegar a las cámaras sin un equipo en el local

Las Tapo C100 exponen RTSP (puerto 554) solo en la red local y **no** pueden
iniciar una conexión de salida hacia un servidor. Sin un equipo en el local,
la única vía es que el servidor entre a la red de Izzi. Antes de decidir:

1. **CGNAT**: comparar la IP WAN que muestra el módem de Izzi con la IP
   pública que ve internet. Si difieren (o la WAN está en 100.64.0.0/10), hay
   CGNAT y **no es posible** recibir conexiones entrantes por IPv4.
2. **Módem**: ver si permite reenvío de puertos y, sobre todo, **restringir
   por IP de origen** (muchos módems domésticos no lo permiten).
3. **Riesgo**: RTSP viaja **sin cifrar** (usuario y contraseña incluidos).
   Abrir el 554 a internet expone la cámara a escaneos y ataques. Cambiar el
   puerto **no** lo hace seguro. Solo sería aceptable con restricción estricta
   por IP de origen, contraseña única de cámara y firmware actualizado.
4. Si hay CGNAT o el módem no restringe por origen, el procesamiento remoto
   continuo con $0 y sin equipo adicional **puede no ser viable**; la Etapa 2
   debe documentarlo con evidencia en lugar de forzar una solución insegura.

Primero se prueba RTSP **en la red local con VLC** (Etapa 2), con una sola
cámara.

## 4. Contrato para el motor de visión (Etapas 2–6)

El motor escribe con la `service_role` key, que vive **solo** como variable
de entorno del servidor. Escrituras previstas:

| Tabla | Cuándo |
|---|---|
| `engine_nodes` | Latido cada ~60 s (`last_heartbeat_at`) |
| `camera_health` + `camera_status_events` | Cambio de estado/último contacto de cada cámara |
| `vision_events` | Cada cruce de línea (`line_entry`/`line_exit`) y entrada/salida de zona |
| `traffic_hourly` | Upsert por cámara y hora UTC (incluye `observed_seconds`) |
| `station_occupancy_hourly`, `station_live_state` | Ocupación por estación |
| `business_live_state` | Estimado de personas dentro |
| `security_events` | Presencia/movimiento fuera de horario, desconexiones |

`track_ref` es el id efímero del tracker: no identifica a nadie. No hay
reconocimiento facial, audio, ni almacenamiento de imágenes.
