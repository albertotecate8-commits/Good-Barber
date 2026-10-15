// Ejecuta las fuentes automáticas de investigación EN VIVO, tal como lo hace la
// app, e imprime qué devolvió cada una (resultados reales, error de red o falta
// de credenciales). No inventa nada: si una fuente falla, se informa el error.
//   npm run test:live            (TAVILY_API_KEY y MKT_CONTACT_EMAIL opcionales)
import { describe, expect, it } from "vitest";
import { runAutomaticResearch } from "@/lib/research";

describe("investigación en vivo (Durango)", () => {
  it("ejecuta cada fuente y reporta su resultado real", async () => {
    const q = {
      businessName: "Good Barber",
      sector: "Barbería",
      city: "Durango, Durango",
      keywords: ["barbería", "corte de cabello"],
      start: new Date().toISOString().slice(0, 10),
      end: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    };
    const { findings, runs } = await runAutomaticResearch(q, { fetch, env: process.env, now: new Date() });
    console.log("\nFUENTE | ESTADO | RESULTADOS | MENSAJE");
    for (const r of runs) console.log(`${r.provider} | ${r.status} | ${r.count} | ${r.message}`);
    for (const f of findings.filter((x) => x.source_type !== "calendar").slice(0, 15)) {
      console.log(`- [${f.source_type}] ${f.summary}${f.url ? ` (${f.url})` : ""}`);
    }
    expect(runs.length).toBeGreaterThan(0);
  });
});
