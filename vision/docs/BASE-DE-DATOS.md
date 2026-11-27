# Base de datos — esquema `vision`

## Migraciones

| Archivo | Contenido |
|---|---|
| `supabase/migrations/20261127120000_vision_etapa1_base.sql` | Esquema, tablas, vistas, funciones, RLS y privilegios |
| `supabase/migrations/20261127120100_vision_etapa1_datos_iniciales.sql` | Establecimiento, 2 negocios, horario confirmado de Good Barber, 2 cámaras |

Ambas son **idempotentes** (se pueden volver a ejecutar) y no tocan el
esquema `public` de la app de Good Barber.

### Datos iniciales (solo hechos confirmados)

- Good Barber: lunes a viernes 2:00–8:00 p. m., sábado 11:00 a. m.–8:00 p. m.,
  domingo cerrado. Marcado como **confirmado**.
- Glamour Studio: **sin horario** y marcado como **pendiente de confirmar**.
- Una cámara TP-Link Tapo C100 por negocio, con análisis desactivado.
- **Cero** estaciones, empleados, métricas o eventos.

## Tablas

**Configuración** (editable desde la app según rol):
`sites`, `members`, `businesses`, `business_hours`, `cameras`, `stations`,
`counting_lines`.

**Resultados del motor** (solo lectura para la app; solo escribe `service_role`):
`engine_nodes`, `camera_health`, `camera_status_events`, `vision_events`,
`traffic_hourly`, `station_occupancy_hourly`, `station_live_state`,
`business_live_state`, `security_events`.

**Administración futura** (sin interfaz todavía):
`employees`, `service_types`, `service_logs`.

**Vistas** (`security_invoker`, respetan RLS): `camera_overview`,
`traffic_hourly_local`, `traffic_daily`, `station_occupancy_daily`.

## Roles y RLS

| Rol | Puede |
|---|---|
| sin membresía (incluye `anon` y cualquier otra cuenta del proyecto) | **Nada** |
| `viewer` | Leer todo lo de su establecimiento |
| `admin` | + configurar negocios, horarios, cámaras, estaciones, líneas; revisar eventos |
| `owner` | + administrar usuarios y el nombre del establecimiento |

Reglas adicionales probadas:

- Nadie puede autoasignarse un rol; solo el propietario da acceso
  (`add_member_by_email`) y nunca se puede quitar al último propietario.
- La app **no puede** insertar ni modificar métricas o eventos del motor
  (sin GRANT y sin política de escritura).
- Los eventos de seguridad solo cambian su estado de revisión mediante
  `review_security_event` (owner/admin).
- No se pueden borrar negocios (se desactivan) ni cámaras/estaciones con
  historial (FK `restrict`): el historial no se pierde.
- Coordenadas de zonas/líneas validadas en el servidor (0–1, 3–32 puntos).
- Horarios validados (apertura < cierre); zona horaria validada.

## Probar localmente (sin Supabase)

```bash
cd vision
bash supabase/tests/run.sh
```

Levanta un PostgreSQL temporal, simula los roles de Supabase, aplica las
migraciones dos veces (idempotencia) y ejecuta `supabase/tests/10_rls_tests.sql`.

## Aplicar en Supabase (REQUIERE APROBACIÓN — aún no se ha hecho)

Recomendación: el proyecto existente de Good Barber (ver
`ARQUITECTURA.md` §3, límite de 2 proyectos gratuitos).

1. **SQL Editor → New query**: pega y ejecuta la migración `…_base.sql`;
   luego la de `…_datos_iniciales.sql`.
2. **Project Settings → Data API → Exposed schemas**: agrega `vision`
   (sin esto la app muestra "El esquema de la base de datos no está expuesto").
3. **Authentication → URL Configuration**: agrega la URL de la app a
   *Redirect URLs*, por ejemplo `https://<tu-sitio>.pages.dev/restablecer/`
   (y `http://localhost:3000/restablecer/` para desarrollo).
4. **Primer propietario**: crea o reutiliza una cuenta en
   *Authentication → Users* y, en el SQL Editor:

   ```sql
   select vision.bootstrap_owner('correo-del-propietario@ejemplo.com', 'Propietario');
   ```

   Esta función no se puede ejecutar desde el navegador.
5. Confirma que el registro público esté desactivado
   (*Authentication → Sign In / Providers → Email → Allow new users to sign up*).
6. Si se usa el proyecto de Good Barber, añade `--schema=vision` al
   `pg_dump` de `.github/workflows/backup-database.yml`.

## Convenciones para futuras migraciones

- Nombre `AAAAMMDDHHMMSS_descripcion.sql`, siempre idempotente.
- Toda tabla nueva: `enable row level security`, políticas explícitas,
  GRANT mínimo, y caso de prueba en `supabase/tests/10_rls_tests.sql`.
- Actualizar `src/lib/domain/types.ts` y `src/lib/data/queries.ts`.
