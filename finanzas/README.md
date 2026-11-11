# Mis Finanzas

Administrador simple de **3 negocios** (Barbería, Uñas, Afores) y lo personal:
ingresos, gastos, ganancia y deudas, compartido en tiempo casi real entre dos
personas (Administrador y Colaborador), cada una desde su propio teléfono. Es
una app aparte, dentro de este mismo repositorio: **no toca ni depende de la
app de barbería** que vive en la raíz.

## Lo esencial

- **Requiere iniciar sesión** (correo y contraseña, Supabase Auth). El primer
  correo que se registra queda como **Administrador** automáticamente; los
  siguientes, **Colaborador**. Ambos ven y editan exactamente los mismos
  datos, cada quien desde su teléfono.
- Los datos se guardan en un proyecto de **Supabase** dedicado solo a esta app
  (separado por completo del de la barbería) a través de `supabase-config.js`.
- **Sincronización casi en tiempo real:** mientras la app está abierta y
  visible, se refresca sola cada 30 segundos, y también al volver a ponerla en
  primer plano — así lo que registra un teléfono aparece en el otro sin tener
  que cerrar y volver a abrir la app.
- **Necesita conexión a internet** para leer y guardar datos — no funciona sin
  conexión (antes vivía en IndexedDB, 100% local).
- **Se instala en el celular** como app (PWA): "Agregar a pantalla de inicio".
- Sin frameworks ni paso de compilación: HTML, CSS y JavaScript con módulos ES.

## Cómo abrirla

Se sirve como sitio estático, igual que el resto del repositorio:

```
https://tu-dominio/finanzas/
```

En local:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000/finanzas/
```

En el celular: abre esa dirección en el navegador y usa
**Compartir → Agregar a pantalla de inicio** (iPhone) o
**⋮ → Instalar aplicación** (Android).

## Negocios

Tres espacios independientes — **Barbería, Uñas, Afores** —, cada uno con sus
propios ingresos, gastos, categorías y ganancia. Nunca se mezclan entre sí: la
ganancia de un negocio es siempre `ingresos recibidos − gastos pagados` de
**ese** negocio, y el resumen general de Inicio suma los tres sin duplicar
ningún movimiento. Lo que no pertenece claramente a ninguno (gastos
personales, la mayoría de los registros que ya existían antes de que hubiera
negocios) queda como **general/personal** — nunca se le inventa un negocio.

Los negocios viven en una tabla editable (`businesses`), igual que las
categorías — no están escritos a mano en el código.

## Navegación

Cinco pestañas: **Inicio** (resumen general + los 3 negocios + periodo
hoy/semana/mes/personalizado), **Negocios** (una tarjeta por negocio →
detalle con ingreso/gasto/ganancia de la semana y del mes, historial y
estadísticas propias), **Movimientos** (pestaña central: ingresos y gastos
juntos, con los dos botones grandes de registro rápido arriba), **Deudas**
(periódicas y fuertes, filtrables por negocio) y **Más** (sesión, categorías,
respaldo, ajustes).

Registrar algo siempre es: abrir la app → tocar Ingreso o Gasto → elegir el
negocio (3 botones grandes, nunca hay que escribirlo) → escribir el monto →
guardar.

## Configurar Supabase (solo si cambias de proyecto)

Ya está configurado y funcionando contra un proyecto dedicado. Si alguna vez
necesitas apuntar a otro (otra cuenta, otro entorno):

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa uno nuevo).
2. En **SQL Editor**, pega y corre todo [`supabase/schema.sql`](supabase/schema.sql)
   — crea las tablas (incluye `businesses` y `profiles`), los triggers de
   autenticación, activa Row Level Security y sus políticas. Es seguro
   volver a correrlo en un proyecto nuevo (usa `if not exists` en todo lo
   que lo admite).
3. En **Authentication → Providers → Email**, confirma que el registro por
   correo y contraseña esté activado (es lo que usa `screens/login.js`).
4. En **Project Settings → API**, copia el **Project URL** y la clave
   **publishable** (nunca la `service_role`).
5. Pégalos en `supabase-config.js` (raíz de `finanzas/`), en `SUPABASE_URL` y
   `SUPABASE_KEY`.
6. Abre la app, crea la primera cuenta (queda como Administrador) y luego la
   segunda, para el Colaborador.

## Regla de cálculo

El número más importante de la app:

```
Dinero disponible = ingresos REALMENTE recibidos − gastos REALMENTE pagados
```

- Un ingreso esperado (la semana de uñas, las rentas, el Afore) **no suma**
  hasta que lo marcas como recibido.
- Un gasto pendiente (la renta del 6, Mercado Libre del 1) **no se resta** del
  disponible; aparece aparte como *pendiente* o *dinero comprometido*.

## Pagos con monto distinto

Ningún pago está obligado a ser por el monto configurado. Al tocar **Pagar**:

1. Se muestra el monto esperado, ya escrito y editable.
2. Se elige la fecha real del pago.
3. Se puede agregar una nota.

Al confirmar: se descuenta el monto **real** del disponible, se guarda el
movimiento en el historial y **se genera automáticamente el siguiente
vencimiento** del periodo. En los conceptos marcados como *variables*, el monto
pagado queda como referencia para los siguientes periodos — los pagos anteriores
nunca se modifican.

**Solo existe un vencimiento pendiente (real) por concepto a la vez.** No se
generan meses hacia adelante como registros: Netflix, por ejemplo, siempre
tiene un único "próximo pago" real; en cuanto se paga, se calcula y se crea
el siguiente. El historial completo de pagos anteriores se conserva aparte y
nunca se borra.

**Pero el calendario sí ve más allá de ese único vencimiento real.** Mientras
un concepto recurrente esté activo, sus fechas futuras se **calculan al
vuelo** (a partir de su periodicidad) para cualquier mes que consultes —
agosto, octubre, o enero del año que viene — sin crear un solo registro
nuevo en la base. Solo el vencimiento real (el más próximo) se puede pagar;
los demás son una proyección informativa. Al desactivar un concepto (interruptor
"Activa" en Editar) deja de proyectarse hacia adelante desde ese momento —
lo que ya estaba pendiente y todo el historial se conservan intactos.

**Pagos parciales.** Al pagar una deuda o un gasto se puede marcar "Fue un pago
parcial": si lo pagado no cubre el total, el vencimiento sigue pendiente por la
diferencia y se puede seguir abonando después, sin perder el registro de cada
abono.

## Corte semanal (sábado a viernes, configurable)

Barbería y Uñas son ingresos semanales **sin un día fijo inventado**: no se les
asigna un vencimiento fechado, sino que pertenecen a un corte semanal
(`Corte semanal`, accesible desde Movimientos o Más) — por defecto cierra los
viernes, así que cada corte empieza en sábado y el sábado siguiente ya es un
corte nuevo; el día de cierre es editable desde la misma pantalla. Cada corte
muestra lo esperado, lo recibido y lo faltante, y se puede **cerrar** cuando
termina la semana — el cierre guarda una fotografía en el historial de cortes
y no borra ningún ingreso ya registrado. El corte activo siempre es el que
contiene la fecha de hoy (o el siguiente, si el actual ya se cerró antes de
tiempo).

## Próximos 7 días vs. vencidos

"Próximos 7 días" va de **hoy** al sexto día siguiente (7 días de calendario)
— los pagos de hoy o de antes son "vencidos" y nunca entran aquí, para no
mezclarse nunca con lo próximo; los ingresos esperados sí pueden incluir los
de hoy, ya que no existe un "ingreso vencido".

## Categorías y filtro universal

**Más → Categorías** muestra cuánto hay comprometido por categoría (gastos y
deudas por un lado, ingresos esperados por otro) y permite crear categorías
generales o de un negocio específico. El botón de embudo (**Filtrar**) en
Movimientos, Deudas, Historial y Buscar abre el mismo panel de filtro en
todas partes: **negocio**, categoría, tipo, estado, periodo (incluye un rango
de fechas personalizado) y orden (fecha, monto o nombre, en ambos sentidos).
"No quiero filtros complicados" — por eso es un único panel reutilizado en
toda la app, no uno distinto por pantalla.

## Estructura

```
finanzas/
  index.html          Shell de la app
  manifest.json       PWA instalable
  sw.js               Service worker (cachea el shell de la app)
  supabase-config.js  Cliente de Supabase (URL + clave pública)
  icons/              Iconos de la app
  css/app.css         Sistema de diseño completo
  js/
    vendor/supabase.js  @supabase/supabase-js vendorizado localmente
    app.js            Arranque, sesión, navegación y acciones globales
    store.js          Estado + lógica de negocio (auth, pagos, recurrencias, respaldo)
    db.js             Capa de datos sobre Supabase (leer, escribir, reemplazar)
    model.js          Definición de los registros, negocios y categorías
    seed.js           Datos iniciales
    finance.js        Cálculos: disponible, pendiente, resúmenes por negocio
    filters.js         Filtro universal (negocio, categoría, tipo, estado, periodo, orden)
    forms.js          Flujos de captura (ingreso, gasto, pago, edición, selector de negocio)
    ui.js             Iconos, hojas modales, avisos, animaciones
    components.js     Piezas visuales compartidas (filas, gráficas, etiqueta de negocio)
    dates.js          Fechas y periodicidades
    format.js         Formato de dinero (MXN)
    screens/          Una pantalla por archivo (login, negocios, negocio, movements, …)
```

## Modelo de datos

| Tabla | Qué guarda |
|---|---|
| `items` | Los conceptos: gastos fijos, deudas, deudas fuertes, fuentes de ingreso |
| `occurrences` | Cada vencimiento concreto (fecha + monto esperado + estado) |
| `movements` | El historial: dinero que realmente entró o salió |
| `categories` | Categorías de gastos e ingresos (generales o de un negocio) |
| `businesses` | Barbería, Uñas, Afores — editable, no hardcodeado |
| `profiles` | Un perfil por usuario (nombre, correo, rol admin/colaborador) |
| `meta` | Preferencias y banderas internas |

`items`, `occurrences`, `movements` y `categories` tienen una columna
`business_id` opcional (NULL = general/personal). `items` y `movements`
además guardan `created_by` — quién lo registró —, para mostrar
discretamente "Registrado por…" sin que eso afecte los totales, que siempre
son compartidos entre ambos usuarios.

El id de cada vencimiento se deriva de `(concepto, fecha)`, así que es imposible
duplicar el mismo vencimiento aunque la app se abra muchas veces.

El historial **nunca se borra solo**. Cada movimiento guarda el saldo anterior y
el posterior, y se puede deshacer uno por uno si hubo un error.

## Periodicidades

Semanal · cada 2 semanas · cada 3 semanas · mensual · cada 2 meses ·
cada 3 meses · una sola vez.

Las fechas mensuales conservan el **día ancla**: un pago del 31 de agosto cada
2 meses cae el 31 de octubre, el 31 de diciembre y el 28 de febrero, y vuelve al
31 en marzo. Nunca se desborda a un mes que no existe.

## Respaldo

Aunque los datos ya viven en Supabase (no solo en el dispositivo), sigue
siendo útil tener un respaldo propio — en **Más → Respaldo**:

- **Exportar datos** — descarga un `.json` con absolutamente todo.
- **Copiar respaldo** — al portapapeles, por si el navegador bloquea descargas.
- **Importar datos** — restaura desde un archivo o pegando el contenido. Pide
  confirmación porque reemplaza todo lo que haya en Supabase en ese momento.
- **Información de almacenamiento** — cuántos registros hay y si la app logró
  conectarse al servidor.
- **Restaurar datos iniciales** / **Restablecer aplicación** — ambas piden
  confirmación (la segunda, dos veces) y afectan directamente al proyecto de
  Supabase, no solo a este dispositivo.

Conviene exportar de vez en cuando por si acaso (borrado accidental, cambio de
proyecto de Supabase, etc.).

## Seguridad

- **Login con correo y contraseña** (Supabase Auth). Row Level Security está
  **activado** en las ocho tablas. `authenticated` no basta por sí solo: cada
  política exige además `is_authorized_user()` — que quien pregunta tenga un
  perfil propio y no esté marcado como cuenta de prueba (`is_test`). Sin
  sesión, la app solo muestra la pantalla de entrar/crear cuenta.
- **Tope de exactamente 2 cuentas reales** (Administrador + Colaborador): un
  trigger (`restrict_signups`) rechaza cualquier registro una vez que ya
  existen esas 2 — un desconocido no puede crear una cuenta y entrar, ni
  aunque encuentre la URL pública de la app.
- **Primer usuario real = Administrador, el segundo = Colaborador**, decidido
  por un trigger en la base (`handle_new_user`), no por el cliente — no se
  puede falsear enviando otro rol desde el frontend. Un trigger aparte
  (`prevent_role_escalation`) bloquea que alguien cambie su propio rol. Las
  tres funciones están revocadas como endpoint RPC público: solo pueden
  dispararse como trigger.
- **Datos compartidos, no privados entre sí, entre los dos usuarios
  autorizados:** el Administrador y el Colaborador ven y editan exactamente
  lo mismo (es la base de "ambos ven exactamente lo mismo") — pero nadie más
  puede leerlo ni escribirlo, ni con una cuenta autenticada válida, si no es
  una de esas 2.
- **Proyecto propio y separado** del de la app de la barbería — nunca
  comparten base de datos ni credenciales.
- La `service_role key` de este proyecto **nunca** se usa en el frontend — de
  hecho, esta app no la necesita en absoluto (no hay Edge Functions). Solo se
  usa la clave **publishable**, visible en `supabase-config.js` como siempre
  en una app cliente de Supabase; sin una sesión válida, esa clave por sí
  sola no permite leer ni escribir nada (RLS lo impide).

## Datos iniciales

Se cargan tal como fueron proporcionados, sin agregar nada (es también lo que
deja **Más → Restaurar datos iniciales**):

- **Local:** Renta $3,500 (día 6 de cada mes), Luz $1,000 (cada 2 meses, el
  día 1), Agua $350 (cada 2 meses, el día 21), Internet $580 (día 24). Suman
  ≈ $4,755 al mes: hay que **apartar $1,100 por semana** (se muestra en Inicio).
- **Casa:** Internet $300/mes, Luz $400/mes, Comida $2,000/semana.
- **Afores:** el monto por recibir se escribe desde Inicio (empieza en $0).
- **Sin deudas.**
- **Barbería y Uñas** no son conceptos fijos: cada entrada se registra con su
  total desde Inicio y la app muestra cómo se divide 50/50 con la socia
  (`PARTNER_SHARE` en `js/model.js`). Se cuenta el total como ingreso.

**Conceptos sin fecha.** Los de la casa no traían un día concreto, así que
quedaron **sin programar** en vez de inventarles uno. Se les puede poner fecha
desde **Editar**, o registrarlos cuando ocurran. Las fechas derivadas de una
regla ("día 6 de cada mes") se anclan a partir de hoy hacia adelante.
