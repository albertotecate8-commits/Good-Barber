# Despliegue gratuito de Marketing AI Studio

Todo con planes gratuitos, sin tarjeta. Nada de esto se ha desplegado todavía.

## 1. Base de datos: proyecto Supabase nuevo (recomendado)

Usa un proyecto **separado** del de la app de citas de Good Barber. Motivo: la base de la
barbería tiene un trigger (`handle_new_auth_user`) que crea un perfil de **barbero** para cada
usuario nuevo de Auth; compartir el proyecto mezclaría cuentas y datos de ambas apps. El plan
gratuito de Supabase permite 2 proyectos activos por organización (los proyectos gratuitos se
pausan tras 1 semana sin actividad; se reactivan desde el panel).

1. supabase.com → **New project** (plan Free). Región sugerida: la más cercana disponible.
2. **SQL Editor** → pega y ejecuta `supabase/migrations/20261015000000_mkt_core.sql`
   (es idempotente; se puede volver a ejecutar).
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
| `GEMINI_API_KEY` | Solo servidor | **Sí** | Textos con IA (Etapa 3) |
| `META_APP_ID`, `META_APP_SECRET` | Solo servidor | **Sí** | Conexión oficial con Meta (Etapa 5) |

Nunca pongas la `service_role` key de Supabase en Vercel para esta app: no la necesita.

## 4. Pasos de Meta (Etapa 5, todavía no)

Se documentarán con las rutas de retorno exactas cuando se construya la conexión. Requerirá:
crear una app en Meta for Developers con tu cuenta, verificar el negocio y pasar App Review
para `instagram_content_publish` / `pages_manage_posts`. La app nunca creará páginas nuevas
ni cambiará la propiedad de la página «Good barber».
