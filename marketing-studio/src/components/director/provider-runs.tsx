import type { ProviderRun } from "@/lib/research/types";
import { Badge } from "../ui";

const NAMES: Record<string, string> = {
  business_data: "Datos del negocio",
  calendar: "Calendario comercial",
  osm: "OpenStreetMap",
  tavily: "Búsqueda web (Tavily)",
  google_trends_rss: "Google Trends (RSS)",
  automatic: "Fuentes automáticas",
};
const TONE = { ok: "positive", empty: "neutral", error: "danger", not_configured: "warn", skipped: "neutral" } as const;
const LABEL = { ok: "Consultada", empty: "Sin resultados", error: "Error", not_configured: "Sin configurar", skipped: "Omitida" } as const;

/** Qué fuentes se consultaron de verdad y qué pasó con cada una. */
export function ProviderRuns({ runs }: { runs: ProviderRun[] }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {runs.map((r, i) => (
        <li key={i} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">{NAMES[r.provider] ?? r.provider}</span>
          <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
            {r.count > 0 && <span>{r.count} hallazgo(s)</span>}
            {r.message && <span className="break-words">{r.message}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
