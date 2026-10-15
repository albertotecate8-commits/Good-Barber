// Búsquedas en tendencia del día en México: feed RSS que Google Trends ofrece
// en su opción «Exportar → RSS» de la página «Tendencias del momento». Son
// tendencias nacionales y generales: rara vez son del sector.
import type { AutomaticProvider } from "../types";
import { appUserAgent, clip, fetchWithTimeout } from "./http";

export const TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=MX";

export function parseTrendsRss(xml: string): { title: string; traffic: string }[] {
  const items = xml.split(/<item>/i).slice(1);
  return items
    .map((it) => {
      const title = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(it)?.[1]?.trim() ?? "";
      const traffic = /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i.exec(it)?.[1]?.trim() ?? "";
      return { title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), traffic };
    })
    .filter((x) => x.title);
}

function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export const trendsRssProvider: AutomaticProvider = {
  id: "google_trends_rss",
  name: "Google Trends — tendencias del día en México (RSS)",
  unavailableReason: () => null,
  async run(q, { fetch: f, env, now }) {
    const res = await fetchWithTimeout(f, TRENDS_RSS_URL, { headers: { "User-Agent": appUserAgent(env) } });
    const items = parseTrendsRss(await res.text()).slice(0, 20);
    if (!items.length) return [];
    const kw = q.keywords.map(norm);
    const related = items.filter((i) => kw.some((k) => norm(i.title).includes(k)));
    return [
      {
        source_type: "google_trends",
        source_name: "Google Trends — Tendencias del momento, México (RSS)",
        url: "https://trends.google.com/trending?geo=MX",
        consulted_at: now.toISOString(),
        summary: related.length
          ? `Búsquedas en tendencia hoy relacionadas con el sector: ${related.map((r) => r.title).join(", ")}.`
          : "Ninguna búsqueda en tendencia hoy en México está relacionada con el sector.",
        evidence: `Tendencias nacionales del día: ${clip(items.map((i) => `${i.title}${i.traffic ? ` (${i.traffic})` : ""}`).join(", "), 900)}. Son de todo México, no de Durango.`,
        evidence_level: "observation",
        confidence: related.length ? "medium" : "low",
        capture_method: "automatic",
        raw: { items },
      },
    ];
  },
};
