import { describe, expect, it } from "vitest";
import { formatCents, parsePriceToCents } from "@/lib/money";

describe("parsePriceToCents", () => {
  it.each([
    ["120", 12000],
    ["$199", 19900],
    ["1,250.50", 125050],
    ["99,5", 9950],
    ["0", 0],
    [" 170 MXN ", 17000],
  ])("convierte %s a %d centavos", (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it("devuelve null si está vacío (precio no definido)", () => {
    expect(parsePriceToCents("  ")).toBeNull();
  });

  it.each(["abc", "-5", "1.234", "12.3.4", "1e5", "999999999"])("rechaza %s", (input) => {
    expect(() => parsePriceToCents(input)).toThrow();
  });
});

describe("formatCents", () => {
  it("formatea pesos sin centavos innecesarios", () => {
    expect(formatCents(12000)).toBe("$120");
    expect(formatCents(19900)).toBe("$199");
  });
  it("muestra centavos cuando existen", () => {
    expect(formatCents(125050)).toBe("$1,250.50");
  });
  it("indica cuando no hay precio", () => {
    expect(formatCents(null)).toBe("Sin precio");
  });
});
