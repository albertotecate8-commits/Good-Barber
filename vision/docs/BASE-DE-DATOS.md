# Base de datos — proyecto de Supabase propio de Smart Business Vision

## 0. Estado actual del proyecto (27 nov 2026)

| Dato | Valor |
|---|---|
| Organización | «Camaraia» (plan **Free**), cuenta independiente de Good Barber y Finanzas |
| Proyecto | `smart-business-vision` · ref `mwyerhivkvumsepxynyq` · us-east-1 · PostgreSQL 17 |
| URL | `https://mwyerhivkvumsepxynyq.supabase.co` |
| Costo | Supabase lo creó sin pedir confirmación de costo ($0) |
| Migraciones aplicadas | `vision_etapa1_base`, `vision_etapa1_datos_iniciales`, `vision_rol_motor` (aplicadas por el conector) |

Verificación en el proyecto real (consultas de solo lectura y Security Advisor):

- 19 tablas, **0 sin RLS**, 60 políticas.
- `anon` sin acceso al esquema `vision`.
- La app (`authenticated`) no puede escribir métricas ni ejecutar `bootstrap_owner`.
- `vision_engine` no tiene login, no ve `auth`, no lee `members` y no puede borrar.
- Datos: 1 establecimiento (`America/Mexico_City`), Good Barber con horario confirmado (7 días), Glamour Studio pendiente, 2 cámaras Tapo C100, 0 estaciones, 0 miembros, 0 usuarios de Auth.
- **Security Advisor: sin advertencias.**

Pendiente en el panel (el conector no puede hacerlo):

- §3.2: desactivar el registro público.
- §3.4: URL Configuration.
- §3.6: agregar `vision` a *Exposed schemas*.
- §3.7: crear tu usuario y ejecutar `bootstrap_owner`.

## 1. Decisión

Smart Business Vision usa un **proyecto de Supabase nuevo e independiente**,
exclusivo para esta app:

- **No** usa el proyecto de Good Barber (`sisgfnykjzovnaxylxyq`) ni el de
  Finanzas (`mwskrwkkiuifedatuvca`). El frontend se niega a arrancar si se le
  configura cualquiera de esas dos URL (`src/lib/env.ts`, con prueba).
- Auth, usuarios, RLS, esquema `vision`, permisos y respaldos son
  **independientes**. Ningún cambio aquí afecta a las otras apps.
- El proyecto lo crea **el propietario**. Este repositorio no crea recursos en
  la nube.

> **Antes de crearlo — plan gratuito:** Supabase permite **2 proyectos
> gratuitos activos** sumando todas las organizaciones donde eres propietario
> o administrador, y ya existen Good Barber y Finanzas. Si al crear el
> proyecto el panel pide pausar otro proyecto o cambiar a un plan de pago,
> **no aceptes**: no pauses Good Barber ni Finanzas y no actives el plan Pro.
> Detente y decidamos juntos.
>
> Además, los proyectos gratuitos se **pausan tras ~1 semana sin actividad**.
> Mientras no exista el motor de visión, entrar a la app de vez en cuando
> mantiene el proyecto activo. Si se pausa, se reactiva desde el panel.

## 2. Migraciones (`vision/supabase/migrations/`)

| Orden | Archivo | Contenido |
|---|---|---|
| 1 | `20261127120000_vision_etapa1_base.sql` | Esquema `vision`, tablas, vistas, funciones, RLS y permisos de la app |
| 2 | `20261127120100_vision_etapa1_datos_iniciales.sql` | Establecimiento, 2 negocios, horario confirmado de Good Barber y 2 cámaras Tapo C100 |
| 3 | `20261127120200_vision_rol_motor.sql` | Rol `vision_engine` con permisos mínimos para el motor (sin login) |

Las tres son **idempotentes** (se pueden volver a ejecutar).

Datos iniciales (solo hechos confirmados):

- Good Barber, horario **confirmado**: lunes a viernes 2:00–8:00 p. m.,
  sábado 11:00 a. m.–8:00 p. m., domingo cerrado.
- Glamour Studio: **sin horario**, marcado como pendiente de confirmar.
- Exactamente **una cámara TP-Link Tapo C100 por negocio**, con el análisis
  desactivado.
- Zona horaria `America/Mexico_City` (Durango, UTC−6).
- **Cero** estaciones, empleados, métricas o eventos.

## 3. Crear y configurar el proyecto (lo haces tú)

1. **Crear el proyecto** (supabase.com → New project):
   - Nombre sugerido: `smart-business-vision`.
   - Plan: **Free** (confirma que diga $0).
   - Región: la más cercana a México de las que ofrezca el panel (por ejemplo,
     una de Estados Unidos).
   - Contraseña de la base de datos: genera una larga y guárdala en tu gestor
     de contraseñas. **No me la envíes.** Solo se necesitará para el
     respaldo y, si lo autorizas, para crear el usuario del motor.
2. **Auth → Sign In / Providers → Email**:
   - Proveedor de correo y contraseña **activado**.
   - **Desactiva «Allow new users to sign up»**. Las cuentas las creas tú; no
     hay registro público.
3. **Auth → Policies / Passwords** (si el panel lo ofrece): longitud mínima
   10, igual que la app.
4. **Auth → URL Configuration**:
   - *Site URL*: la URL donde se publique la app. Mientras no exista,
     `http://localhost:3000`.
   - *Redirect URLs*: `http://localhost:3000/restablecer/` y, cuando exista,
     `https://<tu-sitio>/restablecer/`.
5. **SQL Editor → New query**: ejecuta las tres migraciones **en orden**,
   pegando cada archivo completo.
6. **Project Settings → Data API → Exposed schemas**: agrega `vision`.
   Opcional, para endurecer: como `public` queda vacío en este proyecto,
   puedes quitarlo de la lista.
7. **Primer propietario**:
   1. *Authentication → Users → Add user*: tu correo y una contraseña (marca
      «Auto confirm» si aparece).
   2. En el SQL Editor:
      ```sql
      select vision.bootstrap_owner('tu-correo@ejemplo.com', 'Propietario');
      ```
      Esta función no se puede ejecutar desde el navegador ni con la clave
      publishable.
8. **Verificación** (solo lectura, en el SQL Editor). Debe devolver
   exactamente lo indicado en cada comentario:
   ```sql
   -- 0 filas: ninguna tabla de vision sin RLS
   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'vision' and c.relkind = 'r' and not c.relrowsecurity;

   -- false, false, false: anon no ve nada y el motor no ve auth
   select has_schema_privilege('anon', 'vision', 'usage') as anon_vision,
          has_schema_privilege('vision_engine', 'auth', 'usage') as motor_auth,
          has_table_privilege('vision_engine', 'vision.members', 'select') as motor_members;

   -- 1 fila con role = 'owner'
   select user_id, role, active from vision.members;
   ```
   Revisa también **Advisors → Security Advisor** del panel y comparte
   conmigo cualquier advertencia.

## 4. Conectar la app (variables de entorno)

Datos que necesito de ti. Son **públicos** y se pueden enviar sin riesgo:

| Dato | Dónde está en el panel | Variable |
|---|---|---|
| Project URL | Project Settings → Data API (o «Connect») | `NEXT_PUBLIC_SUPABASE_URL` |
| Clave **publishable** (`sb_publishable_…`) o «anon» | Project Settings → API Keys | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

**No me envíes nunca:** la contraseña de la base de datos, la clave
`service_role` / `sb_secret_…`, la cadena de conexión con contraseña ni la
contraseña de tu cuenta.

En local:

```bash
cd vision
cp .env.example .env.local
# editar .env.local:
#   NEXT_PUBLIC_SUPABASE_URL=https://<ref-del-proyecto-de-vision>.supabase.co
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
#   NEXT_PUBLIC_SUPABASE_SCHEMA=vision
npm run dev
```

En el hosting (cuando se autorice): las mismas tres variables en la
configuración del proyecto (Cloudflare Pages → Settings → Variables), y
volver a compilar. Como las variables `NEXT_PUBLIC_*` se incrustan al
compilar, cambiar de proyecto exige un build nuevo.

Protecciones del frontend (`src/lib/env.ts`):

- Si falta una variable → pantalla «Configuración requerida».
- Si la clave es `service_role` o `sb_secret_` → se niega a usarla.
- Si la URL es la de Good Barber o Finanzas → se niega a arrancar.

## 5. Roles y RLS

| Quién | Puede |
|---|---|
| `anon` (sin sesión) | **Nada** del esquema `vision` |
| Cuenta de Auth sin fila en `vision.members` | **Nada** |
| `viewer` | Leer todo lo de su establecimiento |
| `admin` | Además: configurar negocios, horarios, cámaras, estaciones y líneas; revisar eventos |
| `owner` | Además: administrar usuarios y el nombre del establecimiento |
| `vision_engine` (motor) | Leer configuración; escribir resultados. Nada más (ver §6) |
| `service_role` | Tiene acceso total por diseño de Supabase. **No la usa nadie**: ni la app ni el motor |

Reglas comprobadas por las pruebas (`supabase/tests/10_rls_tests.sql`):

- Nadie puede asignarse un rol a sí mismo. Solo el propietario da acceso
  (`add_member_by_email`), y nunca se puede quitar al último propietario.
- Borrar una cuenta en Auth elimina su membresía en cascada sin bloquear Auth.
- La app no puede escribir métricas ni eventos del motor. Los eventos de
  seguridad solo se revisan con `review_security_event` (owner/admin).
- No se borran negocios (se desactivan). Tampoco cámaras o estaciones que
  tengan historial.
- Se validan coordenadas de zonas y líneas, horarios y zona horaria.

## 6. Usuario del motor de visión (Etapa 2 — no crear todavía)

El motor **no usa la `service_role`**. Se conecta a PostgreSQL con un usuario
propio que hereda de `vision_engine`:

| Permiso | Tablas |
|---|---|
| Leer | `sites`, `businesses`, `business_hours`, `cameras`, `stations`, `counting_lines` |
| Leer, insertar y actualizar (upsert) | `engine_nodes`, `camera_health`, `traffic_hourly`, `station_occupancy_hourly`, `station_live_state`, `business_live_state` |
| Solo insertar | `vision_events`, `camera_status_events` |
| Leer e insertar (sin modificar) | `security_events` |
| **Prohibido** | `members`, empleados, servicios, `auth.*`, borrar filas, cambiar la configuración, revisar eventos |

Cuando se autorice la Etapa 2, el propietario lo crearía así, en el SQL Editor:

```sql
create role vision_motor_oracle login password 'CONTRASEÑA-LARGA-GENERADA'
  in role vision_engine connection limit 4;
alter role vision_motor_oracle set statement_timeout = '15s';
```

- La contraseña se genera en tu gestor de contraseñas y **no** se escribe en
  el repositorio ni en el chat. El SQL Editor puede guardar la consulta en su
  historial: bórrala después.
- La cadena de conexión (desde el botón «Connect» del panel, modo *pooler*) se
  guarda **solo** como variable de entorno en el servidor del motor, por
  ejemplo `VISION_DB_URL`, con `sslmode=require`.
- Rotar: `alter role vision_motor_oracle password '…';` · Revocar de
  inmediato: `drop role vision_motor_oracle;`.
- **Por verificar en la Etapa 2, en el proyecto real:** que el pooler de
  Supabase acepte este usuario personalizado. Su formato suele ser
  `vision_motor_oracle.<ref>`.

## 7. Respaldo y recuperación

El plan gratuito **no incluye respaldos automáticos**. El respaldo actual del
repositorio (`.github/workflows/backup-database.yml`) es de Good Barber y
**no se toca**.

Propuesta (requiere tu autorización): un workflow **separado**, con secretos
propios (`VISION_SUPABASE_DB_URL` y `VISION_BACKUP_PASSPHRASE`). Se crearía
solo cuando lo apruebes y cuando existan esos secretos; si no, fallaría cada
día.

```yaml
# .github/workflows/backup-vision.yml  (PROPUESTA — no creado)
name: Respaldo de Smart Business Vision
on:
  schedule: [{ cron: "15 9 * * *" }]
  workflow_dispatch: {}
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - name: Respaldar solo los datos del esquema vision
        env: { DATABASE_URL: "${{ secrets.VISION_SUPABASE_DB_URL }}" }
        run: pg_dump "$DATABASE_URL" --schema=vision --data-only --no-owner --no-privileges -f vision.sql
      - name: Cifrar
        env: { PASS: "${{ secrets.VISION_BACKUP_PASSPHRASE }}" }
        run: openssl enc -aes-256-cbc -pbkdf2 -salt -in vision.sql -out vision.sql.enc -pass env:PASS && rm vision.sql
      - uses: actions/upload-artifact@v4
        with: { name: "vision-backup-${{ github.run_id }}", path: vision.sql.enc, retention-days: 90 }
```

**Restauración** (probada localmente en `supabase/tests/run.sh`):

1. Proyecto con las mismas cuentas de Auth. Ejecuta todas las migraciones
   **excepto** `…_datos_iniciales.sql` (crearía un segundo establecimiento).
2. Descifra el respaldo y ejecútalo (`psql "<conexión>" -f vision.sql`).
3. Resultado de la prueba: las mismas filas por tabla, RLS y permisos
   correctos, y `anon` sin acceso.
4. Si el proyecto se pierde por completo, las cuentas de Auth cambian de id:
   `vision.members` debe volver a enlazarse por correo.

**Reversión total:** al ser un proyecto independiente, basta con
`drop schema vision cascade; drop role vision_engine;` o con eliminar el
proyecto. Las otras apps no se ven afectadas.

## 8. Probar localmente (sin Supabase)

```bash
cd vision
bash supabase/tests/run.sh
```

Levanta un PostgreSQL temporal y simula los roles y `auth` de Supabase.
Después:

1. Aplica las migraciones dos veces, para comprobar que son idempotentes.
2. Prueba RLS con `anon`, cuenta ajena, `viewer`, `admin` y `owner`.
3. Prueba el rol del motor.
4. Prueba el borrado en cascada desde Auth.
5. Hace un ensayo de respaldo y restauración en una base nueva.

## 9. Convenciones para futuras migraciones

- Nombre `AAAAMMDDHHMMSS_descripcion.sql`, siempre idempotente, dentro de
  `vision/supabase/migrations/`.
- Toda tabla nueva lleva:
  - `enable row level security`.
  - Políticas explícitas para `authenticated` y, si aplica, para `vision_engine`.
  - Los permisos (GRANT) mínimos.
  - Un caso de prueba en `supabase/tests/10_rls_tests.sql`.
- Actualizar `src/lib/domain/types.ts` y `src/lib/data/queries.ts`.
