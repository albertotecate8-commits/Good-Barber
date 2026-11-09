# Mis Finanzas

Aplicación web para llevar el control de **ingresos, gastos, deudas y pagos**.
Es una app aparte, dentro de este mismo repositorio: **no toca ni depende de la
app de barbería** que vive en la raíz.

## Lo esencial

- **Sin base de datos propia, sin cuentas.** Los datos se guardan en un
  proyecto de **Supabase** dedicado solo a esta app (separado por completo del
  de la barbería) a través de `supabase-config.js`. No requiere iniciar sesión
  — decisión consciente a cambio de simplicidad; ver "Seguridad" abajo.
- **Necesita conexión a internet** para leer y guardar datos — ya no funciona
  sin conexión (antes vivía en IndexedDB, 100% local).
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

## Configurar Supabase (solo si cambias de proyecto)

Ya está configurado y funcionando contra un proyecto dedicado. Si alguna vez
necesitas apuntar a otro (otra cuenta, otro entorno):

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa uno nuevo).
2. En **SQL Editor**, pega y corre todo [`supabase/schema.sql`](supabase/schema.sql)
   — crea las seis tablas, activa Row Level Security y sus políticas. Es
   seguro volver a correrlo (usa `if not exists`); si ya existían las
   políticas, bórralas primero con `drop policy "acceso completo sin login"
   on public.<tabla>;`.
3. En **Project Settings → API**, copia el **Project URL** y la clave
   **publishable** (nunca la `service_role`).
4. Pégalos en `supabase-config.js` (raíz de `finanzas/`), en `SUPABASE_URL` y
   `SUPABASE_KEY`.

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
(`Corte semanal`, accesible desde Ingresos o Más) — por defecto cierra los
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
deudas por un lado, ingresos esperados por otro) y permite crear o eliminar
categorías. El botón de embudo (**Filtrar**) en Gastos, Historial y Buscar abre
el mismo panel de filtro en todas partes: categoría, tipo, estado, periodo
(incluye un rango de fechas personalizado) y orden (fecha, monto o nombre, en
ambos sentidos).

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
    app.js            Arranque, navegación y acciones globales
    store.js          Estado + lógica de negocio (pagos, recurrencias, respaldo)
    db.js             Capa de datos sobre Supabase (leer, escribir, reemplazar)
    model.js          Definición de los registros y categorías
    seed.js           Datos iniciales
    finance.js        Cálculos: disponible, pendiente, próximos 7 días, resúmenes
    forms.js          Flujos de captura (ingreso, gasto, pago, edición)
    ui.js             Iconos, hojas modales, avisos, animaciones
    components.js     Piezas visuales compartidas (filas, gráficas)
    dates.js          Fechas y periodicidades
    format.js         Formato de dinero (MXN)
    screens/          Una pantalla por archivo
```

## Modelo de datos

| Store | Qué guarda |
|---|---|
| `items` | Los conceptos: gastos fijos, deudas, deudas fuertes, fuentes de ingreso |
| `occurrences` | Cada vencimiento concreto (fecha + monto esperado + estado) |
| `movements` | El historial: dinero que realmente entró o salió |
| `categories` | Categorías de gastos e ingresos |
| `meta` | Preferencias y banderas internas |

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

- **No hay login.** Es una decisión consciente a cambio de simplicidad: la app
  usa la clave pública (`anon`) de Supabase, visible en `supabase-config.js` y
  en cualquier petición de red — cualquiera que la tenga puede leer y escribir
  estos datos financieros. No es apta para datos que deban quedar privados
  frente a quien conozca esa URL/clave.
- **Proyecto propio y separado** del de la app de la barbería — nunca
  comparten base de datos ni credenciales.
- Row Level Security está **activado** en las seis tablas, con una política
  que permite todo a la clave pública — así, si en el futuro se agrega login,
  basta con cambiar esas políticas para exigir `auth.uid()` en vez de abrirlo
  a cualquiera; no hace falta rehacer el esquema.
- La `service_role key` de este proyecto **nunca** se usa en el frontend — de
  hecho, esta app no la necesita en absoluto (no hay Edge Functions).

## Datos iniciales

Se cargan una sola vez, tal como fueron proporcionados, sin agregar nada:

- **Casa:** Internet $300 (ref. 0320443116), Luz $399, Gas $100, Comida $6,000,
  Gasolina $1,000.
- **Local:** Agua $175, Luz $1,244 (cada 2 meses), Renta $3,500, Internet $400.
- **Deudas:** Vexi $1,429, Plata $810, Carro $5,538, Mercado Libre $2,789,
  Open $1,172.
- **Suscripciones:** Claude $349, Gemini $99, ChatGPT $129, YouTube $160,
  Netflix $130, Game Pass $160.
- **Deudas fuertes:** Denisse $35,800 (esperando Afores), BBVA $18,835
  (esperando la quita). No generan pagos mensuales automáticos.
- **Ingresos:** Barbería $300/semana, Uñas $5,400/semana, Rentas $5,000/mes,
  Afores $26,051 (a cobrar en septiembre).

**Conceptos sin fecha.** Gas, Comida, Gasolina y el Afore no traían una fecha
concreta, así que quedaron **sin programar** en vez de inventarles una. Aparecen
en su sección con la etiqueta *"Sin programar"* y se les puede poner fecha desde
**Editar**, o registrarlos directamente cuando ocurran con el botón **Pagar** /
**Recibir**. Lo mismo aplica a las fechas derivadas de una regla ("día 23 de
cada mes", "por semana", "por mes"): se anclan a partir de hoy hacia adelante.
