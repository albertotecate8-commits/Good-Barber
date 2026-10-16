// Prospectos contra la base local real: aislamiento por negocio y reglas.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

async function makeUser(name: string) {
  const email = `${name}-${run}@test.local`;
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "Prueba12345!", email_confirm: true }),
  });
  const user = await r.json();
  sql(`insert into mkt_admins (user_id) values ('${user.id}')`);
  const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.signInWithPassword({ email, password: "Prueba12345!" });
  return { id: user.id as string, client };
}

describe.skipIf(!reachable)("prospectos (base local)", () => {
  let a: Awaited<ReturnType<typeof makeUser>>;
  let b: Awaited<ReturnType<typeof makeUser>>;
  const bizA = randomUUID();
  const bizB = randomUUID();
  const campA = randomUUID();
  const campB = randomUUID();

  beforeAll(async () => {
    a = await makeUser("lead-a");
    b = await makeUser("lead-b");
    await a.client.from("mkt_businesses").insert({ id: bizA, name: "Good Barber L", slug: `gb-l-${run}`, created_by: a.id });
    await b.client.from("mkt_businesses").insert({ id: bizB, name: "Glamour L", slug: `gl-l-${run}`, created_by: b.id });
    await a.client.from("mkt_campaigns").insert({ id: campA, business_id: bizA, name: "Corte octubre" });
    await b.client.from("mkt_campaigns").insert({ id: campB, business_id: bizB, name: "Uñas octubre" });
  });

  it("registra un prospecto atribuido y una venta en su propio negocio", async () => {
    const r = await a.client.from("mkt_leads").insert({ business_id: bizA, campaign_id: campA, attribution: "declared", status: "customer", value_cents: 17000, source: "instagram_dm" });
    expect(r.error).toBeNull();
  });

  it("no se puede atribuir a una campaña de otro negocio", async () => {
    const r = await a.client.from("mkt_leads").insert({ business_id: bizA, campaign_id: campB, attribution: "declared" });
    expect(r.error?.code).toBe("42501");
  });

  it("otro dueño no ve ni escribe prospectos ajenos", async () => {
    const read = await b.client.from("mkt_leads").select("id").eq("business_id", bizA);
    expect(read.data).toEqual([]);
    const write = await b.client.from("mkt_leads").insert({ business_id: bizA, status: "new" });
    expect(write.error).toBeTruthy();
    const upd = await b.client.from("mkt_leads").update({ value_cents: 1 }).eq("business_id", bizA).select("id");
    expect(upd.data ?? []).toHaveLength(0);
  });

  it("una atribución sin campaña la rechaza la base", async () => {
    const r = await a.client.from("mkt_leads").insert({ business_id: bizA, attribution: "campaign_code" });
    expect(r.error?.code).toBe("23514");
  });

  it("queda en la auditoría y anon no tiene acceso", async () => {
    expect(Number(sql(`select count(*) from mkt_audit_log where business_id = '${bizA}' and entity = 'mkt_leads'`))).toBeGreaterThan(0);
    const anon = createClient(API_URL, ANON_KEY, { auth: { persistSession: false } });
    const r = await anon.from("mkt_leads").select("id");
    expect(r.error?.code).toBe("42501");
  });
});
