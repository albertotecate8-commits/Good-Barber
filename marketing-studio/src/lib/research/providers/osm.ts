// Negocios similares mapeados en OpenStreetMap (datos abiertos ODbL).
// Uso permitido: consultas puntuales e identificadas (Nominatim: máx. 1 por
// segundo; Overpass: uso razonable). Se hacen 2 peticiones por investigación.
// OSM es colaborativo: el listado puede estar incompleto o desactualizado.
import type { AutomaticProvider, FindingDraft } from "../types";
import { osmSelectors } from "../keywords";
import { appUserAgent, clip, fetchWithTimeout } from "./http";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Instancia principal y una réplica pública (wiki de OSM: «Overpass API» → instancias públicas).
// Tiempos cortos: la función del servidor en Netlify tiene un límite de 30 s en total.
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
export const OSM_ATTRIBUTION = "OpenStreetMap (© colaboradores de OpenStreetMap, licencia ODbL)";

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Record<string, string>;
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const osmProvider: AutomaticProvider = {
  id: "osm",
  name: "OpenStreetMap (negocios similares en la ciudad)",
  unavailableReason: () => null,
  async run(q, { fetch: f, env, now }) {
    const sel = osmSelectors(q.sector);
    if (!sel) return [];
    if (!q.city.trim()) throw new Error("El negocio no tiene ciudad registrada: complétala en Negocios.");
    const headers = { "User-Agent": appUserAgent(env), Accept: "application/json" };

    const geoUrl = `${NOMINATIM}?${new URLSearchParams({ q: `${q.city}, México`, format: "jsonv2", limit: "1" })}`;
    const geo = (await (await fetchWithTimeout(f, geoUrl, { headers })).json()) as { boundingbox?: string[]; display_name?: string }[];
    if (!geo[0]?.boundingbox) throw new Error(`No se encontró la ciudad «${q.city}» en OpenStreetMap.`);
    const [south, north, west, east] = geo[0].boundingbox.map(Number);
    const bbox = `${south},${west},${north},${east}`;

    const query = `[out:json][timeout:10];(${sel.selectors.map((s) => `${s}(${bbox});`).join("")});out center tags 80;`;
    let res: Response | null = null;
    const failures: string[] = [];
    for (const endpoint of OVERPASS) {
      try {
        res = await fetchWithTimeout(f, endpoint, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        }, 10000);
        break;
      } catch (e) {
        failures.push((e as Error).name === "TimeoutError" ? `${new URL(endpoint).host} no respondió a tiempo` : (e as Error).message.replace(/\.$/, ""));
      }
    }
    if (!res) throw new Error(`Overpass no respondió: ${failures.join("; ")}`);
    const data = (await res.json()) as { elements?: OsmElement[] };
    const own = norm(q.businessName);
    const places = (data.elements ?? []).filter((e) => e.tags?.name && norm(e.tags.name) !== own);
    const consulted_at = now.toISOString();
    if (!places.length) return [];

    const named = places.slice(0, 15);
    const summary: FindingDraft = {
      source_type: "osm",
      source_name: OSM_ATTRIBUTION,
      url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(`${sel.label} ${q.city}`)}`,
      consulted_at,
      summary: `${places.length} ${sel.label} con nombre aparecen mapeados en OpenStreetMap en ${geo[0].display_name ?? q.city}.`,
      evidence: `Ejemplos: ${named.slice(0, 8).map((p) => p.tags!.name).join(", ")}. OSM es colaborativo: no es un censo completo; sirve para identificar competidores, no para medir el mercado.`,
      evidence_level: "observation",
      confidence: "medium",
      capture_method: "automatic",
      raw: { count: places.length, bbox },
    };
    const each: FindingDraft[] = named.map((p) => {
      const t = p.tags!;
      const address = [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]].filter(Boolean).join(" ");
      const extras = [
        address && `Dirección: ${address}`,
        t.opening_hours && `Horario: ${t.opening_hours}`,
        (t.website || t["contact:website"]) && `Web: ${t.website || t["contact:website"]}`,
        (t["contact:instagram"] || t["contact:facebook"]) && `Redes: ${t["contact:instagram"] ?? t["contact:facebook"]}`,
      ].filter(Boolean);
      return {
        source_type: "osm",
        source_name: OSM_ATTRIBUTION,
        url: `https://www.openstreetmap.org/${p.type}/${p.id}`,
        consulted_at,
        summary: `Competidor mapeado: ${clip(t.name, 120)}.`,
        evidence: extras.length ? extras.join(". ") : "Sin más datos en OpenStreetMap.",
        evidence_level: "observation",
        confidence: "medium",
        capture_method: "automatic",
        raw: { id: `${p.type}/${p.id}`, tags: t },
      };
    });
    return [summary, ...each];
  },
};
