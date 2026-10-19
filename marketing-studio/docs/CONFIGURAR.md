# Configuración que requiere tu inicio de sesión

Todo lo demás ya está resuelto en el código. Estos pasos los tienes que hacer tú porque piden entrar a
tus cuentas. **Ninguno cuesta dinero ni pide tarjeta.** Los secretos se escriben **solo en Netlify**
(Project configuration → Environment variables, contexto **Production**, marcados como *secret*):
nunca en el chat, en el código ni en Git.

Sitio: <https://marketing-ai-studio-7c75.netlify.app> · Netlify: proyecto `marketing-ai-studio-7c75`.

---

## 1. Imágenes generadas de verdad: Cloudflare Workers AI (≈5 min)

Por qué: es la única API oficial de imágenes con nivel gratuito real (oct-2026). La suscripción de
ChatGPT no incluye la API de OpenAI y la API de imágenes de Gemini ya no tiene nivel gratuito. En el plan
**Workers Free**, lo que pase de 10,000 neuronas al día se rechaza: no se cobra. La app además se detiene
en 9,000 (~50 imágenes al día).

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up> (no agregues tarjeta ni plan de pago).
2. Copia tu **Account ID** (aparece en la página de inicio del panel o en *Workers & Pages → Overview*,
   columna derecha). No es secreto.
3. *My Profile → API Tokens → Create Token* → plantilla **Workers AI** → *Create*. Copia el token.
4. En Netlify crea:
   - `CLOUDFLARE_ACCOUNT_ID` = el Account ID
   - `CLOUDFLARE_AI_TOKEN` = el token (**secret**)
   - `CLOUDFLARE_FREE_PLAN_CONFIRMED` = `1` (tu confirmación de que la cuenta está en el plan gratuito)
5. Avísame «listo»: redespliego y pruebo una generación real en producción.

Sin estas variables la app sigue funcionando con el flujo de ChatGPT (copiar prompt → pegar la imagen).

---

## 2. Publicación oficial en Facebook e Instagram (≈20 min)

### 2.1 Por qué hace falta la clave secreta de Supabase (`SUPABASE_SERVICE_ROLE_KEY`)

Revisé el código. La clave se usa **solo en el servidor**, en `src/lib/meta/service.ts`, en
`src/lib/meta/worker.ts` (por medio de `adminClient`) y en la ruta del cron
`src/app/api/meta/publicar-programadas/route.ts`. Lo demás de la app usa la sesión del usuario y RLS.
RLS con las credenciales públicas no alcanza por tres razones:

1. **Los tokens de Meta no deben ser legibles desde el navegador.** `mkt_social_tokens` y
   `mkt_meta_oauth_sessions` tienen RLS activado **sin ninguna política**: ningún usuario, ni el dueño,
   puede leerlas con la clave pública. Si se agregara una política para que el dueño las leyera,
   cualquier sesión iniciada (o una sesión robada) podría descargar el token de la página por la API REST
   de Supabase. Solo el servidor, con la clave secreta, lee el token cifrado y lo descifra con
   `MKT_TOKEN_KEY`.
2. **La publicación programada corre sin usuario.** La función programada de Netlify no tiene sesión,
   así que `auth.uid()` es nulo y ninguna política RLS basada en el usuario la dejaría leer la
   publicación aprobada ni el token.
3. **Solo el servidor puede marcar «publicado».** Un trigger de la base rechaza `status = 'published'`,
   `external_post_id` y `external_post_url` si no vienen de la `service_role`. Así nadie puede fingir
   desde la app una publicación que Meta no confirmó.

Alternativa evaluada: funciones `SECURITY DEFINER` protegidas con el secreto del cron. Se descartó porque
mueve el secreto a la base de datos y crea un camino privilegiado más difícil de auditar, sin quitar la
necesidad de un acceso de servidor. La clave nunca llega al navegador: `npm run check:secrets` lo
comprueba en cada despliegue (módulos `server-only`).

Cómo llega a Netlify sin copiarla: la extensión oficial **Supabase** ya está instalada en el equipo de
Netlify. Solo falta autorizarla una vez (Netlify → proyecto → *Supabase* → *Connect* → elegir el proyecto
`marketing-ai-studio`). La extensión guarda `SUPABASE_SERVICE_ROLE_KEY` por su cuenta, como variable de
servidor.

### 2.2 Crear la app de Meta (con la cuenta que administra la página de Good Barber)

> No uses la cuenta que solo administra «Crujipollo». No crees páginas nuevas: se vincula la existente.

1. <https://developers.facebook.com/apps> → **Crear app**. Si te pide un caso de uso, elige
   **«Administrar todo en tu página» (Manage everything on your Page)**. Meta agrega solo
   `business_management`, `pages_show_list` y `public_profile`. Si te pide tipo, elige **Negocio** y
   vincula el portafolio comercial dueño de la página.
2. En ese caso de uso, *Personalizar* → agrega los permisos `pages_read_engagement`, `pages_manage_posts`,
   `instagram_basic` e `instagram_content_publish`.
3. **Facebook Login for Business → Configuraciones → Crear configuración** (token de **usuario**), dos veces:
   - «Lectura»: `pages_show_list`, `pages_read_engagement`, `instagram_basic`, `business_management`.
   - «Publicación»: las anteriores más `pages_manage_posts` e `instagram_content_publish`.

   Anota el **ID de configuración** de cada una.
4. **Facebook Login for Business → Configuración**:
   - URI de redireccionamiento OAuth válido: `https://marketing-ai-studio-7c75.netlify.app/api/meta/retorno`
5. **Configuración de la app → Básica**:
   - Dominios de la app: `marketing-ai-studio-7c75.netlify.app`
   - Política de privacidad: `https://marketing-ai-studio-7c75.netlify.app/privacidad`
   - Eliminación de datos: `https://marketing-ai-studio-7c75.netlify.app/eliminacion-de-datos`
   - Copia el **App ID** (no es secreto) y el **App Secret** (secreto).
6. Deja la app en **modo desarrollo**. Como eres administrador de la app y de la página, funciona con tus
   propias cuentas sin App Review.
7. En Netlify crea `META_APP_SECRET` (**secret**). `SUPABASE_SERVICE_ROLE_KEY` la pone la extensión de Supabase.
8. Mándame por el chat **solo** el App ID y los dos IDs de configuración (no son secretos). Yo los cargo
   como `META_APP_ID`, `META_LOGIN_CONFIG_ID` y `META_PUBLISH_CONFIG_ID` y redespliego.

Los nombres de menú pueden variar un poco según la versión del panel de Meta; si algo no coincide,
dime qué ves.

### 2.3 Conectar y probar (con tu aprobación)

1. En la app: *Negocios → Good Barber → Redes → Conectar con Meta*. Inicias sesión en Meta, eliges la
   página **existente** y su Instagram profesional. La app verifica la página y el Instagram por separado.
2. *Autorizar publicación* (segunda autorización, con los permisos de publicación).
3. Una sola publicación de prueba, **solo cuando la apruebes por escrito**. La publicación automática
   sigue apagada (`MKT_PUBLISHING_ENABLED` sin definir) hasta que tú lo autorices.
