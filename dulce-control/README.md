# 🍬 Dulce Control

PWA para una dulcería: **cada sábado cuentas tus dulces** y la app calcula cuánto vendiste,
cuánto ganaste y qué necesitas comprar. Después subes la foto del ticket de compra, confirmas
y el inventario se actualiza. Aquí no se registran ventas diarias: no es un POS.

React + TypeScript + Tailwind · Supabase (Postgres, Auth, Storage, Edge Functions) · Vercel · PWA.

## Cómo funciona (las reglas)

| Concepto | Fórmula |
|---|---|
| Inventario anterior | último conteo + compras confirmadas desde entonces (`products.current_quantity`) |
| Vendidos | `max(inventario_anterior − contado, 0)` |
| Ventas estimadas | `vendidos × precio_venta` |
| Costo de mercancía | `vendidos × costo_compra` |
| Ganancia estimada | `ventas − costo` |
| Ganancia por pieza / margen | `precio − costo` / `(precio − costo) ÷ precio` |
| Comprar sugerido | `max(mínimo − actual, 0)`; editable |
| Compra confirmada | `inventario = inventario + comprado` |

Ejemplo de la especificación: 20 Takis, cuentas 5, se vendieron 15. Compras 20 y quedan 25, que son la referencia del próximo sábado.

Decisiones importantes:

- **Nunca se asume 0.** No se puede guardar un conteo si falta algún producto activo. Cuentas 0 a propósito o lo marcas como descontinuado.
- **Contar de más no es venta negativa.** Si cuentas más de lo esperado (por ejemplo, una compra sin registrar), se guarda como *sobrante* y la app te avisa.
- **Historial de costos.** Cada cambio de costo o precio se agrega en `product_cost_history` y nunca se sobrescribe. Cada conteo guarda el costo y el precio vigentes en ese momento, así una semana vieja no cambia si después sube el costo.
- **La IA no toca el inventario.** Lee el ticket y propone; tú confirmas (o editas) antes de que se sume nada.
- El inventario sólo cambia mediante dos funciones SQL atómicas (`save_weekly_count`, `confirm_purchase`). La columna `current_quantity` no se puede editar desde el cliente.

## Estructura

```
supabase/migrations/     esquema, RLS, RPC y bucket de tickets
supabase/functions/scan-ticket/   Edge Function: foto del ticket → renglones (Claude con visión)
supabase/tests/          escenario de la especificación contra Postgres local
src/lib/calc.ts          fórmulas (espejo de SQL) + pruebas
src/lib/match.ts         "TAKIS FGO 70G" → "Takis Fuego" + pruebas
src/api/                 Supabase y modo demo (localStorage) con la misma interfaz
src/pages/               Inicio, Conteo, Resumen, Compras, Ticket, Historial, Productos, Ajustes
```

Tablas: `profiles`, `categories`, `products`, `product_cost_history`, `weekly_counts`,
`weekly_count_items`, `purchases`, `purchase_items`.

## Puesta en marcha

Las migraciones y la Edge Function ya están aplicadas en el proyecto de Supabase
`epbpikqcevswinqzjkws`. Falta:

1. **Clave de IA para leer tickets.** En Supabase ve a *Edge Functions → Secrets* y agrega
   `ANTHROPIC_API_KEY` (la clave sale de console.anthropic.com). Sin ella todo funciona menos la lectura del ticket; la compra se puede capturar a mano.
2. **Auth.** En *Authentication → URL Configuration* pon la URL de Vercel como *Site URL*.
   Si no quieres confirmar el correo al registrarte, desactiva *Confirm email* en
   *Authentication → Providers → Email*.
3. **Vercel.** Importa el repo, pon *Root Directory* = `dulce-control` (o la raíz si lo mueves
   a su propio repo) y agrega las variables de `.env.example`:
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Desarrollo

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
npm test             # fórmulas, coincidencias y flujo semanal
npm run build
```

Sin Supabase configurado (o con el botón **Ver demo**), la app corre en modo demo, con datos
de ejemplo guardados en el navegador.

Para probar el SQL con un Postgres local:

```bash
createdb dulce_test
psql -d dulce_test -f supabase/tests/local_stubs.sql \
  -f supabase/migrations/20260926000001_esquema_inicial.sql \
  -f supabase/tests/escenario_semanal.sql
```
