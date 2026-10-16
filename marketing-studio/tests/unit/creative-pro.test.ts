import { describe, expect, it } from "vitest";
import { layoutCollisions, layoutDesign, rectsOverlap } from "@/lib/creative/layout";
import { defaultDesign, designSchema } from "@/lib/creative/design";
import { formatByKey } from "@/lib/creative/formats";
import { brandFontCheck, canvasChecks, qaStatus, sanitizeMetrics } from "@/lib/creative/qa";
import { BRAND_FONTS, canvasFontStack, effectiveWeight, matchBrandFont } from "@/lib/creative/fonts";
import { spellingCheck, tokenize, unknownWords } from "@/lib/creative/spelling";
import { getSpeller } from "@/lib/creative/spelling-server";
import { detectSector, serviceSubject } from "@/lib/creative/photo-direction";
import { generateConcepts } from "@/lib/creative/concepts";
import type { BusinessContext } from "@/lib/director/template";

const measure = (s: string, size: number) => s.length * size * 0.55;
const portrait = formatByKey("ig_portrait")!;
const base = (over: Record<string, unknown> = {}) =>
  designSchema.parse({ format_key: "ig_portrait", width: 1080, height: 1350, texts: { headline: "Corte clásico", price: "$120", cta: "Agenda" }, ...over });

describe("textos cortados y encimados", () => {
  it("marca una palabra que no cabe en el ancho", () => {
    const d = base({ texts: { headline: "Supercalifragilisticoespialidoso", price: "", cta: "" }, text_scale: 1.6 });
    const l = layoutDesign(d, portrait, measure);
    expect(l.blocks[0].brokenWord).toBe(true);
    expect(layoutDesign(base(), portrait, measure).blocks.every((b) => !b.brokenWord)).toBe(true);
  });

  it("detecta textos que se enciman y texto sobre el logotipo", () => {
    const long = "Corte degradado con lavado y peinado incluido para toda la familia este fin de semana";
    const d = base({ template: "headline_top", text_scale: 1.6, texts: { headline: long, body: long, price: "$120", cta: "Agenda tu cita hoy mismo" } });
    const l = layoutDesign(d, portrait, measure);
    expect(layoutCollisions(l, null).some((c) => c.overlapsText)).toBe(true);
    const ok = layoutDesign(base({ template: "headline_top" }), portrait, measure);
    expect(layoutCollisions(ok, null).some((c) => c.overlapsText)).toBe(false);
    const cta = ok.blocks.find((b) => b.role === "cta")!;
    expect(layoutCollisions(ok, { ...cta.rect })[ok.blocks.indexOf(cta)].overlapsLogo).toBe(true);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
  });

  it("el control de calidad lo convierte en error y valida lo que llega del navegador", () => {
    const m = sanitizeMetrics({
      width: 1080,
      upscale: 1,
      blocks: [{ role: "headline", fontSize: 80, contrast: 7, insideSafe: true, insideCanvas: true, brokenWord: true, overlapsText: "sí", overlapsLogo: true }],
      brightness: { mean: 0.4, std: 0.2 },
    })!;
    expect(m.blocks[0]).toMatchObject({ brokenWord: true, overlapsText: false, overlapsLogo: true });
    const checks = canvasChecks(m);
    expect(checks.map((c) => c.id)).toEqual(expect.arrayContaining(["broken_headline", "overlap_logo_headline"]));
    expect(qaStatus(checks)).toBe("failed");
  });
});

describe("tipografías de marca", () => {
  it("reconoce la tipografía de la identidad de marca y la aplica al diseño inicial", () => {
    expect(matchBrandFont("Montserrat")?.key).toBe("montserrat");
    expect(matchBrandFont("BEBAS NEUE")?.key).toBe("bebas-neue");
    expect(matchBrandFont("Comic Sans")).toBeNull();
    const d = defaultDesign({ format: portrait, brand: { color_primary: "#D6A73A", color_background: "#05070B", font_heading: "Bebas Neue", font_body: "Lato" } });
    expect(d.fonts).toEqual({ heading: "bebas-neue", body: "lato" });
    expect(designSchema.parse({ format_key: "ig_portrait", width: 1080, height: 1350 }).fonts).toEqual({ heading: "app", body: "app" });
    expect(designSchema.safeParse({ format_key: "ig_portrait", width: 1080, height: 1350, fonts: { heading: "comic-sans" } }).success).toBe(false);
  });
  it("no engorda artificialmente fuentes de un solo peso y usa la de la app de respaldo", () => {
    expect(effectiveWeight("bebas-neue", 900)).toBe(400);
    expect(effectiveWeight("montserrat", 850)).toBe(800);
    expect(canvasFontStack("oswald", "Inter, sans-serif")).toBe('"MAS Oswald", Inter, sans-serif');
    expect(canvasFontStack("app", "Inter, sans-serif")).toBe("Inter, sans-serif");
  });
  it("cada archivo de fuente existe en public/fonts con su licencia", async () => {
    const fs = await import("node:fs");
    for (const f of BRAND_FONTS) for (const file of f.files) expect(fs.existsSync(`public${file.file}`), file.file).toBe(true);
    expect(fs.existsSync("public/fonts/LICENSE-montserrat.txt")).toBe(true);
  });
  it("avisa si el diseño no usa la tipografía de marca", () => {
    expect(brandFontCheck("Montserrat", "montserrat", BRAND_FONTS).level).toBe("ok");
    expect(brandFontCheck("Montserrat", "app", BRAND_FONTS).level).toBe("warning");
    expect(brandFontCheck("Futura PT", "app", BRAND_FONTS).detail).toMatch(/no está en el editor/);
    expect(brandFontCheck("Inter", "app", BRAND_FONTS).level).toBe("ok");
  });
});

describe("ortografía (diccionario libre en español)", async () => {
  const speller = await getSpeller();
  it("carga el diccionario", () => expect(speller).not.toBeNull());
  it("detecta errores comunes y sugiere la forma correcta", () => {
    const words = unknownWords("Promocion de barberia: agenda tu cita", speller!);
    expect(words.map((w) => w.word)).toEqual(["Promocion", "barberia"]);
    expect(words[0].suggestions.join(" ")).toMatch(/promoción/i);
  });
  it("no marca formas válidas, marcas ni anglicismos habituales", () => {
    expect(unknownWords("¡Agéndala hoy! Corte y barba con fade en Good Barber, escríbenos por WhatsApp. IMSS", speller!, ["Good Barber"])).toEqual([]);
  });
  it("es solo una advertencia y nunca bloquea", () => {
    expect(spellingCheck({ headline: "Promocion" }, speller, []).level).toBe("warning");
    expect(spellingCheck({ headline: "Promoción de corte" }, speller, []).level).toBe("ok");
    expect(spellingCheck({ headline: "x" }, null, []).detail).toMatch(/no está disponible/);
    expect(tokenize("corte-barba 2x1 $120")).toEqual(["corte", "barba"]);
  });
});

describe("dirección fotográfica realista", () => {
  const ctx: BusinessContext = {
    business: { id: "b", name: "Good Barber", sector: "Barbería", city: "Durango, Durango", address: "", service_area: "", target_audience: "", description: "" },
    brand: null,
    offerings: [
      { name: "Corte", price_cents: 12000, kind: "service", description: "" },
      { name: "Corte y barba", price_cents: 17000, kind: "service", description: "" },
    ],
    promotions: [],
    socials: [],
    assets: [],
  };
  it("detecta el giro de cada negocio", () => {
    expect(detectSector("Barbería")).toBe("barber");
    expect(detectSector("Salón de belleza", "Glamour Studio")).toBe("beauty");
    expect(detectSector("Asesoría", "AFORE PRO")).toBe("finance");
  });
  it("el sujeto corresponde al servicio anunciado", () => {
    expect(serviceSubject("barber", "Corte y barba $170")).toMatch(/barba perfilada/);
    expect(serviceSubject("barber", "Corte clásico $120")).toMatch(/degradado \(fade\)/);
    expect(serviceSubject("finance", "Corte")).toBeNull();
  });
  it("los prompts de Good Barber piden fotografía de barbería real con el corte reconocible", () => {
    const [c] = generateConcepts({ ctx, material: "ad", format: portrait, instruction: "anuncio de corte", plan: null, references: [], today: "2026-10-16" });
    expect(c.prompts.image).toMatch(/Sujeto principal/);
    expect(c.prompts.image).toMatch(/85 mm/);
    expect(c.prompts.image).toMatch(/Evita: salón de belleza genérico/);
    expect(c.prompts.image).toMatch(/nunca debe presentarse como trabajo hecho/);
  });
});
