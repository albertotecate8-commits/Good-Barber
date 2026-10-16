# Despliegue gratuito de Marketing AI Studio

Todo con planes gratuitos, sin tarjeta y sin activar facturación. Este documento distingue lo que
**ya está hecho y verificado**, lo que **está preparado pero sin probar** y lo que **requiere que tú
inicies sesión**. La app **todavía no está desplegada**: falta el paso de Netlify (sección 3).

La app de citas de Good Barber (raíz del repositorio, su proyecto Supabase `sisgfnykjzovnaxylxyq` y
sus proyectos de Vercel) **no se toca** en ningún paso.

---

## 1. Elección de plataforma (verificado en fuentes oficiales, octubre 2026)

| Opción | Uso comercial en plan gratuito | Encaje con esta app | Decisión |
| --- | --- | --- | --- |
| **Netlify Free** | Sí: Netlify indica que el plan Free admite proyectos comerciales (no se permite *revender* el hosting). 300 créditos/mes con tope duro: si se agotan, el sitio se pausa hasta el mes siguiente; **nunca cobra**. | Next.js 16 compatible con su adaptador oficial (OpenNext), Server Actions y rutas de servidor. Funciones de 60 s y 1 GB. | **Elegida** |
| Vercel Hobby | **No**: sus términos limitan Hobby a uso personal no comercial. | Técnicamente ideal, pero un panel de marketing para negocios propios es uso comercial. | Descartada |
| Cloudflare Workers Free | No hay restricción comercial visible, pero sin confirmación oficial clara. | 10 ms de CPU por petición y 3 MiB por Worker: insuficiente para el renderizado de esta app. | Descartada |
| Render Free | Su documentación pide no usar instancias gratuitas en producción; se duermen a los 15 min. | Arranques de ~1 min en el iPhone. | Descartada |

Fuentes: Netlify — [planes con créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/), [cómo se consumen los créditos](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [Next.js en Netlify](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/), [plan Free y proyectos comerciales](https://www.netlify.com/blog/introducing-netlify-free-plan/) · Vercel — [Fair Use / Hobby](https://vercel.com/docs/limits/fair-use-guidelines) · Cloudflare — [límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) · Render — [Deploy for Free](https://render.com/docs/free).

**Consumo de créditos de Netlify (Free = 300/mes):** cada despliegue a producción gasta 15 (≈20
despliegues al mes); 10 por GB-hora de cómputo; 20 por GB transferido; 2 por cada 10 000 peticiones.
Las vistas previas de rama no gastan. Para no desperdiciar despliegues, `netlify.toml` incluye
`scripts/netlify-ignore.sh`: solo construye cuando cambia algo dentro de `marketing-studio/` (los
cambios de la app de citas no disparan despliegues). Los archivos de la Biblioteca se sirven desde
Supabase con enlaces firmados, así que casi no consumen transferencia de Netlify.

---

## 2. Base de datos: Supabase (HECHO)

Se creó un proyecto **nuevo e independiente**, en plan Free ($0, sin tarjeta):

| Dato | Valor |
| --- | --- |
| Proyecto | `marketing-ai-studio` |
| Ref / URL | `xlhzzyqekkageaegvbab` · `https://xlhzzyqekkageaegvbab.supabase.co` |
| Región | `us-east-2` (Ohio, la misma región por defecto de las funciones de Netlify) |
| Organización | «shabex10@gmail.com's Org» (plan Free) — es la cuenta de Supabase conectada a esta sesión |
| Clave pública | `sb_publishable_3JSJSzEa9ojgEB5iSU-dgA_prnbQF-J` (pública por diseño: la seguridad la da RLS) |

**Inicia sesión en supabase.com con la cuenta `shabex10@gmail.com`** para ver este proyecto. En esa
organización ya existe otro proyecto («shabex10@gmail.com's Project», una quiniela con datos reales):
**no se tocó**. Con este, la organización usa sus 2 proyectos gratuitos.

### Migraciones aplicadas y verificadas

Aplicadas las 9 migraciones de `supabase/migrations/` (de `20261015000000` a `20261023000000`, incluidas publicación, prospectos y distribución a grupos).
El conector de Supabase pide confirmación para cualquier sentencia con `DROP`, así que en la base
nueva se aplicó el mismo SQL sin los `drop … if exists` (que en una base vacía no hacen nada) y con
`create or replace trigger`. Para demostrar que el resultado es idéntico, `scripts/remote/schema-fingerprint.sql`
calcula una huella de columnas, restricciones, políticas, triggers, funciones (cuerpo exacto),
privilegios, RLS, tipos y bucket: **las 10 categorías coinciden** entre el proyecto real y el entorno local.

**Hallazgo real que el entorno local no mostraba:** Supabase concede por defecto TODOS los privilegios
de cada tabla nueva a `anon` y `authenticated` (incluidos TRUNCATE, REFERENCES y escritura en tablas de
solo lectura). RLS ya protegía las filas, pero se agregó `20261019000000_mkt_harden_grants.sql` para
dejar solo los privilegios que la app usa, y el entorno local ahora reproduce esos permisos por defecto
(`scripts/local-supabase/roles.sql`) para que las pruebas lo detecten.

**Avisos del asesor de seguridad de Supabase:** quedan 5 avisos «funciones SECURITY DEFINER ejecutables
por usuarios»: son `mkt_can_read`, `mkt_can_write`, `mkt_is_owner`, `mkt_is_admin` y
`mkt_storage_upload_allowed`, que las políticas RLS necesitan ejecutar y que solo responden sí/no sobre
los permisos del propio usuario. Es intencional. Los demás avisos de seguridad se corrigieron.

### Políticas verificadas en el proyecto real

`scripts/remote/rls-check.sql` crea usuarios y datos de prueba dentro de un bloque que se revierte
solo (no deja rastro; se comprobó que el proyecto quedó con 0 usuarios y 0 negocios). En el proyecto
real pasaron **17 de 17** comprobaciones: aislamiento entre negocios, escritura cruzada bloqueada,
recursos/referencias de otro negocio rechazados, «publicado»/«conectado» bloqueados desde el navegador,
«definitivo» sin revisión rechazado, Storage (subir solo con registro pendiente propio, no leer archivos
de otro negocio), `anon` sin acceso, sin autoasignarse administrador, sin escribir en la auditoría y
auditoría registrada. Las comprobaciones de TRUNCATE y DELETE no se pudieron correr por el conector
(pide una confirmación que no llega); el privilegio TRUNCATE sí quedó verificado por la huella de
privilegios. El script completo (19 comprobaciones) se puede correr en el **SQL Editor** de Supabase.

### Lo que TÚ debes hacer en Supabase (5 minutos)

1. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**.
   (Hoy está activado, como en todo proyecto nuevo. Un registro ajeno no vería datos —RLS lo impide—,
   pero no debe existir.)
2. **Authentication → Users → Add user → Create new user**: tu correo y una contraseña nueva,
   marcando *Auto Confirm User*. **No compartas esa contraseña** (ni conmigo).
3. **SQL Editor** → ejecuta (cambia el correo):
   ```sql
   insert into mkt_admins (user_id) select id from auth.users where email = 'TU-CORREO';
   ```
   (O dime «ya creé mi usuario con el correo X» y lo hago yo con el conector.)
4. Después del paso 3 de Netlify: **Authentication → URL Configuration** → *Site URL* =
   `https://TU-SITIO.netlify.app` y agrega esa misma URL en *Redirect URLs*.
5. Solo si vas a conectar Meta: **Project Settings → API Keys** → copia la clave `service_role`
   (secreta) para Netlify.

---

## 3. Hosting: Netlify (PREPARADO, falta tu inicio de sesión)

**Opción más rápida (recomendada):** en claude.ai → *Configuración → Conectores* conecta el conector oficial
**Netlify** y dímelo: con él puedo crear el sitio, configurar las variables públicas, desplegar y verificar la
URL yo mismo. Si prefieres hacerlo a mano, sigue los pasos de abajo.

Archivos listos: `netlify.toml` (comando de build, Node 22, omitir construcciones innecesarias) y
`scripts/netlify-ignore.sh` (probado con 5 casos: sin caché, mismo commit, cambio en la app, cambio
solo en la app de citas y commit desconocido).

1. Entra a [app.netlify.com](https://app.netlify.com) → **Sign up with GitHub** (plan Free; no pide tarjeta).
2. **Add new project → Import an existing project → GitHub** → autoriza solo el repositorio
   `albertotecate8-commits/Good-Barber`.
3. Configuración del sitio:
   - **Branch to deploy:** `claude/marketing-ai-studio` (hasta que lo fusiones a `main`).
   - **Base directory:** `marketing-studio`
   - Build command y publish directory: déjalos vacíos (los toma de `netlify.toml`).
4. **Environment variables** (Add environment variables):
   | Variable | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xlhzzyqekkageaegvbab.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_3JSJSzEa9ojgEB5iSU-dgA_prnbQF-J` |
   | `MKT_CONTACT_EMAIL` | (opcional) tu correo, para la política de uso de OpenStreetMap |
   No definas `MKT_STORAGE_BACKEND` (la app se niega a usar disco local en Netlify).
5. **Deploy**. Cuando termine, abre la URL `https://….netlify.app` desde el iPhone y la computadora.
   En el iPhone, Safari → Compartir → *Agregar a pantalla de inicio* para abrirla como app.
6. Vuelve al paso 4 de Supabase (Site URL).

Netlify no crea nada en Vercel ni toca la app de citas: es un sitio aparte que solo construye la carpeta
`marketing-studio`.

---

## 4. Validación con los servicios reales (después de desplegar)

Desde tu computadora (con Node 22 y, opcional, FFmpeg para generar el video de prueba):

```bash
cd marketing-studio && npm install
SMOKE_SUPABASE_URL=https://xlhzzyqekkageaegvbab.supabase.co \
SMOKE_SUPABASE_ANON_KEY=sb_publishable_3JSJSzEa9ojgEB5iSU-dgA_prnbQF-J \
SMOKE_EMAIL=tu-correo SMOKE_PASSWORD='tu-contraseña' \
SMOKE_APP_URL=https://TU-SITIO.netlify.app \
npm run smoke:remote
```

Comprueba con tu sesión, sin `service_role`: inicio de sesión real, registro público desactivado, que
eres administrador, creación y lectura de un negocio temporal, campaña, publicación y proyecto creativo,
reglas del servidor, **subida y descarga real de una imagen PNG y un video MP4** en el bucket privado
(y que sin sesión no se pueden abrir), aislamiento con un segundo usuario (opcional:
`SMOKE_SECOND_EMAIL`/`SMOKE_SECOND_PASSWORD`, un usuario sin negocios) y que la app desplegada responde
y protege las páginas privadas. **Al final borra todo** (archivos incluidos). Probado contra el entorno
local: 9 de 12 pasan y los 3 de Storage fallan porque el entorno local no tiene la API de Storage, por
eso es indispensable correrlo contra Supabase real.

Después, prueba a mano desde el iPhone: iniciar sesión, «Cargar Good Barber, Glamour Studio y AFORE PRO»,
subir una foto real a la Biblioteca, descargarla, crear un proyecto en el Estudio y exportar.

---

## 5. Conexión y publicación con Meta (PREPARADAS, sin probar contra Meta)

**Qué hay implementado:** Facebook Login oficial que solo pide permisos de **lectura**
(`pages_show_list`, `pages_read_engagement`, `instagram_basic`, `business_management`), verificación del
token con `debug_token` (válido y de tu app), elección explícita de la **página existente** (la app
sugiere la que coincide con el perfil registrado, no crea páginas ni cambia propietarios o permisos),
prueba del token de página antes de marcar «Conectado», tokens cifrados con AES-256-GCM en tablas que el
navegador no puede leer, y botón para desconectar. Los permisos de publicación
(`pages_manage_posts` / `instagram_content_publish`) solo se piden con «Autorizar publicación».

**Facebook Login for Business (apps de tipo Negocio):** Meta guarda los permisos en una *configuración*
del panel y el diálogo recibe `config_id` en lugar de `scope`. La app lo soporta: define
`META_LOGIN_CONFIG_ID` (configuración de solo lectura) y `META_PUBLISH_CONFIG_ID` (lectura + publicación).
Sin esas variables usa Facebook Login clásico con `scope`.

**Páginas públicas que Meta exige** (ya incluidas, sin iniciar sesión): `/privacidad` y
`/eliminacion-de-datos`. **Configuración → Datos para la app de Meta** muestra las URL exactas de tu
despliegue para copiarlas. `/api/salud` confirma que el sitio responde y llega a Supabase.

**Qué dicen hoy las fuentes oficiales** (Graph API vigente: v26.0):
- Con *acceso estándar* una app funciona para las personas con rol en ella (tú como administrador). Para
  tus propias páginas no hace falta App Review; para cuentas de terceros sí (App Review + verificación del
  negocio). [Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business) ·
  [Permisos](https://developers.facebook.com/docs/permissions/)
- Publicar en una página exige `pages_manage_posts` + `pages_read_engagement` + `pages_show_list` y un rol
  con la tarea CREATE_CONTENT. [Page Feed](https://developers.facebook.com/docs/graph-api/reference/page/feed/)
- Publicar en Instagram (vía página) exige `instagram_basic` + `instagram_content_publish` +
  `pages_read_engagement`, máximo 100 publicaciones por API en 24 h.
  [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Versiones de la Graph API](https://developers.facebook.com/docs/graph-api/changelog/versions/)

**Lo que TÚ debes hacer (cuando quieras conectar):**
1. Con tu cuenta personal de Facebook que **administra la página «Good barber»**, entra a
   [developers.facebook.com](https://developers.facebook.com) → *My Apps* → **Create App** (gratis).
   Tipo **Negocio** / caso de uso administrar páginas con *Facebook Login for Business*. Déjala en modo desarrollo
   (así solo funciona para ti y no requiere App Review para tus propias páginas).
2. *Configuración de la app → Básica*: **Dominios de la app**, **URL de la política de privacidad** y
   **URL de instrucciones de eliminación de datos** (cópialas de *Configuración → Datos para la app de Meta*).
3. *Facebook Login for Business → Configuración*: **URI de redireccionamiento OAuth válidos** =
   `https://TU-SITIO.netlify.app/api/meta/retorno`. Crea dos configuraciones con token de acceso de usuario:
   «Solo lectura» (`pages_show_list`, `pages_read_engagement`, `instagram_basic`, `business_management`) y
   «Publicación» (las anteriores + `pages_manage_posts`, `instagram_content_publish`). Anota sus ids.
4. En Netlify agrega (como secretas): `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID`,
   `META_PUBLISH_CONFIG_ID`, `SUPABASE_SERVICE_ROLE_KEY` y `MKT_TOKEN_KEY` (32 bytes:
   `openssl rand -base64 32`). `MKT_APP_URL` solo si usas otro dominio (Netlify ya define `URL`). Vuelve a desplegar.
4. En la app: **Negocios → Good Barber → Redes sociales → Conectar con Meta**. En el diálogo de Meta
   elige compartir solo la página «Good barber»; luego confírmala en la app.
5. Para retirar el permiso en cualquier momento: Facebook → Configuración → *Integraciones comerciales*,
   y en la app el botón «Desconectar».

### Publicación automática (implementada, APAGADA)

- Cada publicación necesita tu **aprobación** en su pantalla del calendario (solo el dueño, con casilla de
  confirmación). Si después cambias el texto, la imagen, la red, el formato, la fecha o el estado, la
  aprobación se cancela sola.
- Una función programada de Netlify (`netlify/functions/publicar-programadas.mts`, cada 15 min, horario UTC)
  llama a `/api/meta/publicar-programadas` con `MKT_CRON_SECRET`; esa ruta no hace nada si
  `MKT_PUBLISHING_ENABLED` no vale `1`.
- No hay duplicados: cada fila se reserva de forma atómica, se guarda el id del post de Meta antes de
  registrar el intento y la base no admite dos éxitos para el mismo contenido. Tras 3 fallos queda en «Error»
  con el motivo.
- Probado SOLO con la Graph API simulada. **No se publicó nada real.** Las funciones programadas de Netlify
  solo corren en el despliegue de producción publicado; confirma en el panel de Netlify (*Functions*) que
  aparece «publicar-programadas» después de desplegar. [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)

**Para activarla (cuando quieras, después de conectar la página):**
1. En Redes sociales → **Autorizar publicación** (Meta te pedirá `pages_manage_posts` e
   `instagram_content_publish`).
2. **Verificar permisos (sin publicar)**: debe decir «lista para publicar».
3. En Netlify agrega `MKT_CRON_SECRET` (`openssl rand -base64 32`) y, solo cuando decidas,
   `MKT_PUBLISHING_ENABLED=1`. Vuelve a desplegar.
4. Prueba primero con una publicación de bajo riesgo aprobada por ti.

Nota: la cuenta de Meta conectada a esta sesión de trabajo solo administra la página «Crujipollo», no
«Good barber»; por eso no se usó para nada. La conexión real debe hacerla la cuenta que administra la página.

### Enlace de la publicación y distribución a grupos

- Tras publicar en la página, el servidor pide a Meta el `permalink_url` (Instagram: `permalink`) y lo guarda
  junto con el id del post; el intento registra destino, texto, recurso, fecha y si el enlace vino confirmado
  por Meta. Si Meta no lo devuelve, se usa la URL estándar `facebook.com/{página}/posts/{post}` marcada como
  no confirmada. [Referencia de Post](https://developers.facebook.com/docs/graph-api/reference/post/)
- **Grupos:** Meta retiró la API de grupos el 22 de abril de 2024
  ([TechCrunch](https://techcrunch.com/2024/01/23/meta-is-shutting-down-its-facebook-groups-api-for-developers/)).
  Por eso la app abre el [Share Dialog oficial](https://developers.facebook.com/docs/sharing/reference/share-dialog/)
  (requiere `META_APP_ID`; sin él usa `sharer.php`): tú eliges «Compartir en un grupo», el grupo, y publicas
  dentro de Facebook. Luego confirmas en la app. Una página solo puede *solicitar* unirse a un grupo; el
  administrador decide ([Ayuda de Facebook: unirse a un grupo](https://www.facebook.com/help/103763583048280)).
- No requiere permisos adicionales de Meta ni variables nuevas.

---

## 6. Variables de entorno

| Variable | Dónde | Secreta | Uso |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Netlify + `.env.local` | No | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Netlify + `.env.local` | No (protegida por RLS) | Clave pública (`sb_publishable_…` o la anon heredada) |
| `MKT_STORAGE_BACKEND` | No la definas en producción | No | `local` solo para desarrollo; en Netlify/Vercel se rechaza |
| `MKT_CONTACT_EMAIL` | Solo servidor | No | Recomendado: identificación ante OpenStreetMap y contacto en `/privacidad` (se fija al construir) |
| `TAVILY_API_KEY` | Solo servidor | **Sí** | Opcional: búsqueda web (plan gratuito sin tarjeta) |
| `GEMINI_API_KEY` / `GEMINI_FREE_TIER_CONFIRMED` / `GEMINI_MODEL` | Solo servidor | **Sí** / No / No | Opcional: redactar con Gemini solo en nivel gratuito confirmado |
| `META_APP_ID`, `META_APP_SECRET` | Solo servidor | **Sí** (el secreto) | Conexión oficial con Meta |
| `MKT_APP_URL` | Solo servidor | No | URL pública del sitio (si falta se usa `URL`, que Netlify define) |
| `META_GRAPH_VERSION` | Solo servidor | No | Opcional (por defecto `v26.0`) |
| `META_LOGIN_CONFIG_ID`, `META_PUBLISH_CONFIG_ID` | Solo servidor | No | Facebook Login for Business: ids de las configuraciones (lectura / publicación). Sin ellas se usa `scope` |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | **Sí** | **Solo** para guardar tokens de Meta y fijar «Conectado»; nada más la usa |
| `MKT_TOKEN_KEY` | Solo servidor | **Sí** | 32 bytes en base64 para cifrar tokens |
| `MKT_CRON_SECRET` | Solo servidor | **Sí** | 24+ caracteres; lo usa la función programada para pedir la publicación |
| `MKT_PUBLISHING_ENABLED` | Solo servidor | No | `1` activa la publicación automática de lo aprobado. Sin él, nada se publica |
| `MKT_FFMPEG_PATH`, `MKT_VIDEO_FONT` | Solo servidor | No | Montaje de video donde haya FFmpeg (no en Netlify) |

Nunca pongas valores secretos en variables con prefijo `NEXT_PUBLIC_`.

---

## 7. Fuentes de investigación

Ejecutadas en vivo con `npm run test:live` (mismo código que usa la app) desde el entorno donde se
construyó (15-oct-2026):

| Fuente | Resultado real | Qué falta |
| --- | --- | --- |
| Calendario comercial verificado | ✔ 7 fechas (periodo de 30 días y las 6 semanas siguientes) | Nada (datos locales) |
| OpenStreetMap (Nominatim/Overpass) | ✘ «No se pudo conectar con nominatim.openstreetmap.org»: la red de ese entorno lo bloquea | Probar desde Netlify o tu computadora |
| Google Trends (RSS) | ✘ «No se pudo conectar con trends.google.com»: bloqueado por la red | Probar desde Netlify o tu computadora |
| Tavily | Sin configurar | Cuenta gratuita en tavily.com (sin tarjeta) y `TAVILY_API_KEY` |
| Datos del negocio | Funciona contra la base | Cargar los negocios |
| Biblioteca de anuncios de Meta, Google Maps, Trends Explore, TikTok Creative Center | Asistidas | Consultarlas tú y registrar lo que ves |

No hay resultados de competencia en Durango registrados: ninguna fuente automática pudo consultarse
desde ese entorno y no se inventaron datos. Desde tu computadora: `npm run test:live`; en producción,
la primera investigación mostrará en «Fuentes consultadas» qué respondió cada fuente.

---

## 8. Video en producción

Netlify (plan gratuito) no incluye FFmpeg. La pestaña Video del Estudio muestra el comando exacto para
montar el video en tu computadora (FFmpeg es gratuito: https://ffmpeg.org).
