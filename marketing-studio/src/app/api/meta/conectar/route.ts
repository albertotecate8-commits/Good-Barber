import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { META_LINK_SCOPES, META_NONCE_COOKIE, META_PUBLISH_SCOPES, metaConfig } from "@/lib/meta/config";
import { newNonce, signState } from "@/lib/meta/crypto";
import { authorizeUrl } from "@/lib/meta/graph";
import { graphOptions } from "@/lib/meta/service";

// Inicia Facebook Login (diálogo oficial de Meta). Solo el dueño del negocio.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("negocio") ?? "";
  const back = (q: string, slug?: string) =>
    NextResponse.redirect(new URL(slug ? `/negocios/${slug}?tab=redes&meta=${q}` : `/negocios?meta=${q}`, req.url));
  if (!UUID.test(businessId)) return back("invalido");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: biz } = await supabase.from("mkt_businesses").select("slug").eq("id", businessId).maybeSingle();
  if (!biz) return back("invalido");
  const { data: isOwner } = await supabase.rpc("mkt_is_owner", { p_business: businessId });
  if (!isOwner) return back("sin-permiso", biz.slug);

  const cfg = metaConfig();
  if (!cfg.ready) return back("sin-configurar", biz.slug);

  const nonce = newNonce();
  const state = signState({ u: user.id, b: businessId, n: nonce, e: Date.now() + 10 * 60_000 }, cfg.tokenKey);
  // ?permisos=publicar pide además los permisos de publicación (otra autorización explícita tuya).
  const publish = req.nextUrl.searchParams.get("permisos") === "publicar";
  const scopes = publish ? [...META_LINK_SCOPES, ...META_PUBLISH_SCOPES] : META_LINK_SCOPES;
  const res = NextResponse.redirect(authorizeUrl(graphOptions(cfg), state, scopes, publish ? cfg.publishConfigId : cfg.loginConfigId));
  res.cookies.set(META_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/api/meta",
    maxAge: 600,
  });
  return res;
}
