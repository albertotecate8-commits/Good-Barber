// Pruebas de aislamiento y reglas de la base contra un stack real (Supabase
// Auth + PostgREST + Postgres con las migraciones del proyecto).
// Requiere: npm run local:up. Si el stack no responde, se omiten.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);

const run = randomUUID().slice(0, 8);
const password = "Prueba12345!";

function sql(query: string) {
  execFileSync("psql", ["-X", "-q", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", query]);
}

async function makeUser(name: string, admin: boolean) {
  const email = `${name}-${run}@test.local`;
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(user));
  if (admin) sql(`insert into mkt_admins (user_id) values ('${user.id}')`);
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id as string, client };
}

async function createBusiness(c: SupabaseClient, userId: string, name: string) {
  const id = randomUUID();
  const { error } = await c
    .from("mkt_businesses")
    .insert({ id, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, created_by: userId });
  if (error) throw error;
  return id;
}

describe.skipIf(!reachable)("aislamiento entre negocios (RLS)", () => {
  let ana: Awaited<ReturnType<typeof makeUser>>; // admin dueña del negocio A
  let beto: Awaited<ReturnType<typeof makeUser>>; // admin dueño del negocio B
  let caro: Awaited<ReturnType<typeof makeUser>>; // usuaria sin rol de admin
  let bizA: string;
  let bizB: string;

  beforeAll(async () => {
    [ana, beto, caro] = await Promise.all([makeUser("ana", true), makeUser("beto", true), makeUser("caro", false)]);
    bizA = await createBusiness(ana.client, ana.id, "Negocio A");
    bizB = await createBusiness(beto.client, beto.id, "Negocio B");
  });

  afterAll(() => {
    if (!reachable) return;
    sql(`delete from mkt_businesses where slug like '%-${run}'`);
    sql(`delete from auth.users where email like '%-${run}@test.local'`);
  });

  it("anon no puede leer nada", async () => {
    const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.from("mkt_businesses").select("id");
    expect(error?.code === "42501" || (data ?? []).length === 0).toBe(true);
  });

  it("el registro público está deshabilitado", async () => {
    const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.auth.signUp({ email: `intruso-${run}@test.local`, password });
    expect(error).not.toBeNull();
  });

  it("al crear un negocio el creador queda como owner y se crea su perfil de marca", async () => {
    const { data: members } = await ana.client.from("mkt_business_members").select("role").eq("business_id", bizA);
    expect(members).toEqual([{ role: "owner" }]);
    const { data: brand } = await ana.client.from("mkt_brand_profiles").select("business_id").eq("business_id", bizA);
    expect(brand).toHaveLength(1);
  });

  it("cada administrador solo ve sus propios negocios", async () => {
    const { data: a } = await ana.client.from("mkt_businesses").select("id");
    const ids = (a ?? []).map((r) => r.id);
    expect(ids).toContain(bizA);
    expect(ids).not.toContain(bizB);
  });

  it("un usuario sin rol de admin no puede crear negocios", async () => {
    await expect(createBusiness(caro.client, caro.id, "Caro Biz")).rejects.toMatchObject({ code: "42501" });
  });

  it("nadie puede crear un negocio a nombre de otro usuario", async () => {
    const { error } = await ana.client
      .from("mkt_businesses")
      .insert({ id: randomUUID(), name: "Suplantado", slug: `suplantado-${run}`, created_by: beto.id });
    expect(error?.code).toBe("42501");
  });

  it("no se puede editar ni leer el negocio de otro", async () => {
    const { data } = await beto.client.from("mkt_businesses").update({ name: "Hackeado" }).eq("id", bizA).select("id");
    expect(data).toEqual([]);
    const { data: offerings } = await beto.client.from("mkt_offerings").select("id").eq("business_id", bizA);
    expect(offerings).toEqual([]);
  });

  it("no se pueden insertar datos en el negocio de otro", async () => {
    const { error } = await beto.client.from("mkt_offerings").insert({ business_id: bizA, name: "Intruso", price_cents: 100 });
    expect(error?.code).toBe("42501");
    const { error: e2 } = await beto.client.from("mkt_campaigns").insert({ business_id: bizA, name: "Campaña intrusa" });
    expect(e2?.code).toBe("42501");
  });

  it("no puede autoagregarse como miembro de un negocio ajeno", async () => {
    const { error } = await beto.client
      .from("mkt_business_members")
      .insert({ business_id: bizA, user_id: beto.id, role: "owner" });
    expect(error?.code).toBe("42501");
  });

  it("un miembro de solo lectura puede leer pero no modificar", async () => {
    const { error } = await ana.client
      .from("mkt_business_members")
      .insert({ business_id: bizA, user_id: caro.id, role: "viewer" });
    expect(error).toBeNull();
    const { data: visible } = await caro.client.from("mkt_businesses").select("id").eq("id", bizA);
    expect(visible).toHaveLength(1);
    const { data: updated } = await caro.client.from("mkt_businesses").update({ name: "X" }).eq("id", bizA).select("id");
    expect(updated).toEqual([]);
    const { error: insertError } = await caro.client.from("mkt_offerings").insert({ business_id: bizA, name: "X" });
    expect(insertError?.code).toBe("42501");
  });

  it("el navegador no puede marcar una red como conectada", async () => {
    const { error } = await ana.client
      .from("mkt_social_accounts")
      .insert({ business_id: bizA, platform: "instagram", handle: "x", connection_status: "connected" });
    expect(error?.code).toBe("42501");
    const { data, error: e2 } = await ana.client
      .from("mkt_social_accounts")
      .insert({ business_id: bizA, platform: "instagram", handle: "y", connection_status: "manual", external_id: "123" })
      .select("external_id, connection_status");
    expect(e2).toBeNull();
    expect(data).toEqual([{ external_id: null, connection_status: "manual" }]);
  });

  it("el navegador no puede marcar una publicación como publicada", async () => {
    const { error } = await ana.client
      .from("mkt_content_items")
      .insert({ business_id: bizA, caption: "Hola", status: "published" });
    expect(error?.code).toBe("42501");
    const { data } = await ana.client
      .from("mkt_content_items")
      .insert({ business_id: bizA, caption: "Hola", status: "draft", external_post_id: "falso", published_at: new Date().toISOString() })
      .select("id, external_post_id, published_at");
    expect(data?.[0]).toMatchObject({ external_post_id: null, published_at: null });
    const { error: e3 } = await ana.client.from("mkt_content_items").update({ status: "published" }).eq("id", data![0].id);
    expect(e3?.code).toBe("42501");
  });

  it("registra auditoría y nadie puede escribirla desde el navegador", async () => {
    await ana.client.from("mkt_offerings").insert({ business_id: bizA, name: "Corte", price_cents: 12000 });
    const { data: log } = await ana.client.from("mkt_audit_log").select("action, entity").eq("business_id", bizA);
    expect(log).toEqual(expect.arrayContaining([{ action: "insert", entity: "mkt_offerings" }]));
    const { data: foreign } = await beto.client.from("mkt_audit_log").select("id").eq("business_id", bizA);
    expect(foreign).toEqual([]);
    const { error } = await ana.client.from("mkt_audit_log").insert({ business_id: bizA, action: "x", entity: "y" });
    expect(error).not.toBeNull();
  });

  it("valida formatos en la base (precio negativo, color inválido)", async () => {
    const { error } = await ana.client.from("mkt_offerings").insert({ business_id: bizA, name: "X", price_cents: -1 });
    expect(error?.code).toBe("23514");
    const { error: e2 } = await ana.client.from("mkt_brand_profiles").update({ color_primary: "red" }).eq("business_id", bizA);
    expect(e2?.code).toBe("23514");
  });

  it("la tabla de administradores no se puede modificar desde el navegador", async () => {
    const { error } = await caro.client.from("mkt_admins").insert({ user_id: caro.id });
    expect(error).not.toBeNull();
  });
});
