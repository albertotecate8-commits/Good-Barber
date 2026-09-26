import { describe, expect, it } from "vitest";
import { countLine, marginPct, stockStatus, suggestedPurchase, sumLines, unitProfit } from "./calc";

describe("fórmulas de la especificación", () => {
  it("Takis: 20 antes, 12 ahora → 8 vendidos, $160 ventas, $96 costo, $64 ganancia", () => {
    const l = countLine({ previous: 20, counted: 12, unitCost: 12, unitPrice: 20, minQuantity: 10 });
    expect(l).toMatchObject({ sold: 8, sales: 160, cost: 96, profit: 64, status: "ok", suggested: 0 });
  });

  it("ganancia por pieza y margen: $20 − $12 = $8, 40 %", () => {
    expect(unitProfit(12, 20)).toBe(8);
    expect(marginPct(12, 20)).toBe(40);
    expect(marginPct(5, 0)).toBeNull();
  });

  it("sugerido = mínimo − actual (10 − 3 = 7), nunca negativo", () => {
    expect(suggestedPurchase(3, 10)).toBe(7);
    expect(suggestedPurchase(15, 10)).toBe(0);
  });

  it("agotado / bajo / ok", () => {
    expect(stockStatus(0, 10)).toBe("out");
    expect(stockStatus(3, 10)).toBe("low");
    expect(stockStatus(10, 10)).toBe("ok");
    expect(stockStatus(0, 0)).toBe("out");
  });

  it("regla 19: 20 → 5 son 15 vendidos; si compro 20, la referencia es 25", () => {
    const sat = countLine({ previous: 20, counted: 5, unitCost: 12, unitPrice: 20, minQuantity: 10 });
    expect(sat.sold).toBe(15);
    const nextReference = 5 + 20;
    expect(nextReference).toBe(25);
  });

  it("contar más de lo esperado no es venta negativa: se marca sobrante", () => {
    const l = countLine({ previous: 10, counted: 13, unitCost: 5, unitPrice: 10, minQuantity: 5 });
    expect(l).toMatchObject({ sold: 0, surplus: 3, sales: 0, profit: 0 });
  });

  it("centavos sin errores de punto flotante", () => {
    const l = countLine({ previous: 3, counted: 0, unitCost: 0.1, unitPrice: 0.3, minQuantity: 0 });
    expect(l.sales).toBe(0.9);
    expect(l.profit).toBe(0.6);
  });

  it("totales de la semana", () => {
    const lines = [
      countLine({ previous: 20, counted: 12, unitCost: 12, unitPrice: 20, minQuantity: 10 }),
      countLine({ previous: 30, counted: 21, unitCost: 5, unitPrice: 10, minQuantity: 15 }),
      countLine({ previous: 25, counted: 18, unitCost: 6, unitPrice: 12, minQuantity: 10 }),
    ];
    expect(sumLines(lines)).toEqual({ units: 24, sales: 334, cost: 183, profit: 151 });
  });
});
