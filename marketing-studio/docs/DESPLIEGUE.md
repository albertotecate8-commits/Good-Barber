# Despliegue gratuito de Marketing AI Studio

Todo con planes gratuitos, sin tarjeta. Nada de esto se ha desplegado todavía.

## 1. Base de datos: proyecto Supabase nuevo (recomendado)

Usa un proyecto **separado** del de la app de citas de Good Barber. Motivo: la base de la
barbería tiene un trigger (`handle_new_auth_user`) que crea un perfil de **barbero** para cada
usuario nuevo de Auth; compartir el proyecto mezclaría cuentas y datos de ambas apps. El plan
gratuito de Supabase permite 2 proyectos activos por organización (los proyectos gratuitos se
pausan tras 1 semana sin actividad; se reactivan desde el panel).

1. supabase.com → **New project** (plan Free). Región sugerida: la más cercana disponible.
2. **SQL Editor** → pega y ejecuta, **en orden**:
   1. `supabase/migrations/20261015000000_mkt_core.sql`
   2. `supabase/migrations/20261016000000_mkt_calendar_library.sql` — crea la biblioteca, los
      campos del calendario y el bucket **privado** `mkt-assets` (50 MB por archivo) con sus
      políticas. No activa nada de pago: el plan gratuito incluye 1 GB de Storage.
   3. `supabase/migrations/20261017000000_mkt_director_research.sql` — investigación, hallazgos,
      planes de campaña, experimentos y registro de uso de IA.
   4. `supabase/migrations/20261018000000_mkt_creative_studio.sql` — estudio creativo, versiones,
      revisión de calidad, audio con licencia y dimensiones de imágenes.
   Son idempotentes. Para deshacer la segunda: `supabase/rollbacks/20261016000000_mkt_calendar_library.down.sql`
   (borra los registros de la biblioteca; los archivos del bucket hay que vaciarlos a mano).
   Comprueba en **Storage** que aparece el bucket `mkt-assets` marcado como privado.
3. **Authentication → Sign In / Providers → Email**: desactiva *Allow new users to sign up*.
4. **Authentication → Users → Add user**: crea tu usuario (correo + contraseña, marcado como confirmado).
5. **SQL Editor**:
   ```sql
   insert into mkt_admins (user_id)
   select id from auth.users where email = 'TU-CORREO';
   ```
6. **Project Settings → API**: copia la *Project URL* y la clave *anon/publishable*.
7. **Authentication → URL Configuration**: *Site URL* = la URL de Vercel del paso 2.

## 2. Hosting: Vercel (plan Hobby, gratuito)

1. Vercel → **Add New → Project** → importa este repositorio.
2. **Root Directory**: `marketing-studio`. Framework: Next.js (se detecta solo).
3. **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - (Etapa 3) `GEMINI_API_KEY` — secreta, sin prefijo `NEXT_PUBLIC_`.
4. Deploy. No hay que activar ningún complemento de pago.

> Nota: el plan Hobby de Vercel es para uso personal/no comercial según sus términos. Si
> consideras este uso comercial, alternativas gratuitas: Cloudflare Pages/Workers (con
> `@opennextjs/cloudflare`) o Netlify Free. Revísalo antes de decidir.

## 3. Variables de entorno

| Variable | Dónde | Secreta | Uso |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | No | URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | No (protegida por RLS) | Cliente Supabase |
| `MKT_STORAGE_BACKEND` | No la definas en producción | No | `local` solo para desarrollo; en Vercel se rechaza |
| `GEMINI_API_KEY` | Solo servidor | **Sí** | Opcional: redactar campañas con Gemini (nivel gratuito) |
| `GEMINI_FREE_TIER_CONFIRMED` | Solo servidor | No | `1` = confirmas que el proyecto de la clave **no** tiene facturación. Sin esto no se llama a Gemini |
| `GEMINI_MODEL` | Solo servidor | No | Opcional (por defecto `gemini-2.5-flash`) |
| `TAVILY_API_KEY` | Solo servidor | **Sí** | Opcional: búsqueda web (plan gratuito sin tarjeta) |
| `MKT_CONTACT_EMAIL` | Solo servidor | No | Recomendado: identificación ante OpenStreetMap |
| `MKT_FFMPEG_PATH`, `MKT_VIDEO_FONT` | Solo servidor | No | Montaje de video donde haya FFmpeg (no en Vercel) |
| `META_APP_ID`, `META_APP_SECRET` | Solo servidor | **Sí** | Conexión oficial con Meta (Etapa 5) |

Nunca pongas la `service_role` key de Supabase en Vercel para esta app: no la necesita.

## 4. Pasos de Meta (Etapa 5, todavía no)

Se documentarán con las rutas de retorno exactas cuando se construya la conexión. Requerirá:
crear una app en Meta for Developers con tu cuenta, verificar el negocio y pasar App Review
para `instagram_content_publish` / `pages_manage_posts`. La app nunca creará páginas nuevas
ni cambiará la propiedad de la página «Good barber».

## 5. Fuentes de investigación en producción

- **OpenStreetMap y Google Trends (RSS)** no requieren clave. Vercel tiene salida a internet, así que
  deberían responder; la primera investigación mostrará en «Fuentes consultadas» si funcionaron o el
  error exacto. En el entorno de desarrollo donde se construyó la app esos servidores estaban
  bloqueados por la red, por lo que **aún no se han probado en vivo**.
- **Tavily**: crea una cuenta gratuita en tavily.com (sin tarjeta), copia la clave en `TAVILY_API_KEY`.
- **Gemini** (opcional): clave de AI Studio en un proyecto sin facturación + `GEMINI_FREE_TIER_CONFIRMED=1`.
- Biblioteca de anuncios de Meta, Google Maps, Google Trends Explore y TikTok Creative Center son
  **asistidas**: se abren desde la investigación y registras lo que ves.

## 6. Video en producción

Vercel (plan gratuito) no incluye FFmpeg. En ese caso la pestaña Video del Estudio muestra el comando
exacto para montar el video en tu computadora (FFmpeg es gratuito: https://ffmpeg.org). Si algún día usas
un servidor propio con FFmpeg instalado, el botón «Montar video» funciona directamente.
