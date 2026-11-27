# Smart Business Vision AI

Panel de administración y análisis por cámaras para **Good Barber** y
**Glamour Studio**, pensado para usarse desde un iPhone (PWA).

> Etapa 1 (aplicación base). El motor de visión todavía no existe: todos los
> indicadores se muestran como **Pendiente** o **Sin datos**. La app nunca
> inventa cifras.

Es una app independiente dentro del repositorio, con **su propio proyecto de
Supabase** (Auth, base de datos, RLS). No usa, no lee y no modifica los
proyectos de Good Barber ni de Finanzas; el frontend se niega a arrancar si
se le configura la URL de cualquiera de esos dos proyectos.

## Stack

Next.js 16 (exportación estática) · TypeScript · Supabase propio (Auth +
Postgres con RLS, esquema `vision`) · Zod · Vitest. Sin dependencias de pago.

## Ejecutar en local

Requisitos: Node.js 20.9 o superior.

```bash
cd vision
npm install
cp .env.example .env.local   # URL y clave publishable del proyecto de Vision
npm run dev                  # http://localhost:3000
```

Sin `.env.local` la app arranca y muestra "Configuración requerida" (no
finge ninguna conexión). Cómo crear y conectar el proyecto:
[`docs/BASE-DE-DATOS.md`](docs/BASE-DE-DATOS.md).

## Comprobaciones

```bash
npm run typecheck            # TypeScript estricto
npm test                     # pruebas unitarias (horarios, indicadores, validación, configuración)
bash supabase/tests/run.sh   # migraciones + RLS + rol del motor + respaldo/restauración (PostgreSQL local)
npm run build                # genera out/ (sitio estático)
# Pruebas contra el Supabase real (credenciales en archivos locales, ver el encabezado del script):
NODE_USE_ENV_PROXY=1 node --env-file=.env.local scripts/prueba-supabase-real.mjs
npm start                    # sirve out/ para probar el build
```

## Variables de entorno

**Frontend** (`vision/.env.local`, o en el hosting). Todas son públicas por diseño:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto **de Vision** (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave publishable/anon de ese proyecto. La app rechaza una `service_role`/`sb_secret_` |
| `NEXT_PUBLIC_SUPABASE_SCHEMA` | Esquema (por defecto `vision`) |

**Motor de visión** (solo en el servidor de procesamiento, Etapa 2+; nunca
en el repositorio ni en el frontend): cadena de conexión del usuario limitado
del motor y credenciales RTSP. Ver `docs/BASE-DE-DATOS.md` §6.

La `service_role` key no se usa ni en el frontend ni en el motor.

## Publicación

**https://smart-business-vision.netlify.app**: Netlify, plan gratuito, sitio
estático. `netlify.toml` compila y ejecuta `scripts/revisar-secretos.mjs`
antes de publicar. Las variables `NEXT_PUBLIC_*` están en Netlify, no en el
repositorio. `wrangler.toml` queda listo por si después se usa Cloudflare
Pages. `public/_headers` aplica CSP y las cabeceras de seguridad en ambos.

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): arquitectura, decisiones y contrato con el motor.
- [`docs/BASE-DE-DATOS.md`](docs/BASE-DE-DATOS.md): crear y conectar el proyecto de Supabase, migraciones, RLS, usuario del motor, respaldo.
- [`docs/AUDITORIA-SEGURIDAD-INTEGRACION.md`](docs/AUDITORIA-SEGURIDAD-INTEGRACION.md): auditoría previa a la Etapa 2 (seguridad, respaldo, modelos, conectividad).
- [`docs/FASE-1-ESTADO.md`](docs/FASE-1-ESTADO.md): estado de la Fase 1 por criterio de aceptación y bloqueos.
- [`engine/README.md`](engine/README.md): motor de visión.
- [`docs/PENDIENTES.md`](docs/PENDIENTES.md): decisiones abiertas.
