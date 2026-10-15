# Marketing AI Studio

Centro de marketing con IA para administrar varios negocios (Good Barber, Glamour Studio,
AFORE PRO y los que vengan) desde un solo perfil. Vive en esta carpeta, separado de la app de
citas de Good Barber (raíz del repositorio), que no se modifica.

**Regla económica:** $0 MXN de gasto adicional en APIs. Ver `src/lib/providers/`.

## Estado (Etapa 1 y parte de la Etapa 2)

| Función | Estado |
| --- | --- |
| Inicio de sesión (Supabase Auth, sin registro público) | Funciona y está probado |
| Panel de inicio con resumen de negocios, publicaciones, campañas, conexiones y proveedores | Funciona (sin cifras inventadas) |
| Negocios: alta, edición, archivado, carga de los 3 negocios iniciales | Funciona |
| Identidad de marca, servicios y precios, promociones, perfiles sociales, historial | Funciona |
| Aislamiento de datos por negocio (RLS) y auditoría | Funciona y está probado |
| Registro honesto de proveedores de IA y bloqueo de gasto | Funciona (la invocación real llega en la Etapa 3) |
| Calendario, biblioteca, campañas, investigación, creación, mensajes, analíticas | **Pendiente**: la base de datos ya tiene tablas para calendario y campañas; las pantallas indican que no funcionan todavía |
| Conexión con Meta, publicación | **Pendiente** (Etapa 5): ninguna red está conectada |

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

### Garantías aplicadas en la base de datos (no solo en la interfaz)

- Un usuario solo ve y edita negocios de los que es miembro (`owner`/`editor`; `viewer` solo lee).
- Solo un administrador (`mkt_admins`) crea negocios, y siempre a su propio nombre.
- El navegador no puede marcar una red como «conectada» ni una publicación como «publicada»:
  eso lo hará el servidor solo tras la confirmación oficial de la plataforma.
- La auditoría se escribe por triggers; nadie puede insertarla ni editarla desde el navegador.
- Precios en centavos con validación; colores, URLs y longitudes validados con `CHECK`.

## Desarrollo local

```bash
cd marketing-studio
npm install
npm run local:up        # Postgres + Supabase Auth + PostgREST locales (sin Docker)
npm run local:seed      # admin@local.test / Admin12345!
npm run local:env > .env.local
npm run dev             # http://localhost:3000
```

## Pruebas

```bash
npm run lint && npm run typecheck
npm run test:unit         # lógica: dinero, validación, regla de gasto, proveedores
npm run test:integration  # RLS y reglas de la base contra el stack local
npm run build && npm run test:e2e   # navegador real (escritorio + iPhone)
```

## Despliegue

Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
