# Good Barber — Sistema de administración de barbería

Aplicación web estática (HTML + CSS + JavaScript, sin frameworks ni build) conectada
a **Supabase** (Auth + Postgres + Row Level Security) para administrar una barbería
con un administrador y dos barberos, cada uno con su propia cuenta y sus propios datos.

## Índice

1. [Arquitectura](#arquitectura)
2. [Configurar Supabase](#1-configurar-supabase)
3. [Crear las tablas y la seguridad (RLS)](#2-crear-las-tablas-y-la-seguridad-rls)
4. [Crear el primer administrador](#3-crear-el-primer-administrador)
5. [Crear los barberos](#4-crear-los-barberos)
6. [Ejecutar el proyecto](#5-ejecutar-el-proyecto)
7. [Desplegar](#6-desplegar)
8. [Administrar servicios y precios](#7-administrar-servicios-y-precios)
9. [Administrar usuarios](#8-administrar-usuarios)
10. [Recuperar contraseña](#9-recuperar-contraseña)
11. [Migrar datos antiguos de localStorage](#10-migrar-datos-antiguos-de-localstorage)
12. [Modelo de datos y reglas de negocio](#11-modelo-de-datos-y-reglas-de-negocio)
13. [Seguridad](#12-seguridad)

## Arquitectura

- **Frontend:** HTML/CSS/JS puro, sin build ni framework. `index.html` carga módulos ES
  desde `js/` (`app.js` es el punto de entrada).
- **Backend:** Supabase (Postgres + Auth + Row Level Security + una Edge Function).
- **Sin servidor propio:** se despliega como sitio estático (GitHub Pages, Netlify,
  Vercel estático, etc.).
- `localStorage` solo se usa para datos no críticos (nunca para información del
  negocio); toda la información real vive en Supabase.

```
index.html            Shell de la app (carga los módulos)
supabase-config.js     Cliente Supabase (URL + clave pública)
manifest.json / sw.js  PWA (instalable, cachea solo el shell estático)
css/styles.css         Sistema de diseño
js/
  app.js               Bootstrap y enrutado por rol (admin/barbero)
  auth.js              Login, logout, recuperación de contraseña, sesión
  data.js              Todas las consultas a Supabase
  calc.js              Reglas de negocio: totales, reparto 60/40, cortes
  money.js             Aritmética monetaria en centavos (sin errores de float)
  dates.js             Fechas en horario local del negocio
  ui.js                Toasts, modales, loading, mensajes de error
  shell.js             Sidebar (escritorio) + nav inferior (móvil)
  render-login.js       Pantalla de login
  render-barber.js      Panel del barbero
  render-admin.js       Panel del administrador
  migration.js          Migración de datos antiguos de localStorage
supabase/
  schema.sql            Esquema completo: tablas, RLS, funciones, triggers, semillas
  functions/admin-create-barber/index.ts   Edge Function para crear barberos
```

## 1. Configurar Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa uno existente).
2. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon / publishable key** (la clave pública, NUNCA la `service_role`)
3. Ábre `supabase-config.js` en la raíz del proyecto y reemplaza esos dos valores:

   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_KEY = "sb_publishable_xxxxxxxxxxxxxxxx";
   ```

   Esta clave es segura de exponer en el frontend: la protección real la dan las
   políticas de Row Level Security del paso siguiente, no el secreto de la clave.

## 2. Crear las tablas y la seguridad (RLS)

1. En el Dashboard de Supabase abre **SQL Editor → New query**.
2. Copia y pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql).
3. Ejecuta. Esto crea:
   - Tablas: `profiles`, `barbers`, `clients`, `services`, `service_records`,
     `daily_promotions`, `weekly_periods`, `settlements`, `settings`.
   - Funciones de seguridad (`is_admin()`, `current_barber_id()`, etc.) y triggers.
   - Row Level Security habilitado y con políticas en **todas** las tablas.
   - El catálogo de servicios original como datos semilla.
4. Es seguro volver a ejecutar el script completo si necesitas actualizarlo (usa
   `create or replace` / `drop policy if exists`), excepto que los datos semilla de
   servicios solo se insertan si la tabla está vacía.
5. **OBLIGATORIO**: en **Authentication → Sign In / Providers → Email**, desactiva
   "Allow new users to sign up" (el nombre exacto varía según la versión del dashboard).
   Sin este paso, cualquier persona podría llamar directamente a
   `supabase.auth.signUp()` desde la consola del navegador (usando la publishable key,
   que es pública por diseño) y crearse una cuenta de barbero por su cuenta, saltándose
   por completo el panel de administrador. Ninguna protección de este repo puede
   deshabilitar el endpoint público de registro de Supabase Auth — es una opción del
   propio proyecto, no de esta app.

## 3. Crear el primer administrador

El rol nunca se puede elegir libremente desde el frontend: la app solo permite
autoasignar `role = 'admin'` una única vez, mientras no exista ningún administrador
todavía, y ese chequeo se repite de forma atómica en el servidor.

1. Abre la app → pantalla de login → **"Crear cuenta"**.
2. Como todavía no existe ningún administrador, verás **"Configuración inicial"**:
   correo, contraseña, confirmar contraseña → **"Crear administrador"**.
3. Esto llama a la Edge Function `bootstrap-admin`, que:
   - comprueba en la base de datos que no exista ya ningún `profiles.role = 'admin'`
     (si existe, rechaza con 409 y no crea nada);
   - crea el usuario con la Auth Admin API (`service_role`, solo en el servidor);
   - lo promueve a `admin` llamando a la función SQL `promote_first_admin()`, que repite
     el mismo chequeo de forma atómica dentro de la transacción (protege contra dos
     peticiones simultáneas) y que **solo** el rol `service_role` puede ejecutar (revocada
     para `anon`/`authenticated`/`public` — ni siquiera con una sesión iniciada se puede
     invocar desde el navegador);
   - si la promoción falla (p. ej. perdió la carrera), borra el usuario recién creado
     para no dejar una cuenta huérfana.
4. En cuanto existe un administrador, este flujo se bloquea automáticamente: cualquier
   intento posterior de usar "Configuración inicial" (incluida una petición manipulada
   enviada directamente a la Edge Function, sin pasar por la interfaz) recibe 409 y no
   crea ni modifica nada.

Alternativa manual (si prefieres no usar el flujo de la app):

1. En **Authentication → Users → Add user**, crea el usuario (correo + contraseña).
2. En **SQL Editor**:

   ```sql
   update public.profiles set role = 'admin' where email = 'correo-del-admin@ejemplo.com';
   ```

## 4. Crear los barberos

**Únicamente un administrador ya autenticado puede crear barberos** — no existe ningún
registro público para barberos (ver el paso "OBLIGATORIO" de la sección 2).

Desde el panel de administrador → **Barberos → + Nuevo barbero**, indicando nombre,
correo, una contraseña temporal, el **reparto %** (60% por defecto) y el **estado**
(activo/inactivo). Internamente esto llama a la Edge Function `admin-create-barber`,
que:

- verifica en el servidor que quien llama tiene una sesión válida y `profiles.role =
  'admin'` activo (nunca confía en lo que diga el frontend);
- crea el usuario en Supabase Auth usando la `service_role` key **solo del lado del
  servidor** (nunca en el navegador);
- crea su fila en `barbers` con el reparto y estado indicados;
- si algo falla a mitad de camino, revierte (borra el usuario de Auth) en vez de dejar
  una cuenta a medio crear.

Un barbero no puede invocar esta función para crear a otro usuario (ni barbero ni
admin): el primer chequeo de la función rechaza con 403 a cualquiera cuyo
`profiles.role` no sea `admin`.

Para (re)desplegar las funciones (requiere [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref TU-PROYECTO
supabase functions deploy admin-create-barber
supabase functions deploy bootstrap-admin
```

**Si no quieres desplegar la función**, puedes crear cada barbero manualmente:

1. **Authentication → Users → Add user** (correo + contraseña).
2. En **SQL Editor**:
   ```sql
   insert into public.barbers (profile_id, name)
   values ('UUID-DEL-USUARIO', 'Nombre del barbero');
   ```
   (el `profile_id` es el `id` del usuario, visible en Authentication → Users; el rol
   ya queda en `barber` por defecto, no hace falta tocarlo).

El administrador puede activar/desactivar cada cuenta de barbero desde el panel
(afecta tanto `barbers.active` como `profiles.active`; un barbero desactivado no puede
iniciar sesión ni acceder a datos aunque tenga la sesión abierta).

## 5. Ejecutar el proyecto

> **Nota:** `js/vendor/supabase.js` es el bundle UMD oficial de `@supabase/supabase-js`
> (v2) empaquetado localmente en el repo, en vez de cargarlo desde un CDN externo —
> así la app no depende de que `cdn.jsdelivr.net` esté disponible. Para actualizarlo:
> `npm pack @supabase/supabase-js` y copiar `dist/umd/supabase.js` a esa ruta.

Es un sitio 100% estático. Para probarlo localmente basta un servidor HTTP simple
(los módulos ES no cargan con `file://`):

```bash
npx serve .
# o
python3 -m http.server 8080
```

Abre `http://localhost:8080` (o el puerto que indique tu servidor).

## 6. Desplegar

Sirve para cualquier hosting estático: GitHub Pages, Netlify, Vercel, Cloudflare Pages…
Solo sube los archivos tal cual (no hay paso de build). Recuerda que `supabase-config.js`
contiene la URL y la clave pública de Supabase — son públicas por diseño, pero nunca
pongas ahí la `service_role key`.

## 7. Administrar servicios y precios

Panel de administrador → **Servicios**: crear, editar precio/duración, activar o
desactivar. Los precios se guardan en centavos en la base de datos (para evitar errores
de redondeo) y cada servicio registrado guarda el precio "congelado" en el momento del
registro, así que cambiar un precio no altera el historial ya guardado.

## 8. Administrar usuarios

- **Barberos:** panel de administrador → Barberos (crear, activar/desactivar, editar
  su porcentaje de reparto).
- **Administrador:** solo se crea mediante la operación controlada de la sección 3 — no
  existe ningún flujo en la interfaz para que un barbero se convierta en admin.

## 9. Recuperar contraseña

Pantalla de login → "¿Olvidaste tu contraseña?" envía un correo de recuperación vía
Supabase Auth. Cada usuario también puede cambiar su contraseña desde **Perfil** una
vez ha iniciado sesión.

## 10. Migrar datos antiguos de localStorage

Las versiones anteriores de esta app (sin Supabase) guardaban todo en el navegador bajo
la clave `goodbarber_datos_v1` (semanas por barbero + cortes del sábado). La versión
actual **no borra esos datos automáticamente**.

Para migrarlos: entra como administrador **desde el mismo navegador** donde están esos
datos → **Configuración → "Revisar y migrar datos locales"**. Ahí se te pedirá asociar
cada nombre antiguo (ej. "Alberto", "Joaquín") con el barbero correspondiente ya creado
en Supabase, y verás un resumen antes de confirmar. La migración es aditiva: crea
registros nuevos, nunca borra ni sobreescribe localStorage.

## 11. Modelo de datos y reglas de negocio

- **Semana de trabajo:** Lunes a Sábado (sin domingo), igual que la versión original.
- **Reparto:** 60% barbero / 40% Good Barber por defecto (configurable por barbero y,
  como valor por defecto general, desde Configuración). Se conserva el cálculo
  original: total del día = suma de servicios − descuento del día (nunca negativo).
- **Registro de servicios:** cada corte/servicio es un registro individual (con
  cliente, hora y precio propio), en vez de un simple contador por día — esto permite
  el registro rápido con cliente, y que admin/barbero puedan corregir o cancelar un
  servicio puntual sin afectar el resto del día.
- **Varios servicios en una operación:** el barbero puede agregar varios servicios al
  "carrito" antes de guardar (cada uno con su cantidad y descuento); al confirmar se
  crea un `service_record` por línea, todos compartiendo un `sale_id` común para
  identificarlos como una misma venta. Cada línea sigue siendo un registro normal, así
  que todo el historial anterior (sin `sale_id`) sigue funcionando exactamente igual.
- **Editar un servicio ya registrado:** el barbero puede corregir cualquiera de sus
  propios registros (fecha, servicio, cantidad, descuento, nota) desde **Servicios**,
  eligiendo el día en el selector de fecha. RLS impide editar registros de otro
  barbero, y un trigger adicional bloquea crear/editar un registro cuyo día ya
  pertenezca a una semana **cerrada** (el administrador sí puede, para poder corregir
  algo después de un corte).
- **Cancelaciones:** nunca se borra información; los registros y cortes se marcan como
  `cancelled` (el panel de administrador lo llama "Anular") y pueden reabrirse. Un
  registro anulado no cuenta para totales, estadísticas ni liquidaciones, pero queda
  en la base con `voided_at`/`voided_by` para auditoría. No existe ningún DELETE
  físico de historial de servicios o cortes desde la aplicación.
- **Semanas y cortes:** cerrar una semana (el antiguo "corte del sábado") es una
  operación exclusiva del panel de administrador → **Semanas**, protegida también a
  nivel de base de datos (no solo oculta en la interfaz).

## 12. Seguridad

- **Supabase Auth** maneja login, logout, sesión y recuperación de contraseña — la
  aplicación nunca implementa su propio manejo de contraseñas.
- **Row Level Security** en todas las tablas: cada política se evalúa en el servidor,
  así que ocultar un botón en el frontend nunca es la única protección.
  - Un barbero solo puede leer/escribir sus propios clientes, servicios registrados y
    promociones del día.
  - El catálogo de servicios es de solo lectura para barberos; solo el admin lo
    modifica.
  - Cerrar semanas y crear/editar cortes es exclusivo del admin, a nivel de política
    (no solo de interfaz).
  - Un usuario no puede cambiar su propio `role` ni `active`: existe una política RLS
    y además un trigger (`prevent_role_escalation`) que lo bloquea explícitamente.
- **Nunca se usa la `service_role` key en el frontend.** La única operación que la
  necesita (crear usuarios de Auth para nuevos barberos) vive en la Edge Function
  `admin-create-barber`, que corre en el servidor de Supabase y verifica que quien la
  invoca sea un administrador autenticado antes de hacer nada.
- **Variables públicas vs. secretas:**
  - Públicas (pueden estar en el frontend): `SUPABASE_URL`, la clave `anon` /
    `publishable`.
  - Secretas (JAMÁS en el frontend ni en el repositorio): `service_role key`. Solo
    vive como variable de entorno de la Edge Function, gestionada por Supabase.

### Cómo probar que la seguridad funciona

1. Inicia sesión como Barbero 1 y anota el `id` de un cliente o registro suyo desde las
   herramientas de desarrollador.
2. Inicia sesión como Barbero 2 e intenta consultar/editar ese mismo `id` directamente
   con el cliente de Supabase desde la consola del navegador — debe devolver una lista
   vacía o un error de permisos, nunca los datos del Barbero 1.
3. Repite intentando leer la tabla `settlements` o `weekly_periods` como barbero — solo
   debe ver las suyas, nunca las del otro barbero, y no debe poder insertarlas ni
   actualizarlas (eso es exclusivo del admin).
