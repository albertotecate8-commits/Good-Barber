import { describe, expect, it } from "vitest";
import { runAutomaticResearch } from "@/lib/research";
import { osmProvider } from "@/lib/research/providers/osm";
import { tavilyProvider, tavilyQueries } from "@/lib/research/providers/tavily";
import { parseTrendsRss, trendsRssProvider } from "@/lib/research/providers/trends-rss";
import { ASSISTED_SOURCES } from "@/lib/research/providers/assisted";
import { defaultKeywords } from "@/lib/research/keywords";

// Respuestas con el FORMATO documentado de cada API, para probar el análisis.
// No son resultados reales: las pruebas en vivo dependen de la red del despliegue.
const NOW = new Date("2026-10-15T18:00:00Z");
const q = { businessName: "Good Barber", sector: "Barbería", city: "Durango, Durango", keywords: defaultKeywords("Barbería"), start: "2026-10-15", end: "2026-10-18" };

function router(routes: Record<string, () => Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) throw new Error(`URL inesperada: ${url}`);
    return routes[key]();
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("OpenStreetMap", () => {
  it("geocodifica la ciudad, consulta Overpass identificándose y excluye el propio negocio", async () => {
    const { f, calls } = router({
      "https://nominatim.openstreetmap.org/search": () =>
        Response.json([{ boundingbox: ["23.9", "24.1", "-104.8", "-104.5"], display_name: "Victoria de Durango, Durango, México" }]),
      "https://overpass-api.de/api/interpreter": () =>
        Response.json({
          elements: [
            { type: "node", id: 1, tags: { name: "Barbería Ejemplo", "addr:street": "Calle 5 de Febrero", opening_hours: "Mo-Sa 10:00-20:00" } },
            { type: "node", id: 2, tags: { name: "Good Barber" } },
            { type: "way", id: 3, tags: {} },
          ],
        }),
    });
    const out = await osmProvider.run(q, { fetch: f, env: { MKT_CONTACT_EMAIL: "dueño@ejemplo.mx" }, now: NOW });
    expect(out[0].summary).toMatch(/^1 barberías y peluquerías/);
    expect(out[1]).toMatchObject({ url: "https://www.openstreetmap.org/node/1", evidence_level: "observation", source_name: expect.stringMatching(/ODbL/) });
    expect(out.some((x) => x.summary.includes("Good Barber"))).toBe(false);
    expect((calls[0].init?.headers as Record<string, string>)["User-Agent"]).toMatch(/MarketingAIStudio.*dueño@ejemplo.mx/);
    expect(String(calls[1].init?.body)).toMatch(/shop.*hairdresser/);
    expect(calls).toHaveLength(2);
  });
  it("si la instancia principal de Overpass falla (502, visto en producción) usa la réplica", async () => {
    const geo = () => Response.json([{ boundingbox: ["23.9", "24.1", "-104.8", "-104.5"], display_name: "Durango" }]);
    const { f, calls } = router({
      "https://nominatim.openstreetmap.org/search": geo,
      "https://overpass-api.de/api/interpreter": () => new Response("Bad Gateway", { status: 502 }),
      "https://overpass.private.coffee/api/interpreter": () => Response.json({ elements: [{ type: "node", id: 9, tags: { name: "Barbería Réplica" } }] }),
    });
    const out = await osmProvider.run(q, { fetch: f, env: {}, now: NOW });
    expect(out[1].summary).toMatch(/Barbería Réplica/);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(["nominatim.openstreetmap.org", "overpass-api.de", "overpass.private.coffee"]);
  });
  it("si Overpass no responde, busca los lugares en Nominatim dentro de la ciudad", async () => {
    const calls: string[] = [];
    const f = (async (url: string) => {
      calls.push(url);
      if (url.includes("overpass")) return new Response("x", { status: 504 });
      const u = new URL(url);
      if (!u.searchParams.get("layer")) return Response.json([{ boundingbox: ["23.9", "24.1", "-104.8", "-104.5"], display_name: "Durango" }]);
      return Response.json(
        u.searchParams.get("q") === "barbería"
          ? [{ osm_type: "node", osm_id: 7, name: "Barbería Centro", address: { road: "Juárez", house_number: "10" } }, { osm_type: "node", osm_id: 8, name: "Good Barber" }]
          : [{ osm_type: "way", osm_id: 9, name: "Peluquería Lupita" }, { osm_type: "node", osm_id: 7, name: "Barbería Centro" }],
      );
    }) as unknown as typeof fetch;
    const out = await osmProvider.run(q, { fetch: f, env: {}, now: NOW });
    expect(out[0].summary).toMatch(/^2 barberías/);
    expect(out[0].evidence).toMatch(/vía Nominatim/);
    expect(out.map((x) => x.url)).toContain("https://www.openstreetmap.org/way/9");
    expect(out.some((x) => x.summary.includes("Good Barber"))).toBe(false);
    const search = new URL(calls.find((c) => c.includes("layer=poi"))!);
    expect(search.searchParams.get("bounded")).toBe("1");
    expect(search.searchParams.get("viewbox")).toBe("-104.8,24.1,-104.5,23.9");
  });
  it("si tampoco responde Nominatim, el error dice qué falló", async () => {
    const f = (async (url: string) => {
      if (url.includes("overpass") || url.includes("layer=poi")) return new Response("x", { status: 504 });
      return Response.json([{ boundingbox: ["23.9", "24.1", "-104.8", "-104.5"], display_name: "Durango" }]);
    }) as unknown as typeof fetch;
    await expect(osmProvider.run(q, { fetch: f, env: {}, now: NOW })).rejects.toThrow(/Overpass no respondió \(overpass-api.de respondió con error HTTP 504; overpass.private.coffee respondió con error HTTP 504\) y Nominatim tampoco/);
  });
  it("sin ciudad explica qué falta", async () => {
    await expect(osmProvider.run({ ...q, city: "" }, { fetch: fetch, env: {}, now: NOW })).rejects.toThrow(/ciudad/);
  });
});

describe("Tavily", () => {
  it("no está disponible sin clave", () => {
    expect(tavilyProvider.unavailableReason({})).toMatch(/TAVILY_API_KEY/);
  });
  it("hace 2 búsquedas, deduplica y marca confianza baja", async () => {
    const { f, calls } = router({
      "https://api.tavily.com/search": () =>
        Response.json({ results: [{ title: "Barbería X", url: "https://ejemplo.mx/x", content: "Corte $100 los lunes" }, { title: "inseguro", url: "http://x.mx" }] }),
    });
    const out = await tavilyProvider.run(q, { fetch: f, env: { TAVILY_API_KEY: "tvly-x" }, now: NOW });
    expect(calls).toHaveLength(2);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ confidence: "low", evidence_level: "observation", url: "https://ejemplo.mx/x" });
    expect(out[0].evidence).toMatch(/verifica la fuente/);
    expect(tavilyQueries(q)[0]).toBe("barbería Durango, Durango promociones precios");
  });
});

describe("Google Trends RSS", () => {
  const xml = `<rss><channel><item><title>Final de futbol</title><ht:approx_traffic>500K+</ht:approx_traffic></item><item><title><![CDATA[Barbería viral]]></title></item></channel></rss>`;
  it("analiza el feed", () => {
    expect(parseTrendsRss(xml)).toEqual([{ title: "Final de futbol", traffic: "500K+" }, { title: "Barbería viral", traffic: "" }]);
  });
  it("señala las tendencias relacionadas con el sector", async () => {
    const { f } = router({ "https://trends.google.com/trending/rss": () => new Response(xml) });
    const [finding] = await trendsRssProvider.run(q, { fetch: f, env: {}, now: NOW });
    expect(finding.summary).toMatch(/Barbería viral/);
  });
});

describe("ejecución conjunta", () => {
  it("un proveedor que falla no detiene a los demás y queda registrado", async () => {
    const f = (async () => {
      throw new Error("red bloqueada");
    }) as typeof fetch;
    const { findings, runs } = await runAutomaticResearch(q, { fetch: f, env: {}, now: NOW });
    expect(runs.find((r) => r.provider === "calendar")?.status).toBe("ok");
    expect(runs.find((r) => r.provider === "osm")).toMatchObject({ status: "error", message: expect.stringMatching(/No se pudo conectar con nominatim\.openstreetmap\.org/) });
    expect(runs.find((r) => r.provider === "tavily")?.status).toBe("not_configured");
    expect(findings.every((x) => x.source_type === "calendar")).toBe(true);
  });
  it("respeta el tope diario de Tavily", async () => {
    const { runs } = await runAutomaticResearch(q, { fetch: fetch, env: { TAVILY_API_KEY: "x" }, now: NOW, usedToday: { tavily: 25 } }, [tavilyProvider]);
    expect(runs.find((r) => r.provider === "tavily")?.status).toBe("skipped");
  });
});

describe("fuentes asistidas", () => {
  it("arman enlaces de consulta seguros", () => {
    const meta = ASSISTED_SOURCES.find((s) => s.id === "meta_ad_library")!.links(q)[0].url;
    expect(meta).toMatch(/^https:\/\/www\.facebook\.com\/ads\/library\/\?.*country=MX.*q=barber%C3%ADa%20Durango/);
    const trends = ASSISTED_SOURCES.find((s) => s.id === "google_trends")!.links(q)[0].url;
    expect(trends).toMatch(/geo=MX-DUR/);
  });
});
