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

/** Lugares por nombre dentro del área de la ciudad (máx. 2 consultas, 1 por segundo como pide Nominatim). */
async function nominatimPlaces(f: typeof fetch, headers: Record<string, string>, terms: string[], box: string[]): Promise<OsmElement[]> {
  const [south, north, west, east] = box;
  const out = new Map<string, OsmElement>();
  for (const [i, term] of terms.slice(0, 2).entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1100));
    const url = `${NOMINATIM}?${new URLSearchParams({ q: term, format: "jsonv2", limit: "40", countrycodes: "mx", viewbox: `${west},${north},${east},${south}`, bounded: "1", addressdetails: "1", layer: "poi" })}`;
    const rows = (await (await fetchWithTimeout(f, url, { headers }, 6000)).json()) as {
      osm_type?: string;
      osm_id?: number;
      name?: string;
      address?: Record<string, string>;
    }[];
    for (const r of rows) {
      if (!r.name || !r.osm_id || !r.osm_type) continue;
      const type = (r.osm_type === "W" || r.osm_type === "way" ? "way" : r.osm_type === "R" || r.osm_type === "relation" ? "relation" : "node") as OsmElement["type"];
      out.set(`${type}/${r.osm_id}`, { type, id: r.osm_id, tags: { name: r.name, ...(r.address?.road ? { "addr:street": r.address.road } : {}), ...(r.address?.house_number ? { "addr:housenumber": r.address.house_number } : {}), ...(r.address?.suburb ? { "addr:suburb": r.address.suburb } : {}) } });
    }
  }
  return [...out.values()];
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
    let elements: OsmElement[] | null = null;
    let via = "Overpass";
    const failures: string[] = [];
    for (const endpoint of OVERPASS) {
      try {
        const res = await fetchWithTimeout(f, endpoint, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }).toString(),
        }, 8000);
        elements = ((await res.json()) as { elements?: OsmElement[] }).elements ?? [];
        break;
      } catch (e) {
        failures.push((e as Error).name === "TimeoutError" ? `${new URL(endpoint).host} no respondió a tiempo` : (e as Error).message.replace(/\.$/, ""));
      }
    }
    // Plan B (visto en producción: Overpass con 502/504): búsqueda de lugares en Nominatim,
    // también de OpenStreetMap. Es por nombre, así que puede quedar incompleta.
    if (!elements) {
      try {
        elements = await nominatimPlaces(f, headers, sel.terms, geo[0].boundingbox);
        via = "Nominatim (búsqueda por nombre; Overpass no respondió)";
      } catch (e) {
        throw new Error(`Overpass no respondió (${failures.join("; ")}) y Nominatim tampoco: ${(e as Error).message}`);
      }
    }
    const data = { elements };
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
      evidence: `Ejemplos: ${named.slice(0, 8).map((p) => p.tags!.name).join(", ")}. Consultado vía ${via}. OSM es colaborativo: no es un censo completo; sirve para identificar competidores, no para medir el mercado.`,
      evidence_level: "observation",
      confidence: "medium",
      capture_method: "automatic",
      raw: { count: places.length, bbox, via },
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
