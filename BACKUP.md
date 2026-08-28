# Respaldo y recuperación de Good Barber

Good Barber corre sobre el plan **gratuito** de Supabase, que no incluye ningún
respaldo automático (los backups diarios nativos de Supabase son una función
del plan Pro en adelante). Para no depender de eso, este repo tiene un
workflow de GitHub Actions (`.github/workflows/backup-database.yml`) que hace
un respaldo lógico (`pg_dump`) del esquema `public` — es decir, todas las
tablas de negocio: `profiles`, `barbers`, `clients`, `services`,
`service_records`, `daily_promotions`, `weekly_periods`, `settlements`,
`settings`.

**Nunca respalda el esquema `auth`** (usuarios de Supabase Auth, contraseñas
cifradas), a propósito: así el archivo de respaldo nunca contiene ni siquiera
un hash de contraseña. Tampoco necesita ni usa la `service_role key` — usa la
contraseña normal de conexión a Postgres, que es un secreto distinto y solo
vive como secreto de GitHub Actions (nunca en el código, nunca en el
frontend).

Como este repositorio es **público**, el respaldo se cifra (AES-256) antes de
subirse como artifact — así, aunque un artifact de un repo público sea técnicamente
descargable, su contenido es ilegible sin la frase de cifrado.

## 1. Configuración inicial (una sola vez)

Necesitas crear **dos secretos** en GitHub. Ve a: repositorio → **Settings →
Secrets and variables → Actions → New repository secret**.

1. **`SUPABASE_DB_URL`** — la cadena de conexión directa a Postgres.
   - Panel de Supabase → **Project Settings → Database → Connection string**
     → pestaña **URI** (no uses el "pooler"/pgbouncer, `pg_dump` necesita la
     conexión directa).
   - Copia esa URI y reemplaza `[YOUR-PASSWORD]` por tu contraseña real de
     base de datos (está en la misma página, o puedes resetearla ahí si no la
     tienes).
   - Pega el resultado completo como valor del secreto.
2. **`BACKUP_ENCRYPTION_PASSPHRASE`** — cualquier frase larga y única que tú
   inventes (no la de tu correo ni la de Supabase). **Guárdala aparte** (un
   gestor de contraseñas, por ejemplo) — si la pierdes, los respaldos
   cifrados quedan irrecuperables.

Ninguno de estos dos valores pasa nunca por mí ni queda en el código del
repositorio — solo tú los ves, dentro de la configuración de GitHub.

## 2. Cómo correr un respaldo

- **Automático:** todos los días a las 09:00 UTC, sin que tengas que hacer nada.
- **Manual (recomendado antes de cualquier cambio grande):** pestaña
  **Actions** del repo → "Respaldo de la base de datos de Good Barber" →
  **Run workflow**.

## 3. Cómo descargar y leer un respaldo

1. Pestaña **Actions** → abre la ejecución que quieras → sección
   **Artifacts**, descarga `good-barber-backup-<id>.zip` y descomprímelo
   (obtienes `backup.sql.enc`).
2. Descífralo en tu computadora (necesitas `openssl`, viene instalado en Mac
   y Linux; en Windows usa WSL o Git Bash):

   ```bash
   openssl enc -aes-256-cbc -pbkdf2 -d -in backup.sql.enc -out backup.sql -pass pass:TU_FRASE_DE_CIFRADO
   ```

3. `backup.sql` es texto plano SQL — puedes abrirlo con cualquier editor para
   revisar qué contiene.

**Límite del plan gratuito de GitHub:** los artifacts se retienen 90 días y
luego se borran automáticamente. Si necesitas guardar un respaldo más tiempo,
descárgalo y guárdalo tú (por ejemplo, en Google Drive).

## 4. Cómo restaurar

### Caso A — Perdiste/dañaste datos, pero el proyecto de Supabase sigue siendo el mismo (el caso más común)

Las tablas y los usuarios de Auth ya existen, así que el respaldo se puede
restaurar directamente:

```bash
psql "TU_CONNECTION_STRING_DE_SUPABASE" -f backup.sql
```

Como el `.sql` no incluye `DROP TABLE` (a propósito, para no arriesgar borrar
nada por accidente), esto inserta/actualiza sin destruir lo que ya esté ahí.
Si necesitas reemplazar por completo una tabla específica, avísame antes de
hacerlo — eso sí es una operación destructiva y merece confirmación explícita
tuya primero.

### Caso B — Se perdió el proyecto de Supabase completo (caso extremo)

1. Crea un proyecto nuevo de Supabase.
2. Ejecuta `supabase/schema.sql` completo en el SQL Editor (crea las 9 tablas,
   RLS, funciones y triggers — ver README, sección 2).
3. **Importante:** los `id` de `profiles`/`barbers` en el respaldo apuntan a
   los usuarios de Auth del proyecto viejo, que ya no existen. No se puede
   restaurar `profiles`/`barbers` tal cual en un proyecto nuevo — hay que:
   - crear de nuevo las cuentas (admin vía "Configuración inicial", barberos
     vía el panel admin, con los mismos correos);
   - y luego migrar manualmente `clients`, `services`, `service_records`,
     etc., enlazándolos a los `barber_id` **nuevos** (por nombre/correo, no
     por el UUID viejo).
   Si llegas a este caso, dímelo y te ayudo a hacer esa migración con
   cuidado — no es un solo comando automático, precisamente para no
   arriesgar mezclar datos de la persona equivocada.

## 5. Qué protege esto y qué no

- Protege: clientes, servicios, ventas/`service_records`, barberos,
  `settings` (config 60/40), `weekly_periods`, `settlements` — todo lo que
  pediste.
- No incluye contraseñas ni ninguna clave (`service_role`/`secret`) — nunca
  están en este respaldo, ni cifradas ni en claro.
- No sustituye tener cuidado al operar la base real: este respaldo es para
  recuperarte de un desastre (borrado accidental, proyecto perdido), no una
  excusa para hacer cambios destructivos sin pensar.
