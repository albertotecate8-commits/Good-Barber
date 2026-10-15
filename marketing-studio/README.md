# Marketing AI Studio

Centro de marketing con IA para administrar varios negocios (Good Barber, Glamour Studio,
AFORE PRO y los que vengan) desde un solo perfil. Vive en esta carpeta, separado de la app de
citas de Good Barber (raíz del repositorio), que no se modifica.

**Regla económica:** $0 MXN de gasto adicional en APIs. Ver `src/lib/providers/`.

## Estado (Etapas 1, 2 y 3)

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
| Supabase Storage (bucket privado) | Código y políticas listos y probados contra un *mock* del esquema `storage`; **no probado contra un Supabase real** |
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
| Mensajes, analíticas automáticas | **Pendiente** |
| Conexión con Meta y publicación automática | **Pendiente** (Etapa 5): ninguna red está conectada; programar **no** publica |

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
  y se niega a usarlo en Vercel.
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

### Migraciones

| Archivo | Reversión |
| --- | --- |
| `supabase/migrations/20261015000000_mkt_core.sql` | — |
| `supabase/migrations/20261016000000_mkt_calendar_library.sql` | `supabase/rollbacks/20261016000000_mkt_calendar_library.down.sql` |
| `supabase/migrations/20261017000000_mkt_director_research.sql` | `supabase/rollbacks/20261017000000_mkt_director_research.down.sql` |

Todas son idempotentes. Las dos últimas se probaron aplicando, re-aplicando, revirtiendo y volviendo a aplicar. 

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
```

## Despliegue

Ver [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md).
