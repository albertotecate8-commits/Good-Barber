import { describe, expect, it } from "vitest";
import { analyzePixels, aspectLabel, palette } from "@/lib/studio/analysis";
import { findStyle, parseMessage } from "@/lib/studio/intent";
import { propose, replyText } from "@/lib/studio/propose";
import { guessMemoryKind, parseAttributes, type MemoryItem, type Style } from "@/lib/studio/styles";
import type { BusinessContext } from "@/lib/director/template";

const now = new Date("2026-10-18T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400_000).toISOString();
const styles = [
  { id: "s-noir", name: "Barbería noir", created_at: daysAgo(9) },
  { id: "s-new", name: "Dorado limpio", created_at: daysAgo(1) },
];
const base = { styles, offerNames: ["Corte de cabello", "Corte + barba"], hasProposals: false, now };

const ctx: BusinessContext = {
  business: { id: "b1", name: "Good Barber", sector: "Barbería", city: "Durango, Dgo.", address: "", service_area: "", target_audience: "", description: "" },
  brand: { color_primary: "#C9A227", color_secondary: "#1F1F23", color_accent: "#7C5CFF", color_background: "#0B0B0D", font_heading: "Bebas Neue", font_body: "Inter", tone_of_voice: "Cercano", visual_rules: "", dos: [], donts: ["Nunca usar rosa"] },
  offerings: [
    { name: "Corte de cabello", price_cents: 12000, kind: "service", description: "" },
    { name: "Corte + barba", price_cents: 20000, kind: "service", description: "" },
  ],
  promotions: [],
  socials: [],
  assets: [],
};
const memory: MemoryItem[] = [{ id: "m1", kind: "restriction", text: "No mostrar navajas abiertas", source: "chat", source_url: null, active: true, created_at: daysAgo(2) }];
const noir: Style = {
  id: "s-noir",
  name: "Barbería noir",
  description: "",
  attributes: parseAttributes({ measured: { palette: [{ hex: "#101010", share: 0.6 }], brightness: 22, contrast: 70, saturation: 15, temperature: "cálida", aspect: "4:5", focus: "centro", negativeSpace: 40, width: 1080, height: 1350 }, interpreted: { typography: "Serif condensada en mayúsculas" } }),
  reference_asset_ids: [],
  source: "reference_image",
  active: true,
  created_at: daysAgo(9),
  updated_at: daysAgo(9),
};

describe("intención del chat", () => {
  it("tres anuncios diferentes", () => {
    const p = parseMessage("Haz tres anuncios diferentes para Good Barber", base);
    expect(p.kind).toBe("create");
    expect(p.count).toBe(3);
  });
  it("ajustes sobre una propuesta existente", () => {
    const p = parseMessage("Hazlo más premium y menos artificial", { ...base, hasProposals: true });
    expect(p.kind).toBe("modify");
    expect(p.modifiers).toEqual(expect.arrayContaining(["premium", "natural"]));
  });
  it("conserva composición, cambia colores y promoción", () => {
    const p = parseMessage("Conserva la composición, pero cambia los colores y la promoción", { ...base, hasProposals: true });
    expect(p.kind).toBe("modify");
    expect(p.modifiers).toEqual(expect.arrayContaining(["keep_composition", "change_colors", "change_offer"]));
  });
  it("estilo de la semana pasada y por nombre", () => {
    expect(findStyle("Usa el estilo que guardamos la semana pasada", styles, now).id).toBe("s-noir");
    expect(findStyle("usa el estilo dorado limpio", styles, now).id).toBe("s-new");
    expect(findStyle("usa el estilo vaporwave", styles, now).missing).toMatch(/vaporwave/);
    expect(findStyle("usa el estilo que guardamos la semana pasada", [], now).missing).toBeTruthy();
  });
  it("adaptar a historia", () => {
    const p = parseMessage("Adapta este concepto a una historia de Instagram", { ...base, hasProposals: true });
    expect(p.kind).toBe("modify");
    expect(p.format).toBe("story");
  });
  it("recordar solo cuando se pide, con tipo", () => {
    const p = parseMessage("Recuerda que nunca usemos color rosa", base);
    expect(p.kind).toBe("remember");
    expect(p.memory?.text).toBe("Nunca usemos color rosa");
    expect(p.memory?.kind).toBe("restriction");
    expect(guessMemoryKind("prefiero fotos en blanco y negro")).toBe("preference");
    expect(guessMemoryKind("preferimos fotos reales del local")).toBe("preference");
    expect(parseMessage("Hazlo más premium", base).kind).not.toBe("remember");
  });
  it("investigación y aprobación no generan propuestas", () => {
    expect(parseMessage("Investiga tendencias de barberías en Durango", base).kind).toBe("research");
    expect(parseMessage("Apruebo la segunda", { ...base, hasProposals: true }).kind).toBe("approve");
  });
});

describe("propuestas", () => {
  it("tres propuestas distintas con precios registrados y estilo/memoria en el prompt", () => {
    const parsed = parseMessage("Haz tres anuncios diferentes con el estilo Barbería noir", base);
    const out = propose({ ctx, parsed, memory, style: noir, previous: [], round: 0, hasLogo: true, referenceCount: 0 });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((p) => p.title)).size).toBe(3);
    for (const p of out) {
      expect(["$120", "$200"]).toContain(p.price);
      expect(p.prompt).toContain("Barbería noir");
      expect(p.prompt).toContain("#101010");
      expect(p.prompt).toContain("No mostrar navajas abiertas");
      expect(p.prompt).toContain("Nunca usar rosa");
      expect(p.prompt).toMatch(/No incluyas logotipos, marcas ni personajes de terceros/);
      expect(p.warnings).toEqual([]);
    }
  });
  it("ajuste: premium + cambiar oferta conserva el resto y avisa composición", () => {
    const first = propose({ ctx, parsed: parseMessage("Haz un anuncio de Corte de cabello", base), memory: [], style: null, previous: [], round: 0, hasLogo: false, referenceCount: 0 });
    expect(first[0].offer.name).toBe("Corte de cabello");
    const parsed = parseMessage("Conserva la composición, pero cambia los colores y la promoción", { ...base, hasProposals: true });
    const [v2] = propose({ ctx, parsed, memory: [], style: null, previous: first, round: 1, hasLogo: false, referenceCount: 0 });
    expect(v2.parentKey).toBe(first[0].key);
    expect(v2.offer.name).toBe("Corte + barba");
    expect(v2.price).toBe("$200");
    expect(v2.layout).toBe(first[0].layout);
    expect(v2.prompt).toMatch(/Conserva EXACTAMENTE la composición/);
    expect(v2.prompt).toMatch(/color dominante #1F1F23|color dominante #7C5CFF/);
    expect(v2.warnings.join(" ")).toMatch(/logotipo/);
    expect(replyText({ parsed, proposals: [v2], style: null, memoryCount: 0, businessName: "Good Barber" })).toMatch(/adjunta en ChatGPT la imagen anterior/);
  });
  it("adaptar a historia cambia formato y composición", () => {
    const first = propose({ ctx, parsed: parseMessage("Haz un anuncio", base), memory: [], style: null, previous: [], round: 0, hasLogo: true, referenceCount: 0 });
    const [st] = propose({ ctx, parsed: parseMessage("Adapta este concepto a una historia de Instagram", { ...base, hasProposals: true }), memory: [], style: null, previous: first, round: 1, hasLogo: true, referenceCount: 0 });
    expect(st.format).toBe("story");
    expect(st.prompt).toContain("1080×1920");
  });
  it("sin servicios no inventa precios", () => {
    const out = propose({ ctx: { ...ctx, offerings: [] }, parsed: parseMessage("Haz dos anuncios", base), memory: [], style: null, previous: [], round: 0, hasLogo: true, referenceCount: 0 });
    expect(out).toHaveLength(2);
    for (const p of out) {
      expect(p.price).toBe("");
      expect(p.prompt).not.toMatch(/\$\d/);
      expect(p.warnings.join(" ")).toMatch(/no tiene servicios/);
    }
  });
});

describe("análisis medido de referencias", () => {
  function img(w: number, h: number, fn: (x: number, y: number) => [number, number, number]) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      data.set([r, g, b, 255], (y * w + x) * 4);
    }
    return { data, width: w, height: h };
  }
  it("paleta, luminosidad, temperatura y foco", () => {
    // Fondo negro con un cuadro dorado con detalle a la derecha.
    const m = analyzePixels(img(200, 250, (x, y) => (x > 130 && x < 190 && y > 100 && y < 160 ? ((x + y) % 2 ? [201, 162, 39] : [120, 90, 20]) : [12, 12, 12])));
    expect(m.palette[0].hex).toBe("#0c0c0c");
    expect(m.palette[0].share).toBeGreaterThan(0.8);
    expect(m.brightness).toBeLessThan(20);
    expect(m.aspect).toBe("4:5");
    expect(m.focus).toMatch(/derecha/);
    expect(m.negativeSpace).toBeGreaterThan(70);
  });
  it("temperatura fría y proporción 9:16", () => {
    const m = analyzePixels(img(90, 160, () => [40, 80, 200]));
    expect(m.temperature).toBe("fría");
    expect(m.aspect).toBe("9:16");
    expect(m.saturation).toBeGreaterThan(70);
  });
  it("utilidades", () => {
    expect(aspectLabel(1080, 1080)).toBe("1:1");
    expect(palette([])).toEqual([]);
  });
});
