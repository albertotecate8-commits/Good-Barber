import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";
import { brandSchema, businessSchema, offeringSchema, promotionSchema, socialSchema } from "@/lib/validation/business";

describe("slugify", () => {
  it("quita acentos y símbolos", () => {
    expect(slugify("Glamour Studio")).toBe("glamour-studio");
    expect(slugify("AFORE PRO")).toBe("afore-pro");
    expect(slugify("  Peluquería Ñandú & Co.  ")).toBe("peluqueria-nandu-co");
  });
});

describe("businessSchema", () => {
  const base = { sector: "", description: "", city: "", service_area: "", address: "", target_audience: "" };
  it("genera el slug a partir del nombre", () => {
    const r = businessSchema.parse({ ...base, name: "Good Barber" });
    expect(r.slug).toBe("good-barber");
  });
  it("rechaza nombres sin letras ni números", () => {
    expect(businessSchema.safeParse({ ...base, name: "!!!" }).success).toBe(false);
  });
  it("rechaza nombres demasiado cortos", () => {
    expect(businessSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });
});

describe("brandSchema", () => {
  const ok = {
    color_primary: "#C9A227",
    color_secondary: "#000000",
    color_accent: "#ffffff",
    color_background: "#0B0B0D",
    font_heading: "",
    font_body: "",
    tone_of_voice: "",
    visual_rules: "",
    dos: "Mostrar precios\n\n  Fotos reales  ",
    donts: "",
    logo_url: "",
  };
  it("convierte listas multilínea y vacíos", () => {
    const r = brandSchema.parse(ok);
    expect(r.dos).toEqual(["Mostrar precios", "Fotos reales"]);
    expect(r.logo_url).toBeNull();
  });
  it("rechaza colores inválidos y logos sin https", () => {
    expect(brandSchema.safeParse({ ...ok, color_primary: "red" }).success).toBe(false);
    expect(brandSchema.safeParse({ ...ok, logo_url: "http://x.com/a.png" }).success).toBe(false);
    expect(brandSchema.safeParse({ ...ok, logo_url: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("offeringSchema", () => {
  it("convierte el precio a centavos", () => {
    const r = offeringSchema.parse({ name: "Corte", description: "", kind: "service", price: "120", active: true });
    expect(r.price).toBe(12000);
  });
  it("permite no definir precio", () => {
    const r = offeringSchema.parse({ name: "Corte", description: "", kind: "service", price: "", active: true });
    expect(r.price).toBeNull();
  });
  it("informa un precio inválido", () => {
    const r = offeringSchema.safeParse({ name: "Corte", description: "", kind: "service", price: "gratis", active: true });
    expect(r.success).toBe(false);
  });
});

describe("promotionSchema", () => {
  it("rechaza fecha final anterior a la inicial", () => {
    const r = promotionSchema.safeParse({
      title: "Promo",
      details: "",
      restrictions: "",
      starts_on: "2026-10-20",
      ends_on: "2026-10-10",
      active: true,
    });
    expect(r.success).toBe(false);
  });
});

describe("socialSchema", () => {
  it("quita la @ inicial", () => {
    const r = socialSchema.parse({ platform: "instagram", handle: "@good_barber_oficial", url: "", notes: "" });
    expect(r.handle).toBe("good_barber_oficial");
    expect(r.url).toBeNull();
  });
  it("exige usuario o enlace", () => {
    expect(socialSchema.safeParse({ platform: "instagram", handle: "", url: "", notes: "" }).success).toBe(false);
  });
});
