import { describe, expect, it } from "vitest";
import { confidenceFromScore, rankMatches, similarity } from "./match";

const catalog = [
  { id: "1", name: "Takis Fuego" },
  { id: "2", name: "Takis Original" },
  { id: "3", name: "Mazapán" },
  { id: "4", name: "Pulparindo" },
  { id: "5", name: "Sabritas Adobadas" },
  { id: "6", name: "Paleta Payaso" },
];

describe("coincidencias de ticket", () => {
  it("TAKIS FGO 70G → Takis Fuego", () => {
    const [top, second] = rankMatches("TAKIS FGO 70G", catalog);
    expect(top.product.name).toBe("Takis Fuego");
    expect(top.score).toBeGreaterThan(second.score);
    expect(confidenceFromScore(top.score)).toBe("high");
  });

  it("MAZAPAN DE LA ROSA 28G → Mazapán (acentos y relleno)", () => {
    expect(rankMatches("MAZAPAN DE LA ROSA 28G", catalog)[0].product.name).toBe("Mazapán");
  });

  it("PULPAR TAM 12PZ → Pulparindo (prefijo)", () => {
    expect(rankMatches("PULPAR TAM 12PZ", catalog)[0].product.name).toBe("Pulparindo");
  });

  it("SAB ADOB 45G → Sabritas Adobadas (abreviaturas)", () => {
    expect(rankMatches("SAB ADOB 45G", catalog)[0].product.name).toBe("Sabritas Adobadas");
  });

  it("producto sin relación no coincide con seguridad", () => {
    const r = rankMatches("COCA COLA 600ML", catalog);
    expect(r.length === 0 || confidenceFromScore(r[0].score) !== "high").toBe(true);
  });

  it("similaridad simétrica razonable", () => {
    expect(similarity("Takis Fuego", "Takis Fuego")).toBe(1);
  });
});
