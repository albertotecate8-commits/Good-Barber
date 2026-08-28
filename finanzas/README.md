# Mis Finanzas

Aplicación web para llevar el control de **ingresos, gastos, deudas y pagos**.
Es una app aparte, dentro de este mismo repositorio: **no toca ni depende de la
app de barbería** que vive en la raíz.

## Lo esencial

- **Sin base de datos, sin servidor, sin cuentas.** Todo se guarda en el celular
  con **IndexedDB**. No hay Supabase, ni Firebase, ni API externas, ni login.
- **Funciona sin internet** una vez abierta (service worker).
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

**Solo existe un vencimiento pendiente por concepto a la vez.** No se generan
meses hacia adelante: Netflix, por ejemplo, siempre muestra un único "próximo
pago"; en cuanto se paga, se calcula y se crea el siguiente. El historial
completo de pagos anteriores se conserva aparte y nunca se borra.

**Pagos parciales.** Al pagar una deuda o un gasto se puede marcar "Fue un pago
parcial": si lo pagado no cubre el total, el vencimiento sigue pendiente por la
diferencia y se puede seguir abonando después, sin perder el registro de cada
abono.

## Corte semanal (sábado a viernes)

Barbería y Uñas son ingresos semanales **sin un día fijo inventado**: no se les
asigna un vencimiento fechado, sino que pertenecen a un corte de sábado a
viernes (`Corte semanal`, accesible desde Ingresos o Más). Cada corte muestra
lo esperado, lo recibido y lo faltante, y se puede **cerrar** cuando termina la
semana — el cierre guarda una fotografía en el historial de cortes y no borra
ningún ingreso ya registrado. El corte activo siempre es el que contiene la
fecha de hoy (o el siguiente, si el actual ya se cerró antes de tiempo).

## Próximos 7 días vs. vencidos

"Próximos 7 días" va del día de **mañana** al séptimo día — nunca incluye lo
que ya venció. Lo vencido (con fecha de hoy o anterior) aparece aparte, en su
propia sección roja, para no mezclarse nunca con lo próximo.

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
  sw.js               Service worker (funcionamiento sin conexión)
  icons/              Iconos de la app
  css/app.css         Sistema de diseño completo
  js/
    app.js            Arranque, navegación y acciones globales
    store.js          Estado + lógica de negocio (pagos, recurrencias, respaldo)
    db.js             IndexedDB (abrir, leer, escribir, reemplazar)
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

Como los datos viven solo en el dispositivo, en **Más → Respaldo**:

- **Exportar datos** — descarga un `.json` con absolutamente todo.
- **Copiar respaldo** — al portapapeles, por si el navegador bloquea descargas.
- **Importar datos** — restaura desde un archivo o pegando el contenido. Pide
  confirmación porque reemplaza todo.
- **Información de almacenamiento** — espacio usado y si el navegador garantiza
  la permanencia de los datos.
- **Restaurar datos iniciales** / **Restablecer aplicación** — ambas piden
  confirmación (la segunda, dos veces).

Conviene exportar de vez en cuando: si se borran los datos del sitio o se
desinstala la app, la información se pierde.

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
