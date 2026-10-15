# Stack local de Supabase (sin Docker)

Para desarrollo y pruebas automáticas cuando no hay Docker disponible. Usa los
binarios **oficiales** de Supabase Auth (GoTrue) y PostgREST sobre un Postgres
local, con un proxy que expone las mismas rutas que Supabase (`/auth/v1`,
`/rest/v1`). No reemplaza a Supabase real; sirve para probar login, RLS y la app.

```bash
npm run local:up      # descarga binarios (1ª vez), crea la BD, aplica migraciones
npm run local:seed    # crea el administrador local admin@local.test / Admin12345!
npm run dev           # con .env.local apuntando a http://127.0.0.1:54321
npm run local:down
```

Las claves JWT de este stack son de prueba y solo funcionan en tu máquina.
