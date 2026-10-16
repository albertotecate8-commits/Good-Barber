# Marketing AI Studio

Centro de marketing con IA para administrar varios negocios (Good Barber, Glamour Studio,
AFORE PRO y los que vengan) desde un solo perfil. Vive en esta carpeta, separado de la app de
citas de Good Barber (raíz del repositorio), que no se modifica.

**Regla económica:** $0 MXN de gasto adicional en APIs. Ver `src/lib/providers/`.

## Estado (Etapas 1 a 6)

| Función | Estado |
| --- | --- |
| Inicio de sesión (Supabase Auth, sin registro público) | Funciona y está probado |
| Panel de inicio con resumen de negocios, publicaciones, campañas, conexiones y proveedores | Funciona (sin cifras inventadas) |
| Negocios: alta, edición, archivado, carga de los 3 negocios iniciales | Funciona |
| Identidad de marca, servicios y precios, promociones, perfiles sociales, historial | Funciona |
| Aislamiento de datos por negocio (RLS) y auditoría | Funciona y está probado |
| Registro honesto de proveedores de IA y bloqueo de gasto | Funciona (la invocación real llega en la Etapa 3) |
| Calendario: vistas mes/semana/próximas, crear, editar, duplicar, eliminar, filtros, zona America/Mexico_City | Funciona y está probado |
| Biblioteca: subir, filtrar, etiquetar, previsualizar, descargar, eliminar; aislada por negocio | Funciona y está probada (con almacenamiento local de desarrollo) |
| Supabase real (proyecto `marketing-ai-studio`, plan Free) | Creado; 8 migraciones aplicadas; esquema idéntico al local (huella de 10 categorías); políticas RLS y de Storage verificadas en la base real (17/17) |
| Supabase Storage (bucket privado) | Bucket y políticas creados y verificados en la base real; **subida/descarga de archivos por HTTP aún sin probar** (la red del entorno bloquea supabase.co: ver `npm run smoke:remote`) |
| Registro de «publicada a mano» | Funciona (es una declaración tuya, no confirma la plataforma) |
| Director de Marketing: instrucción → tareas → investigación → estrategia, 5 anuncios, Reel, calendario, KPIs y medición | Funciona con el motor de plantillas (sin IA); probado |
| Varios negocios en una petición (una campaña por negocio) | Funciona |
| Investigación: informes, hallazgos con fuente/enlace/fecha/confianza/nivel de evidencia, registro manual | Funciona y está probado |
| Fuentes automáticas: datos del negocio y calendario comercial verificado | Funcionan |
| Fuentes automáticas: OpenStreetMap, RSS de Google Trends, Tavily | Implementadas y probadas con respuestas de formato documentado; **no probadas en vivo** (la red del entorno de desarrollo las bloquea; Tavily requiere clave) |
| Fuentes asistidas: Biblioteca de anuncios de Meta, Google Maps, Google Trends Explore, TikTok Creative Center | Enlaces de consulta + registro manual |
| Gemini API (opcional) | Implementada con candados de gasto; probada con respuestas simuladas, **no contra la API real** (no hay clave) |
| Prompts asistidos para ChatGPT/Claude/Gemini/Flow e importación validada del resultado | Funciona |
| Borradores en el calendario desde la campaña, experimentos y comparación | Funciona y está probado |
| Estudio creativo: proyectos por negocio/campaña, referencias, tipo de material, formato | Funciona y está probado |
| Conceptos y prompts para ChatGPT/Gemini/Claude/Flow con marca, precios y referencias | Funciona (son instrucciones, no imágenes) |
| Editor gráfico en el navegador: recorte con foco, textos y precios exactos, logotipo sin deformar, plantillas, exportación en alta resolución y adaptación a otros formatos | Funciona y está probado (edición por código, no IA) |
| Importar resultados de herramientas externas como versiones («Generado con IA») | Funciona |
| Control de calidad: automático (precios, afirmaciones, ortografía en español, dimensiones, contraste, tamaño legible, zonas seguras, palabras partidas, textos encimados o sobre el logotipo, resolución, logotipo, tipografía de marca, exposición) + revisión humana obligatoria para «definitivo» | Funciona y está probado |
| Tipografías de marca en el editor (7 familias libres OFL incluidas en la app) | Funciona y está probado |
| Prompts con dirección fotográfica por giro y servicio (Good Barber: barbería realista, corte reconocible) | Funciona (son instrucciones para tu herramienta externa) |
| Video: escenas, textos, música con licencia y montaje con FFmpeg | Funciona donde hay FFmpeg (probado con `ffprobe`); en Netlify se entrega el comando |
| Generación de imágenes o video con IA desde la app | **No disponible**: ninguna vía gratuita y permitida (ver abajo) |
| Prospectos y resultados: registro por negocio, atribución explícita a campañas, ventas reales, importación CSV | Funciona y está probado (no lee bandejas de mensajes: requiere permisos de Meta) |
| Analíticas con datos reales (publicaciones, prospectos, ventas, costo por cliente solo con gasto real) | Funciona y está probado |
| Alcance e interacciones desde Meta | **Pendiente**: requiere permisos de estadísticas y cuenta conectada |
| Alternativas de campaña con «por qué probarla» e ideas separadas de campañas en ejecución | Funciona y está probado |
| Hosting en Netlify Free (uso comercial permitido) | Preparado (`netlify.toml`); **no desplegado**: requiere tu inicio de sesión en Netlify |
| Conexión oficial con Meta (vincular la página existente, solo lectura) | Implementada y probada con respuestas simuladas; **sin probar contra Meta** (no hay app de Meta); ninguna red está conectada |
| Publicación automática en Facebook/Instagram (aprobación del dueño, programación, sin duplicados, reintentos) | Implementada y probada con la Graph API **simulada**; **apagada** (`MKT_PUBLISHING_ENABLED`) y sin probar contra Meta: no hay app de Meta ni cuenta conectada |

## Arquitectura

- **Next.js 16** (App Router, TypeScript, Tailwind CSS 4), Server Components y Server Actions.
  Toda lectura/escritura pasa por la sesión del usuario: **nunca** se usa la `service_role` en la app web.
- **Supabase** (Auth + Postgres + RLS). Migraciones en `supabase/migrations/`. Todas las tablas y
  funciones usan el prefijo `mkt_` para no chocar con ninguna otra app.
- `src/proxy.ts` refresca la sesión (en Next 16 «middleware» se llama «proxy»).
- `src/lib/data/` — capa de acceso a datos (solo servidor).
- `src/lib/validation/` — validación con zod de todo lo que envía el usuario.
- `src/lib/providers/registry.ts` — proveedores de IA, su modo de acceso real y sus limitaciones.
- `src/lib/providers/budget.ts` — `assertCallAllowed()`: bloquea cualquier llamada con costo.

### Calendario y publicación

- Las fechas se guardan en UTC y se capturan/muestran en `America/Mexico_City` (`src/lib/tz.ts`,
  sin desfase fijo: usa las reglas de zona del sistema).
- **Programar no publica.** Todo es manual hasta que exista una integración oficial. La arquitectura
  está en `src/lib/publishing/` (contrato `Publisher`, lista vacía) y en la tabla
  `mkt_publish_attempts`, que solo escribe el servidor. El flujo previsto está documentado en ese archivo.
- Validación: no se programa en el pasado; Instagram exige recurso al programar, 2 200 caracteres y 30 hashtags.

### Biblioteca

- Subida en 3 pasos: el servidor valida y crea el registro «pendiente» → el navegador sube el
  archivo → se verifica tamaño y **tipo real por sus primeros bytes** y se marca «listo».
- `MKT_STORAGE_BACKEND=supabase` (por defecto): bucket privado `mkt-assets`, 50 MB por archivo;
  la subida va directo del navegador a Storage y sus políticas RLS exigen el registro pendiente.
- `MKT_STORAGE_BACKEND=local`: solo desarrollo, en `.local-storage/`. La app lo anuncia en pantalla
  y se niega a usarlo en Netlify o Vercel.
- Los archivos se entregan por `/api/biblioteca/archivo/[id]`, que consulta con la sesión del
  usuario (RLS): sin acceso al negocio, la respuesta es 404.

### Director de Marketing e investigación (`src/lib/director/`, `src/lib/research/`)

- `intent.ts` convierte la instrucción en tareas (cantidad de anuncios, Reel, periodo, competencia, objetivo sugerido).
- `research/` ejecuta las fuentes; cada una deja constancia en `provider_runs` (consultada, sin resultados,
  error, sin configurar u omitida). Un proveedor que falla no detiene a los demás. Nunca se sustituyen
  resultados faltantes por datos inventados.
- `template.ts` arma el plan **solo** con precios, promociones y marca registrados y con hallazgos con
  fuente; cada sección lleva su nivel: hecho comprobado, observación, hipótesis o recomendación por probar.
- `plan.ts` es el esquema único (zod) para el plan venga de plantillas, Gemini o una IA externa, y
  `findUnknownPrices` marca montos que no coinciden con ningún precio real.
- `gemini.ts` solo llama a Gemini con `GEMINI_API_KEY` **y** `GEMINI_FREE_TIER_CONFIRMED=1`, pasa por
  `assertCallAllowed` (gasto $0 y tope diario) y registra cada uso en `mkt_ai_usage`.
- `experiments.ts` resume resultados y sugiere qué probar, con umbral mínimo de datos y aviso de que
  correlación no es causalidad.

### Estudio creativo (`src/lib/creative/`)

- `formats.ts`: formatos por red con zonas seguras (guías 2026; Meta no publica una única medida oficial).
- `layout.ts` + `design.ts`: composición pura (recorte con punto focal, logotipo proporcional, ajuste de
  texto, plantillas dentro de la zona segura). `draw.ts` la dibuja en un `<canvas>` del navegador, tanto
  para la vista previa como para exportar a tamaño real. Funciona igual en Netlify y en el iPhone.
- `qa.ts`: comprobaciones automáticas (algunas medidas en los píxeles del lienzo, otras en el servidor) y
  una lista de revisión humana obligatoria. Lo que no se puede medir (defectos de una imagen con IA, permisos
  de personas) se pide a la persona; la app no certifica que una imagen sea «real» ni promete ventas.
- `video.ts` + `render.ts`: plan de video validado (música exige licencia) y comando de FFmpeg sin shell.
  Monta material existente; no genera video con IA.
- **Integraciones de IA investigadas (octubre 2026):** las suscripciones de ChatGPT, Claude, Gemini y Google
  Flow no incluyen API; la API de imágenes de Gemini, Veo y la de OpenAI son de pago; Flow no tiene API. Por
  eso la generación es asistida: la app prepara el prompt (pidiendo la imagen sin texto para poner textos
  exactos con el editor), abre la herramienta y luego importas el resultado. El enlace `chatgpt.com/?q=` se
  ofrece como opción no oficial; Claude y Gemini no tienen precarga confirmada.

### Conexión con Meta (`src/lib/meta/`)

- `config.ts`: permisos que se piden (solo lectura) y variables necesarias; sin ellas la app explica qué falta.
- `graph.ts`: Facebook Login, cambio de código por token de larga duración, `debug_token` (válido y de esta
  app), páginas que administras con su Instagram y prueba del token de página. Nunca registra tokens.
- `crypto.ts`: AES-256-GCM para tokens y `state` firmado (HMAC) + cookie httpOnly contra CSRF.
- `service.ts`: la única parte que usa `service_role`, para guardar tokens cifrados en tablas que el navegador
  no puede leer y fijar «Conectado» solo después de que Meta confirmó. Reutiliza el perfil ya registrado:
  no crea páginas ni perfiles duplicados.
- Rutas `/api/meta/conectar` y `/api/meta/retorno`; pantalla `/negocios/[slug]/meta` para elegir la página.

### Publicación automática (`src/lib/meta/publish.ts`, `worker.ts`)

- Publicar exige: aprobación del **dueño** (con casilla de confirmación), cuenta conectada con
  `pages_manage_posts` / `instagram_content_publish`, hora programada cumplida y `MKT_PUBLISHING_ENABLED=1`.
- Editar texto, recurso, red, formato, fecha o estado de algo aprobado revoca la aprobación (trigger).
- Función programada de Netlify (`netlify/functions/publicar-programadas.mts`, cada 15 min) → ruta
  `/api/meta/publicar-programadas` protegida con `MKT_CRON_SECRET`.
- Sin duplicados: reserva atómica por fila, id del post guardado antes del intento, índice único de éxito.
  Máximo 3 intentos fallidos; luego «Error» con el motivo para revisión humana.
- «Verificar permisos (sin publicar)» solo lee de Meta.

### Prospectos y analíticas (`src/lib/validation/lead.ts`, `src/lib/analytics.ts`)

- Prospectos por negocio con origen, estado, cita y venta real; atribución explícita (el cliente lo dijo o
  usó el código) a campañas del mismo negocio. Importación CSV todo o nada.
- La app de citas de Good Barber **no** se conecta: sus datos solo entran si los exportas e importas.
- Analíticas solo con datos registrados; costo por cliente solo con gasto publicitario real capturado.

### Garantías aplicadas en la base de datos (no solo en la interfaz)

- Un usuario solo ve y edita negocios de los que es miembro (`owner`/`editor`; `viewer` solo lee).
- Solo un administrador (`mkt_admins`) crea negocios, y siempre a su propio nombre.
- El navegador no puede marcar una red como «conectada» ni una publicación como «publicada»:
  eso lo hará el servidor solo tras la confirmación oficial de la plataforma.
- La auditoría se escribe por triggers; nadie puede insertarla ni editarla desde el navegador.
- Precios en centavos con validación; colores, URLs y longitudes validados con `CHECK`.
- Una publicación solo puede usar recursos (y campañas) de su mismo negocio.
- La ruta de cada archivo empieza con el id del negocio y no se puede cambiar; un archivo ya subido
  no cambia de negocio ni de datos técnicos.
- El navegador no puede fijar los estados «Publicado»/«Error», el modo de publicación «api» ni los
  campos que solo llena la plataforma.
- Hallazgos, investigaciones, campañas, experimentos y borradores solo se enlazan dentro del mismo
  negocio (triggers); el uso de IA se registra a nombre propio y no se edita ni se borra.
- Proyectos creativos, referencias, versiones y sus archivos pertenecen a un solo negocio; un material
  «definitivo» exige archivo y revisión aprobada (restricción `CHECK`).
- Los tokens de Meta y las sesiones OAuth están en tablas sin ningún privilegio para el navegador.
- `authenticated` no tiene TRUNCATE/REFERENCES/TRIGGER ni escritura en tablas de solo lectura; `anon` no tiene acceso.

### Migraciones

| Archivo | Reversión |
| --- | --- |
| `supabase/migrations/20261015000000_mkt_core.sql` | — |
| `supabase/migrations/20261016000000_mkt_calendar_library.sql` | `supabase/rollbacks/20261016000000_mkt_calendar_library.down.sql` |
| `supabase/migrations/20261017000000_mkt_director_research.sql` | `supabase/rollbacks/20261017000000_mkt_director_research.down.sql` |
| `supabase/migrations/20261018000000_mkt_creative_studio.sql` | `supabase/rollbacks/20261018000000_mkt_creative_studio.down.sql` |
| `supabase/migrations/20261019000000_mkt_harden_grants.sql` | `supabase/rollbacks/20261019000000_mkt_harden_grants.down.sql` |
| `supabase/migrations/20261020000000_mkt_meta_connections.sql` | `supabase/rollbacks/20261020000000_mkt_meta_connections.down.sql` |
| `supabase/migrations/20261021000000_mkt_publishing.sql` | `supabase/rollbacks/20261021000000_mkt_publishing.down.sql` |
| `supabase/migrations/20261022000000_mkt_leads.sql` | `supabase/rollbacks/20261022000000_mkt_leads.down.sql` |

Todas son idempotentes. Desde la del Estudio se probaron aplicando, re-aplicando, revirtiendo y volviendo a aplicar. El entorno local replica los privilegios por defecto de Supabase real (`scripts/local-supabase/roles.sql`).

## Desarrollo local

```bash
cd marketing-studio
npm install
npm run local:up        # Postgres + Supabase Auth + PostgREST locales (sin Docker)
npm run local:seed      # admin@local.test / Admin12345!
npm run local:env > .env.local
echo "MKT_STORAGE_BACKEND=local" >> .env.local   # no hay Storage en el stack local
npm run dev             # http://localhost:3000
```

## Pruebas

```bash
npm run lint && npm run typecheck
npm run test:unit         # lógica: dinero, validación, regla de gasto, proveedores
npm run test:integration  # RLS, triggers y políticas de Storage contra el stack local
npm run build && npm run test:e2e   # navegador real (escritorio + iPhone)
npm run test:live         # fuentes de investigación EN VIVO (requiere internet)
npm run smoke:remote      # servicios reales: Auth, base, Storage y app desplegada (ver docs/DESPLIEGUE.md)
npm run check:secrets     # tras un build: ningún secreto ni módulo de servidor en el código del navegador
npm run check:citas       # la rama no modifica la app de citas de Good Barber
```

Contra el proyecto Supabase real (SQL Editor o conector): `scripts/remote/schema-fingerprint.sql` (huella
del esquema para comparar con el local) y `scripts/remote/rls-check.sql` (permisos; no deja rastro).

## Despliegue

Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
