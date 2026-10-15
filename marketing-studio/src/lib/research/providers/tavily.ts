// Búsqueda web con Tavily: plan gratuito de 1 000 créditos al mes sin tarjeta
// (1 crédito por búsqueda básica). Requiere TAVILY_API_KEY. Se hacen 2
// búsquedas por investigación. El contenido de terceros se guarda como dato
// (no se ejecuta ni se interpreta como instrucción) y se marca como observación.
import type { AutomaticProvider, FindingDraft } from "../types";
import { clip, fetchWithTimeout } from "./http";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

export function tavilyQueries(q: { keywords: string[]; city: string }) {
  const k = q.keywords[0] ?? "";
  return [`${k} ${q.city} promociones precios`, `${k} ${q.city} opiniones clientes`].map((s) => s.replace(/\s+/g, " ").trim());
}

export const tavilyProvider: AutomaticProvider = {
  id: "tavily",
  name: "Búsqueda web (Tavily, plan gratuito)",
  unavailableReason: (env) => (env.TAVILY_API_KEY ? null : "Falta TAVILY_API_KEY (plan gratuito de Tavily, sin tarjeta)."),
  async run(q, { fetch: f, env, now }) {
    const out: FindingDraft[] = [];
    const seen = new Set<string>();
    for (const query of tavilyQueries(q)) {
      const res = await fetchWithTimeout(f, "https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.TAVILY_API_KEY}` },
        body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: false, country: "mexico" }),
      });
      const data = (await res.json()) as { results?: TavilyResult[] };
      for (const r of data.results ?? []) {
        if (!r.url?.startsWith("https://") || seen.has(r.url)) continue;
        seen.add(r.url);
        out.push({
          source_type: "web_search",
          source_name: `Búsqueda web (Tavily): «${query}»`,
          url: r.url,
          consulted_at: now.toISOString(),
          summary: clip(r.title?.trim() || r.url, 300),
          evidence: `${clip((r.content ?? "").replace(/\s+/g, " ").trim(), 700)}${r.published_date ? ` (publicado: ${r.published_date})` : ""}. Fragmento de un sitio de terceros: verifica la fuente antes de usar cualquier dato.`,
          evidence_level: "observation",
          confidence: "low",
          capture_method: "automatic",
        });
      }
    }
    return out;
  },
};
