import { describe, expect, it } from "vitest";
import { _internal } from "./demoApi";

const { doSaveCount, doPurchase, addProduct, emptyDb } = _internal;

describe("flujo semanal (mismas reglas que SQL)", () => {
  it("inicial → sábado → compra → sábado, con cambio de costo", () => {
    const db = emptyDb();
    const takis = addProduct(db, { name: "Takis Fuego", category_id: null, emoji: null, cost_price: 12, sale_price: 20, min_quantity: 10, current_quantity: 20 }, "2026-09-05T10:00:00Z");
    doSaveCount(db, [{ product_id: takis.id, counted_quantity: 20 }], "initial", "2026-09-05T10:00:00Z");

    // Sábado: quedan 5 → 15 vendidos
    const w1 = doSaveCount(db, [{ product_id: takis.id, counted_quantity: 5 }], "weekly", "2026-09-12T18:00:00Z");
    const c1 = db.counts.find((c) => c.id === w1)!;
    expect(c1).toMatchObject({ total_units_sold: 15, total_sales: 300, total_cost: 180, total_profit: 120 });
    expect(db.products[0]).toMatchObject({ current_quantity: 5, shopping_qty: 5 });

    // Compro 20 a $13 → 25 de referencia
    doPurchase(db, { items: [{ product_id: takis.id, quantity: 20, unit_cost: 13, raw_name: "TAKIS FGO", update_cost: true }], source: "ticket" }, "2026-09-13T12:00:00Z");
    expect(db.products[0]).toMatchObject({ current_quantity: 25, cost_price: 13, shopping_checked: true });

    // Siguiente sábado: 25 → 18 = 7 vendidos con costo nuevo
    const w2 = doSaveCount(db, [{ product_id: takis.id, counted_quantity: 18 }], "weekly", "2026-09-19T18:00:00Z");
    const item = db.countItems.find((i) => i.weekly_count_id === w2)!;
    expect(item).toMatchObject({ previous_quantity: 25, units_sold: 7, unit_cost: 13, profit_amount: 49 });
    // La semana 1 conserva el costo de 12
    expect(db.countItems.find((i) => i.weekly_count_id === w1)!.unit_cost).toBe(12);
  });

  it("no guarda si falta contar un producto activo (no asume 0)", () => {
    const db = emptyDb();
    const a = addProduct(db, { name: "A", category_id: null, emoji: null, cost_price: 1, sale_price: 2, min_quantity: 0, current_quantity: 3 }, "2026-09-01T00:00:00Z");
    addProduct(db, { name: "B", category_id: null, emoji: null, cost_price: 1, sale_price: 2, min_quantity: 0, current_quantity: 3 }, "2026-09-01T00:00:00Z");
    expect(() => doSaveCount(db, [{ product_id: a.id, counted_quantity: 1 }], "weekly", "2026-09-02T00:00:00Z")).toThrow(/FALTAN_PRODUCTOS: 1/);
    expect(() => doSaveCount(db, [{ product_id: a.id, counted_quantity: -1 }], "weekly", "2026-09-02T00:00:00Z")).toThrow();
  });
});
