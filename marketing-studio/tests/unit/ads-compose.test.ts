import { describe, expect, it } from "vitest";
import { composeAds, unknownPrices, type AdOffer } from "@/lib/ads/compose";

const gb = { name: "Good Barber", city: "Durango, Dgo.", sector: "Barbería" };
const corte: AdOffer = { kind: "offering", name: "Corte de cabello", priceCents: 12000 };
const sinPrecio: AdOffer = { kind: "custom", name: "Diseño de barba", priceCents: null };

describe("redacción de anuncios del asistente", () => {
  it("da tres propuestas con el precio registrado exacto", () => {
    const ads = composeAds({ business: gb, goal: "appointments", offer: corte, format: "post" });
    expect(ads).toHaveLength(3);
    expect(ads[0].headline).toBe("Corte de cabello $120");
    for (const a of ads) {
      expect(a.text).toContain("Agenda tu cita por mensaje");
      expect(unknownPrices(`${a.headline} ${a.text}`, [12000])).toEqual([]);
    }
  });

  it("sin precio registrado nunca menciona montos", () => {
    for (const round of [0, 1, 2, 3]) {
      const ads = composeAds({ business: gb, goal: "customers", offer: sinPrecio, format: "post", round });
      for (const a of ads) expect(`${a.headline} ${a.text}`).not.toMatch(/\$\s?\d/);
      expect(ads.map((a) => a.angle)).not.toContain("Precio claro");
    }
  });

  it("«Volver a generar» cambia los enfoques", () => {
    const a = composeAds({ business: gb, goal: "appointments", offer: corte, format: "post", round: 0 }).map((x) => x.angle);
    const b = composeAds({ business: gb, goal: "appointments", offer: corte, format: "post", round: 1 }).map((x) => x.angle);
    expect(a).not.toEqual(b);
  });

  it("la promoción usa sus condiciones tal cual y los formatos verticales son más breves", () => {
    const promo: AdOffer = { kind: "promotion", name: "Martes 2x1", priceCents: null, details: "Corte para dos personas", restrictions: "Solo martes" };
    const post = composeAds({ business: gb, goal: "promote", offer: promo, format: "post" });
    expect(post.find((x) => x.angle === "Promoción vigente")!.text).toContain("Solo martes");
    const story = composeAds({ business: gb, goal: "promote", offer: promo, format: "story" });
    expect(story[0].text.length).toBeLessThanOrEqual(post[0].text.length);
  });

  it("hashtags válidos y sin duplicados", () => {
    const [ad] = composeAds({ business: gb, goal: "customers", offer: corte, format: "post" });
    expect(ad.hashtags).toEqual(["barberia", "durango", "goodbarber", "cortedecabello"]);
  });

  it("detecta montos que no coinciden con precios registrados", () => {
    expect(unknownPrices("Corte $120 y barba $99", [12000])).toEqual(["$99"]);
    expect(unknownPrices("Paquete $1,250.50", [125050])).toEqual([]);
    expect(unknownPrices("Sin precios", [])).toEqual([]);
  });
});
