# Smart Business Vision AI

Panel de administración y análisis por cámaras para **Good Barber** y
**Glamour Studio**, pensado para usarse desde un iPhone (PWA).

> Etapa 1 (aplicación base). El motor de visión todavía no existe: todos los
> indicadores se muestran como **Pendiente** o **Sin datos**. La app nunca
> inventa cifras.

Es una app independiente dentro del repositorio: no toca la app de Good
Barber de la raíz ni `finanzas/`.

## Stack

Next.js 16 (exportación estática) · TypeScript · Supabase (Auth + Postgres
con RLS, esquema `vision`) · Zod · Vitest. Sin dependencias de pago.

## Ejecutar en local

Requisitos: Node.js 20.9 o superior.

```bash
cd vision
npm install
cp .env.example .env.local   # completa URL y clave publishable de Supabase
npm run dev                  # http://localhost:3000
```

Sin `.env.local` la app arranca y muestra "Configuración requerida" (no
finge ninguna conexión).

## Comprobaciones

```bash
npm run typecheck            # TypeScript estricto
npm test                     # pruebas unitarias (horarios, indicadores, validación)
bash supabase/tests/run.sh   # migraciones + RLS en un PostgreSQL local desechable
bash supabase/tests/integracion/run.sh  # no interferencia con el esquema real de Good Barber
npm run build                # genera out/ (sitio estático)
npm start                    # sirve out/ para probar el build
```

## Variables de entorno

| Variable | Pública | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sí | Clave publishable/anon. La app se niega a usar una `service_role`/`sb_secret_` |
| `NEXT_PUBLIC_SUPABASE_SCHEMA` | Sí | Esquema (por defecto `vision`) |

La `service_role` key y las credenciales RTSP **nunca** van aquí: solo en el
servidor del motor de visión (Etapa 2+).

## Desplegar (pendiente de aprobación)

Cloudflare Pages: directorio raíz `vision`, comando `npm run build`, salida
`out`, variables de arriba y `NODE_VERSION=22`. `public/_headers` aplica CSP y
cabeceras de seguridad.

## Documentación

- [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): auditoría técnica, decisiones, riesgos (CGNAT, RTSP, licencias, Oracle).
- [`docs/BASE-DE-DATOS.md`](docs/BASE-DE-DATOS.md): migraciones, RLS y cómo aplicarlas.
- [`docs/PENDIENTES.md`](docs/PENDIENTES.md): decisiones abiertas y siguientes etapas.
- [`docs/AUDITORIA-SEGURIDAD-INTEGRACION.md`](docs/AUDITORIA-SEGURIDAD-INTEGRACION.md): auditoría previa a la Etapa 2 (integración con Good Barber, respaldo, modelos, conectividad).
