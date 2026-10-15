import { describe, expect, it } from "vitest";
import { composePostText, parseHashtags, validateContent } from "@/lib/validation/content";

const BIZ = "11111111-1111-4111-8111-111111111111";
const ASSET = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-15T18:00:00Z"); // 12:00 en CDMX
const base = {
  business_id: BIZ,
  platform: "facebook_page",
  format: "post",
  title: "Promo",
  caption: "Corte $120",
  hashtags: "",
  date: "",
  time: "",
  status: "draft",
  asset_id: "",
};
const run = (over: Record<string, unknown>) => validateContent({ ...base, ...over }, NOW);

describe("hashtags", () => {
  it("normaliza, quita # y duplicados", () => {
    expect(parseHashtags("#Barberia, barberia  #Durango #fade_2026").tags).toEqual(["Barberia", "Durango", "fade_2026"]);
  });
  it("acepta acentos y ñ", () => {
    expect(parseHashtags("#Peluquería #Año").tags).toEqual(["Peluquería", "Año"]);
  });
  it("reporta hashtags inválidos", () => {
    expect(parseHashtags("#bien #mal-o").invalid).toEqual(["#mal-o"]);
  });
  it("compone el texto final", () => {
    expect(composePostText("Hola", ["a", "b"])).toBe("Hola\n\n#a #b");
  });
});

describe("validateContent", () => {
  it("acepta un borrador sin fecha", () => {
    const r = run({});
    expect(r.ok && r.data.scheduled_at).toBe(null);
  });
  it("convierte fecha y hora de México a UTC", () => {
    const r = run({ date: "2026-10-20", time: "18:30", status: "scheduled" });
    expect(r.ok && r.data.scheduled_at).toBe("2026-10-21T00:30:00.000Z");
  });
  it("exige hora si hay fecha y viceversa", () => {
    expect(run({ date: "2026-10-20" })).toMatchObject({ ok: false, errors: { time: expect.any(String) } });
    expect(run({ time: "10:00" })).toMatchObject({ ok: false, errors: { date: expect.any(String) } });
  });
  it("no permite programar sin fecha ni en el pasado", () => {
    expect(run({ status: "scheduled" })).toMatchObject({ ok: false, errors: { date: expect.stringMatching(/fecha y hora/) } });
    expect(run({ status: "scheduled", date: "2026-10-15", time: "11:00" })).toMatchObject({
      ok: false,
      errors: { date: expect.stringMatching(/futuras/) },
    });
  });
  it("permite un borrador con fecha pasada (registro histórico)", () => {
    expect(run({ date: "2026-10-01", time: "10:00" }).ok).toBe(true);
  });
  it("rechaza estados que solo asigna el servidor", () => {
    expect(run({ status: "published" }).ok).toBe(false);
    expect(run({ status: "error" }).ok).toBe(false);
  });
  it("Instagram programado exige imagen o video", () => {
    const r = run({ platform: "instagram", status: "scheduled", date: "2026-10-20", time: "10:00" });
    expect(r).toMatchObject({ ok: false, errors: { asset_id: expect.stringMatching(/Instagram/) } });
    expect(run({ platform: "instagram", status: "scheduled", date: "2026-10-20", time: "10:00", asset_id: ASSET }).ok).toBe(true);
  });
  it("aplica los límites de Instagram (2200 caracteres y 30 hashtags)", () => {
    expect(run({ platform: "instagram", caption: "a".repeat(2201) })).toMatchObject({ ok: false, errors: { caption: expect.any(String) } });
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(run({ platform: "instagram", hashtags: tags })).toMatchObject({ ok: false, errors: { hashtags: expect.any(String) } });
  });
  it("exige algún contenido", () => {
    expect(run({ title: "", caption: "" }).ok).toBe(false);
  });
  it("rechaza plataformas o negocios inválidos", () => {
    expect(run({ platform: "myspace" }).ok).toBe(false);
    expect(run({ business_id: "x" }).ok).toBe(false);
  });
});
