import { describe, expect, it } from "vitest";
import { BudgetError, MONTHLY_BUDGET_MXN, assertCallAllowed } from "@/lib/providers/budget";
import { PROVIDERS, runtimeStatus } from "@/lib/providers/registry";
import { INITIAL_BUSINESSES } from "@/lib/data/initial-businesses";

const call = (providerId: string, over: Partial<Parameters<typeof assertCallAllowed>[0]> = {}) => () =>
  assertCallAllowed({ providerId, estimatedCostMXN: 0, usedToday: 0, spentThisMonthMXN: 0, ...over });

describe("regla de gasto $0", () => {
  it("el presupuesto autorizado es cero", () => {
    expect(MONTHLY_BUDGET_MXN).toBe(0);
  });
  it("bloquea proveedores de pago", () => {
    for (const p of PROVIDERS.filter((x) => x.access === "paid_blocked")) {
      expect(call(p.id)).toThrow(BudgetError);
    }
  });
  it("bloquea llamadas por API a herramientas que solo son asistidas", () => {
    expect(call("google-flow")).toThrow(/flujo asistido/);
    expect(call("chatgpt")).toThrow(BudgetError);
  });
  it("bloquea cualquier costo estimado mayor a cero", () => {
    expect(call("gemini-text", { estimatedCostMXN: 0.01 })).toThrow(/presupuesto/);
  });
  it("bloquea costos inválidos", () => {
    expect(call("gemini-text", { estimatedCostMXN: Number.NaN })).toThrow(BudgetError);
    expect(call("gemini-text", { estimatedCostMXN: -1 })).toThrow(BudgetError);
  });
  it("respeta el tope diario autoimpuesto", () => {
    expect(call("gemini-text", { usedToday: 200 })).toThrow(/tope diario/);
    expect(call("gemini-text", { usedToday: 199 })).not.toThrow();
  });
  it("rechaza proveedores desconocidos", () => {
    expect(call("nope")).toThrow(/desconocido/);
  });
});

describe("estado de proveedores", () => {
  const gemini = PROVIDERS.find((p) => p.id === "gemini-text")!;
  it("nunca afirma que algo funciona sin probarlo", () => {
    expect(runtimeStatus(gemini, { GEMINI_API_KEY: "x" })).toBe("ready_untested");
  });
  it("indica configuración faltante", () => {
    expect(runtimeStatus(gemini, {})).toBe("missing_config");
  });
  it("las suscripciones de usuario no se presentan como API", () => {
    for (const id of ["chatgpt", "claude", "google-flow", "gemini-app"]) {
      expect(PROVIDERS.find((p) => p.id === id)!.access).toBe("assisted");
    }
  });
  it("ningún proveedor pide variables NEXT_PUBLIC (secretos al navegador)", () => {
    for (const p of PROVIDERS) for (const v of p.envVars ?? []) expect(v.startsWith("NEXT_PUBLIC_")).toBe(false);
  });
});

describe("datos iniciales", () => {
  it("contiene los precios reales de Good Barber", () => {
    const gb = INITIAL_BUSINESSES.find((b) => b.slug === "good-barber")!;
    expect(Object.fromEntries(gb.offerings.map((o) => [o.name, o.price_cents]))).toEqual({
      Corte: 12000,
      Barba: 5000,
      Cejas: 3000,
      "Corte y barba": 17000,
      "Corte y cejas": 15000,
      "Corte, barba y cejas": 19900,
    });
  });
  it("no inventa precios para negocios sin datos", () => {
    for (const slug of ["glamour-studio", "afore-pro"]) {
      expect(INITIAL_BUSINESSES.find((b) => b.slug === slug)!.offerings).toEqual([]);
    }
  });
});
