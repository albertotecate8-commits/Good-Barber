// Identificación que exigen las políticas de uso de OpenStreetMap/Nominatim
// (un User-Agent descriptivo, nunca el genérico de la librería).
export function appUserAgent(env: Record<string, string | undefined>) {
  const contact = env.MKT_CONTACT_EMAIL ? `; ${env.MKT_CONTACT_EMAIL}` : "";
  return `MarketingAIStudio/0.1 (herramienta interna de marketing${contact})`;
}

export async function fetchWithTimeout(f: typeof fetch, url: string, init: RequestInit = {}, ms = 12000) {
  const host = new URL(url).host;
  let res: Response;
  try {
    res = await f(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    if ((e as Error).name === "TimeoutError") throw e;
    throw new Error(`No se pudo conectar con ${host} (sin conexión o la red del servidor lo bloquea).`);
  }
  if (!res.ok) throw new Error(`${host} respondió con error HTTP ${res.status}.`);
  return res;
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
