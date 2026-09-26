// Fórmulas del negocio. Espejo exacto de lo que hace la base de datos en
// save_weekly_count (supabase/migrations/..._esquema_inicial.sql); la BD es la
// fuente de verdad al guardar y esto sirve para la vista previa y el modo demo.
//
// Los montos se calculan en centavos enteros para no arrastrar errores de
// punto flotante (0.1 + 0.2 ≠ 0.3).

export type StockStatus = "ok" | "low" | "out";

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => c / 100;

export interface CountLineInput {
  previous: number; // inventario de referencia (último conteo + compras)
  counted: number; // lo que se contó físicamente
  unitCost: number;
  unitPrice: number;
  minQuantity: number;
}

export interface CountLine {
  sold: number;
  surplus: number; // se contó MÁS de lo esperado (compra sin registrar / error)
  sales: number;
  cost: number;
  profit: number;
  status: StockStatus;
  suggested: number;
}

export function stockStatus(quantity: number, minQuantity: number): StockStatus {
  if (quantity === 0) return "out";
  if (quantity < minQuantity) return "low";
  return "ok";
}

/** cantidad_sugerida = mínimo − actual (nunca negativa) */
export function suggestedPurchase(quantity: number, minQuantity: number): number {
  return Math.max(minQuantity - quantity, 0);
}

export function countLine(i: CountLineInput): CountLine {
  const sold = Math.max(i.previous - i.counted, 0);
  const surplus = Math.max(i.counted - i.previous, 0);
  const salesC = sold * toCents(i.unitPrice);
  const costC = sold * toCents(i.unitCost);
  return {
    sold,
    surplus,
    sales: fromCents(salesC),
    cost: fromCents(costC),
    profit: fromCents(salesC - costC),
    status: stockStatus(i.counted, i.minQuantity),
    suggested: suggestedPurchase(i.counted, i.minQuantity),
  };
}

export interface CountTotals {
  units: number;
  sales: number;
  cost: number;
  profit: number;
}

export function sumLines(lines: Pick<CountLine, "sold" | "sales" | "cost" | "profit">[]): CountTotals {
  let units = 0, sales = 0, cost = 0, profit = 0;
  for (const l of lines) {
    units += l.sold;
    sales += toCents(l.sales);
    cost += toCents(l.cost);
    profit += toCents(l.profit);
  }
  return { units, sales: fromCents(sales), cost: fromCents(cost), profit: fromCents(profit) };
}

/** Ganancia por pieza = precio − costo */
export function unitProfit(cost: number, price: number): number {
  return fromCents(toCents(price) - toCents(cost));
}

/** Margen sobre el precio de venta, en %. (20 − 12) / 20 = 40 % */
export function marginPct(cost: number, price: number): number | null {
  if (price <= 0) return null;
  return ((price - cost) / price) * 100;
}
