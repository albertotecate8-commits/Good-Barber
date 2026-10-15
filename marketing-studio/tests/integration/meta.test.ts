// Conexión con Meta contra la base local real (RLS, triggers, service_role).
// Las respuestas de la Graph API son simuladas con su formato documentado: esta
// prueba NO demuestra que Meta acepte la app; eso solo se valida con tu app real.
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const password = "Prueba12345!";
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
  META_APP_ID: "123456789012345",
  META_APP_SECRET: "s3cr3t-s3cr3t-s3cr3t",
  MKT_APP_URL: "http://localhost:3000",
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  MKT_TOKEN_KEY: randomBytes(32).toString("base64"),
};

async function makeUser(name: string) {
  const email = `${name}-${run}@test.local`;
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(user));
  sql(`insert into mkt_admins (user_id) values ('${user.id}')`);
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id as string, client };
}

// Graph API simulada: el usuario administra «Good barber» (con IG) y otra página.
const PAGES = [
  { id: "1001", name: "Good barber", link: "https://www.facebook.com/goodbarber", tasks: ["MANAGE", "CREATE_CONTENT"], access_token: "PAGE-TOKEN-1001", instagram_business_account: { id: "1784", username: "good_barber_oficial" } },
  { id: "1002", name: "Página ajena", tasks: ["ANALYZE"], access_token: "PAGE-TOKEN-1002" },
];
const realFetch = globalThis.fetch;

describe.skipIf(!reachable)("conexión con Meta (servidor + base local)", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let other: Awaited<ReturnType<typeof makeUser>>;
  let bizId: string;
  let svc: typeof import("@/lib/meta/service");

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? String(input) : input.url);
      if (url.hostname !== "graph.facebook.com") return realFetch(input, init);
      const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
      if (url.pathname.endsWith("/me/accounts")) return url.searchParams.get("access_token") === "USER-TOKEN" ? ok({ data: PAGES }) : new Response(JSON.stringify({ error: { message: "bad", code: 190 } }), { status: 400 });
      if (url.pathname.endsWith("/1001")) return ok({ id: "1001", name: "Good barber" });
      return new Response("{}", { status: 404 });
    });
    svc = await import("@/lib/meta/service");
    owner = await makeUser("meta-owner");
    other = await makeUser("meta-other");
    bizId = randomUUID();
    const { error } = await owner.client.from("mkt_businesses").insert({ id: bizId, name: "Good Barber", slug: `gb-meta-${run}`, created_by: owner.id });
    if (error) throw error;
    // Perfil ya registrado a mano: debe reutilizarse, no duplicarse.
    const r = await owner.client.from("mkt_social_accounts").insert({ business_id: bizId, platform: "facebook_page", handle: "Good barber" });
    if (r.error) throw r.error;
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("el navegador no puede leer ni escribir tokens ni sesiones OAuth", async () => {
    for (const table of ["mkt_social_tokens", "mkt_meta_oauth_sessions"]) {
      const read = await owner.client.from(table).select("*");
      expect(read.error?.code).toBe("42501");
      const write = await owner.client.from(table).insert({ business_id: bizId, token_ciphertext: "x".repeat(30) });
      expect(write.error).toBeTruthy();
    }
  });

  it("la sesión OAuth solo la puede usar su dueño y guarda el token cifrado", async () => {
    const id = await svc.createOAuthSession({ userId: owner.id, businessId: bizId, userToken: "USER-TOKEN", scopes: ["pages_show_list"] });
    const stored = sql(`select token_ciphertext from mkt_meta_oauth_sessions where id = '${id}'`);
    expect(stored).not.toContain("USER-TOKEN");
    expect(await svc.loadOAuthSession(id, other.id)).toBeNull();
    const s = await svc.loadOAuthSession(id, owner.id);
    expect(s?.pages.map((p) => p.name)).toEqual(["Good barber", "Página ajena"]);
  });

  it("no vincula una página que el usuario no administra", async () => {
    const id = await svc.createOAuthSession({ userId: owner.id, businessId: bizId, userToken: "USER-TOKEN", scopes: [] });
    await expect(svc.linkPage({ sessionId: id, userId: owner.id, pageId: "9999" })).rejects.toMatchObject({ code: "page_not_found" });
    await expect(svc.linkPage({ sessionId: id, userId: other.id, pageId: "1001" })).rejects.toMatchObject({ code: "session" });
    expect(sql(`select count(*) from mkt_social_accounts where business_id = '${bizId}' and connection_status = 'connected'`)).toBe("0");
  });

  it("vincula la página existente: reutiliza el perfil, agrega Instagram y cifra el token", async () => {
    const id = await svc.createOAuthSession({ userId: owner.id, businessId: bizId, userToken: "USER-TOKEN", scopes: ["pages_show_list"] });
    const r = await svc.linkPage({ sessionId: id, userId: owner.id, pageId: "1001" });
    expect(r.page).toEqual({ id: "1001", name: "Good barber" });
    const { data: accounts } = await owner.client.from("mkt_social_accounts").select("platform, handle, external_id, connection_status").eq("business_id", bizId).order("platform");
    expect(accounts).toEqual([
      { platform: "facebook_page", handle: "Good barber", external_id: "1001", connection_status: "connected" },
      { platform: "instagram", handle: "good_barber_oficial", external_id: "1784", connection_status: "connected" },
    ]);
    expect(sql(`select count(*) from mkt_social_accounts where business_id = '${bizId}' and platform = 'facebook_page'`)).toBe("1");
    const sealed = sql(`select string_agg(token_ciphertext, ',') from mkt_social_tokens where business_id = '${bizId}'`);
    expect(sealed).not.toContain("PAGE-TOKEN");
    expect(sql(`select count(*) from mkt_meta_oauth_sessions where id = '${id}'`)).toBe("0");
    // El navegador sigue sin poder marcar «conectado» por su cuenta.
    const forged = await other.client.from("mkt_social_accounts").update({ connection_status: "connected" }).eq("business_id", bizId);
    expect(forged.data ?? []).toHaveLength(0);
  });

  it("desconectar borra los tokens y deja el perfil sin conexión", async () => {
    expect(await svc.disconnectMeta(bizId)).toBe(2);
    expect(sql(`select count(*) from mkt_social_tokens where business_id = '${bizId}'`)).toBe("0");
    expect(sql(`select string_agg(distinct connection_status::text, ',') from mkt_social_accounts where business_id = '${bizId}'`)).toBe("not_connected");
  });
});
