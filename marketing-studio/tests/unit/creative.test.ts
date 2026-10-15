import { describe, expect, it } from "vitest";
import { containRect, coverCrop, layoutDesign, logoRect, safeArea, upscaleFactor, wrapText } from "@/lib/creative/layout";
import { defaultDesign, designSchema } from "@/lib/creative/design";
import { FORMATS, formatByKey, formatsFor } from "@/lib/creative/formats";
import { contrastRatio, hexToRgb } from "@/lib/creative/color";
import { canvasChecks, claimChecks, dimensionCheck, priceCheck, qaStatus, sanitizeMetrics } from "@/lib/creative/qa";
import { imageSize } from "@/lib/creative/image-size";
import { generateConcepts } from "@/lib/creative/concepts";
import { buildFfmpegArgs, renderBlocker, totalSeconds, videoPlanSchema, wrapForVideo } from "@/lib/creative/video";
import type { BusinessContext } from "@/lib/director/template";

// Medida simple: 0.55 × tamaño por carácter (aproxima una sans-serif).
const measure = (s: string, size: number) => s.length * size * 0.55;
const story = formatByKey("ig_story")!;
const portrait = formatByKey("ig_portrait")!;

describe("formatos", () => {
  it("tienen medidas de 2026 y zonas seguras en historias", () => {
    expect(portrait).toMatchObject({ width: 1080, height: 1350 });
    expect(story).toMatchObject({ width: 1080, height: 1920 });
    expect(story.safe.top).toBe(250);
    expect(formatsFor("reel").every((f) => f.video)).toBe(true);
    expect(new Set(FORMATS.map((f) => f.key)).size).toBe(FORMATS.length);
  });
});

describe("geometría", () => {
  it("el recorte cubre el lienzo sin deformar y respeta el foco", () => {
    const c = coverCrop(4000, 3000, 1080, 1350, 0.5, 0.5);
    expect(c.w / c.h).toBeCloseTo(1080 / 1350, 5);
    expect(c.h).toBe(3000);
    expect(c.x).toBeCloseTo((4000 - c.w) / 2, 5);
    const left = coverCrop(4000, 3000, 1080, 1350, 0, 0.5);
    expect(left.x).toBe(0);
  });
  it("el zoom reduce el área de origen y aumenta la ampliación", () => {
    const c = coverCrop(1200, 1500, 1080, 1350, 0.5, 0.5, 2);
    expect(upscaleFactor(c, 1080, 1350)).toBeCloseTo(1.8, 5);
  });
  it("contain conserva la proporción", () => {
    const r = containRect(1000, 500, { x: 0, y: 0, w: 1080, h: 1350 });
    expect(r.w / r.h).toBeCloseTo(2, 5);
    expect(r.w).toBe(1080);
  });
  it("el logotipo nunca se deforma y respeta la posición", () => {
    const d = defaultDesign({ format: portrait, brand: null });
    const area = safeArea(1080, 1350, portrait.safe);
    const r = logoRect(800, 200, { ...d, logo: { asset_id: null, position: "top-right", size_pct: 20 } }, area);
    expect(r.w / r.h).toBeCloseTo(4, 5);
    expect(r.x + r.w).toBeCloseTo(area.x + area.w, 5);
    // Un logotipo muy alto se limita por altura, también sin deformar.
    const tall = logoRect(200, 1000, { ...d, logo: { asset_id: null, position: "bottom-left", size_pct: 40 } }, area);
    expect(tall.w / tall.h).toBeCloseTo(0.2, 5);
    expect(tall.h).toBeLessThanOrEqual(1350 * 0.22 + 0.001);
  });
  it("divide texto en líneas que caben, incluso palabras largas", () => {
    const lines = wrapText("Corte clásico en Good Barber Durango", 300, (s) => measure(s, 40));
    expect(lines.every((l) => measure(l, 40) <= 300)).toBe(true);
    expect(lines.join(" ")).toBe("Corte clásico en Good Barber Durango");
    expect(wrapText("Supercalifragilisticoespialidoso", 100, (s) => measure(s, 40)).every((l) => measure(l, 40) <= 100)).toBe(true);
  });
  it("en historias, todos los textos quedan dentro de la zona segura", () => {
    for (const template of ["band_bottom", "centered", "headline_top", "price_badge", "minimal"] as const) {
      const d = designSchema.parse({ ...defaultDesign({ format: story, brand: null }), template, texts: { headline: "Corte clásico en Good Barber", price: "$120", cta: "Agenda por mensaje", body: "Sin cita previa" } });
      const l = layoutDesign(d, story, measure);
      for (const b of l.blocks) {
        expect(b.rect.y).toBeGreaterThanOrEqual(story.safe.top);
        expect(b.rect.y + b.rect.h).toBeLessThanOrEqual(1920 - story.safe.bottom + 0.5);
        expect(b.rect.x).toBeGreaterThanOrEqual(story.safe.left);
        expect(b.rect.x + b.rect.w).toBeLessThanOrEqual(1080 - story.safe.right + 0.5);
      }
    }
  });
});

describe("contraste", () => {
  it("calcula la razón WCAG", () => {
    expect(contrastRatio(hexToRgb("#FFFFFF"), hexToRgb("#000000"))).toBeCloseTo(21, 1);
    expect(contrastRatio(hexToRgb("#C9A227"), hexToRgb("#0B0B0D"))).toBeGreaterThan(4.5);
  });
});

describe("control de calidad", () => {
  it("detecta precios inventados", () => {
    expect(priceCheck(["Corte $120", "Barba $50"], [12000, 5000]).level).toBe("ok");
    expect(priceCheck(["Corte $99"], [12000])).toMatchObject({ level: "error", detail: expect.stringContaining("$99") });
  });
  it("detecta promesas y escasez falsa", () => {
    expect(claimChecks(["Resultados garantizados"])[0].level).toBe("error");
    expect(claimChecks(["Últimos lugares"])[0].level).toBe("error");
    expect(claimChecks(["La mejor barbería"])[0].level).toBe("warning");
    expect(claimChecks(["Corte $120. Agenda por mensaje"])[0].level).toBe("ok");
    expect(claimChecks(["Foto indistinguible de una real"])[0].level).toBe("error");
  });
  it("revisa proporción y resolución del archivo", () => {
    expect(dimensionCheck({ width: 1080, height: 1350 }, portrait).level).toBe("ok");
    expect(dimensionCheck({ width: 1024, height: 1024 }, portrait).level).toBe("warning");
    expect(dimensionCheck({ width: 540, height: 675 }, portrait).detail).toMatch(/Resolución baja/);
  });
  it("evalúa las mediciones del lienzo", () => {
    const base = { upscale: 1, logo: { drawnRatio: 4, naturalRatio: 4 }, brightness: { mean: 0.4, std: 0.2 }, print: false, width: 1080 };
    const ok = canvasChecks({ ...base, blocks: [{ role: "headline", fontSize: 80, contrast: 12, insideSafe: true, insideCanvas: true }] });
    expect(qaStatus(ok)).toBe("passed");
    const bad = canvasChecks({ ...base, upscale: 2.5, logo: { drawnRatio: 3, naturalRatio: 4 }, blocks: [{ role: "cta", fontSize: 18, contrast: 1.8, insideSafe: false, insideCanvas: true }] });
    expect(bad.filter((c) => c.level === "error").map((c) => c.id)).toEqual(expect.arrayContaining(["resolution", "logo_ratio", "size_cta", "contrast_cta", "safe_cta"]));
    expect(qaStatus(bad)).toBe("failed");
  });
  it("mide la legibilidad impresa en puntos", () => {
    const print = canvasChecks({ upscale: null, logo: null, brightness: { mean: 0.5, std: 0.2 }, print: true, width: 2550, blocks: [{ role: "body", fontSize: 30, contrast: 10, insideSafe: true, insideCanvas: true }] });
    expect(print.find((c) => c.id === "size_body")?.level).toBe("error"); // 30 px a 300 ppp ≈ 7 pt
  });
  it("descarta métricas manipuladas", () => {
    expect(sanitizeMetrics(null)).toBeNull();
    const m = sanitizeMetrics({ width: 1080, upscale: -5, blocks: [{ role: "<script>", fontSize: 1e9, contrast: 99, insideSafe: "sí" }] });
    expect(m?.upscale).toBeNull();
    expect(m?.blocks[0]).toEqual({ role: "texto", fontSize: 1, contrast: 1, insideSafe: false, insideCanvas: false });
  });
});

describe("dimensiones reales de imágenes", () => {
  it("lee PNG, GIF, WebP y JPEG", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    expect(imageSize(png)).toEqual({ width: 1, height: 1 });
    const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xf0, 0x00]);
    expect(imageSize(gif)).toEqual({ width: 320, height: 240 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpeg)).toEqual({ width: 1080, height: 1350 });
    expect(imageSize(Buffer.from("no es una imagen"))).toBeNull();
  });
});

const ctx: BusinessContext = {
  business: { id: "b", name: "Good Barber", sector: "Barbería", city: "Durango, Durango", address: "", service_area: "", target_audience: "", description: "" },
  brand: { color_primary: "#D6A73A", color_secondary: "#10130F", color_accent: "#F2D07A", color_background: "#05070B", font_heading: "Inter", font_body: "Inter", tone_of_voice: "", visual_rules: "Fondo negro, acentos dorados.", dos: [], donts: [] },
  offerings: [{ name: "Corte", price_cents: 12000, kind: "service", description: "" }],
  promotions: [],
  socials: [],
  assets: [],
};

describe("conceptos", () => {
  const concepts = generateConcepts({ ctx, material: "ad", format: portrait, instruction: "anuncio de corte", plan: null, references: [{ title: "Foto del local", description: "", origin: "real_photo" }], today: "2026-10-15" });
  it("crea 3 conceptos con precios reales", () => {
    expect(concepts).toHaveLength(3);
    expect(concepts[0].price).toBe("$120");
    expect(priceCheck(concepts.flatMap((c) => [c.headline, c.price, c.cta]), [12000]).level).toBe("ok");
  });
  it("los prompts piden imagen sin texto, con formato y referencias", () => {
    const p = concepts[0].prompts.image;
    expect(p).toMatch(/1080×1350/);
    expect(p).toMatch(/NO incluyas texto, precios/);
    expect(p).toMatch(/Foto del local/);
    expect(concepts[0].prompts.video).toMatch(/Sin texto, sin logotipos/);
  });
});

describe("plan de video y FFmpeg", () => {
  it("exige licencia cuando hay música", () => {
    const r = videoPlanSchema.safeParse({ scenes: [], music: { asset_id: "11111111-1111-4111-8111-111111111111", license: "none" } });
    expect(r.success).toBe(false);
    const ok = videoPlanSchema.safeParse({ scenes: [], music: { asset_id: "11111111-1111-4111-8111-111111111111", license: "own" } });
    expect(ok.success).toBe(true);
  });
  it("no deja montar escenas sin material ni videos de más de 90 s", () => {
    const plan = videoPlanSchema.parse({ scenes: [{ id: "a", duration: 3 }] });
    expect(renderBlocker(plan)).toMatch(/sin material/);
    const long = videoPlanSchema.parse({ scenes: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, asset_id: "11111111-1111-4111-8111-111111111111", duration: 15 })) });
    expect(totalSeconds(long)).toBe(105);
    expect(renderBlocker(long)).toMatch(/90 s/);
  });
  it("arma un comando sin shell con escala, texto en zona segura, concat y audio", () => {
    const args = buildFfmpegArgs({
      inputs: [{ path: "/tmp/a.jpg", kind: "image", duration: 3, textFile: "/tmp/t: 'x'.txt" }],
      endCard: { seconds: 2, textFile: "/tmp/c.txt" },
      music: null,
      width: 1080,
      height: 1920,
      safeBottom: 320,
      background: "#0B0B0D",
      fade: true,
      font: "/f.ttf",
      output: "/tmp/o.mp4",
    });
    const fc = args[args.indexOf("-filter_complex") + 1];
    expect(fc).toMatch(/scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920/);
    expect(fc).toMatch(/y=h-320-text_h/);
    expect(fc).toMatch(/textfile='\/tmp\/t\\: \\'x\\'.txt'/);
    expect(fc).toMatch(/concat=n=2:v=1:a=0/);
    expect(args).toContain("anullsrc=r=44100:cl=stereo");
    expect(args.slice(args.indexOf("-t", args.indexOf("-filter_complex")))).toContain("5");
  });
  it("ajusta el texto del video en líneas", () => {
    expect(wrapForVideo("Corte clásico en Good Barber con precio", 16).split("\n").every((l) => l.length <= 16)).toBe(true);
  });
});
