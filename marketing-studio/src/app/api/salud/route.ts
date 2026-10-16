import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";

// Comprobación pública del despliegue: ¿responde la app y llega a Supabase?
// No revela secretos ni configuración (solo sí/no y el commit desplegado).
export const dynamic = "force-dynamic";

export async function GET() {
  const { url, anonKey, configured } = publicEnv();
  let database: "ok" | "error" | "sin-configurar" = "sin-configurar";
  if (configured) {
    try {
      const r = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anonKey }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      database = r.ok ? "ok" : "error";
    } catch {
      database = "error";
    }
  }
  const commit = process.env.MKT_BUILD_COMMIT || null;
  return NextResponse.json({ ok: database === "ok", database, commit }, { status: database === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } });
}
