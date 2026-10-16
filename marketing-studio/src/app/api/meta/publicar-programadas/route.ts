import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { metaConfig, publishingConfig } from "@/lib/meta/config";
import { adminClient, graphOptions } from "@/lib/meta/service";
import { publishDue } from "@/lib/meta/worker";

// Lo llama la función programada de Netlify (netlify/functions/publicar-programadas.mts).
// Protegido con MKT_CRON_SECRET. No devuelve tokens ni datos personales.
export const dynamic = "force-dynamic";

function authorized(req: NextRequest, secret: string) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return secret.length >= 24 && got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: NextRequest) {
  const pub = publishingConfig();
  if (!authorized(req, pub.secret)) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!pub.enabled) return NextResponse.json({ ok: true, enabled: false, message: "La publicación automática está apagada (MKT_PUBLISHING_ENABLED)." });
  const cfg = metaConfig();
  if (!cfg.ready) return NextResponse.json({ ok: false, enabled: true, error: `Falta configurar: ${cfg.missing.join(", ")}` }, { status: 503 });
  try {
    const result = await publishDue({ db: adminClient(cfg), graph: graphOptions(cfg), tokenKey: cfg.tokenKey });
    return NextResponse.json({ ok: true, enabled: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, enabled: true, error: (e as Error).message.slice(0, 300) }, { status: 500 });
  }
}
