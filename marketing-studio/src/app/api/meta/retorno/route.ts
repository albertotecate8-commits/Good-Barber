import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { META_NONCE_COOKIE, metaConfig } from "@/lib/meta/config";
import { verifyState } from "@/lib/meta/crypto";
import { exchangeCode, inspectToken, MetaError } from "@/lib/meta/graph";
import { createOAuthSession, graphOptions } from "@/lib/meta/service";

// Retorno del diálogo de Meta. Valida el `state` firmado + cookie (CSRF), que
// la sesión sea del mismo usuario y que siga siendo dueño del negocio; luego
// verifica el token con Meta y lleva a elegir la página EXISTENTE.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const cfg = metaConfig();
  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, req.url));
    res.cookies.set(META_NONCE_COOKIE, "", { path: "/api/meta", maxAge: 0 });
    return res;
  };
  if (!cfg.ready) return go("/negocios?meta=sin-configurar");

  const state = verifyState(p.get("state") ?? "", cfg.tokenKey);
  const nonce = req.cookies.get(META_NONCE_COOKIE)?.value;
  if (!state || !nonce || nonce !== state.n) return go("/negocios?meta=estado-invalido");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.u) return go("/login");
  const { data: biz } = await supabase.from("mkt_businesses").select("slug").eq("id", state.b).maybeSingle();
  const { data: isOwner } = await supabase.rpc("mkt_is_owner", { p_business: state.b });
  if (!biz || !isOwner) return go("/negocios?meta=sin-permiso");
  const back = (q: string) => go(`/negocios/${biz.slug}?tab=redes&meta=${q}`);

  if (p.get("error")) return back("cancelado");
  const code = p.get("code");
  if (!code) return back("cancelado");

  try {
    const o = graphOptions(cfg);
    const { token } = await exchangeCode(o, code);
    const { scopes } = await inspectToken(o, token);
    if (!scopes.includes("pages_show_list")) return back("faltan-permisos");
    const sessionId = await createOAuthSession({ userId: user.id, businessId: state.b, userToken: token, scopes });
    return go(`/negocios/${biz.slug}/meta?sesion=${sessionId}`);
  } catch (e) {
    return back(e instanceof MetaError ? e.code.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) : "error");
  }
}
