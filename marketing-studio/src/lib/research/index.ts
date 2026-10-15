import { calendarFindings } from "./calendar";
import { osmProvider } from "./providers/osm";
import { tavilyProvider } from "./providers/tavily";
import { trendsRssProvider } from "./providers/trends-rss";
import type { AutomaticProvider, FindingDraft, ProviderRun, ResearchQuery } from "./types";

export const AUTOMATIC_PROVIDERS: AutomaticProvider[] = [osmProvider, tavilyProvider, trendsRssProvider];

/** Proveedores que cuentan contra una cuota mensual/diaria propia. */
export const PROVIDER_DAILY_CAPS: Record<string, number> = { tavily: 25 };

/**
 * Ejecuta el calendario comercial (local) y los proveedores automáticos. Un
 * proveedor que falla no detiene a los demás: su error queda registrado.
 */
export async function runAutomaticResearch(
  q: ResearchQuery,
  deps: { fetch: typeof fetch; env: Record<string, string | undefined>; now: Date; usedToday?: Record<string, number> },
  providers: AutomaticProvider[] = AUTOMATIC_PROVIDERS,
): Promise<{ findings: FindingDraft[]; runs: ProviderRun[] }> {
  const at = deps.now.toISOString();
  const findings: FindingDraft[] = calendarFindings(q.start, q.end, deps.now);
  const runs: ProviderRun[] = [
    { provider: "calendar", status: findings.length ? "ok" : "empty", message: "Fechas verificadas del periodo y las 6 semanas siguientes.", count: findings.length, at },
  ];
  const results = await Promise.all(
    providers.map(async (p): Promise<ProviderRun & { findings: FindingDraft[] }> => {
      const reason = p.unavailableReason(deps.env);
      if (reason) return { provider: p.id, status: "not_configured", message: reason, count: 0, at, findings: [] };
      const cap = PROVIDER_DAILY_CAPS[p.id];
      if (cap !== undefined && (deps.usedToday?.[p.id] ?? 0) >= cap)
        return { provider: p.id, status: "skipped", message: `Tope diario propio alcanzado (${cap}).`, count: 0, at, findings: [] };
      try {
        const f = await p.run(q, deps);
        return { provider: p.id, status: f.length ? "ok" : "empty", message: f.length ? "" : "Sin resultados.", count: f.length, at, findings: f };
      } catch (e) {
        const msg = (e as Error).name === "TimeoutError" ? "La fuente no respondió a tiempo." : (e as Error).message;
        return { provider: p.id, status: "error", message: msg.slice(0, 300), count: 0, at, findings: [] };
      }
    }),
  );
  for (const r of results) {
    findings.push(...r.findings);
    runs.push({ provider: r.provider, status: r.status, message: r.message, count: r.count, at: r.at });
  }
  return { findings, runs };
}
