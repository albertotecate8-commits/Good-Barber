// Alta del administrador por correo preautorizado, contra Supabase Auth local real.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();
const email = (n: string) => `invite-${n}-${run}@test.local`;
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function createUser(address: string, confirmed: boolean) {
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email: address, password: `Prueba-${randomUUID()}`, email_confirm: confirmed }),
  });
  const u = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(u));
  return u.id as string;
}
const isAdmin = (id: string) => sql(`select count(*) from mkt_admins where user_id = '${id}'`) === "1";

describe.skipIf(!reachable)("alta del administrador sin manejar contraseñas", () => {
  afterAll(() => {
    if (!reachable) return;
    sql(`delete from auth.users where email like 'invite-%-${run}@test.local'`);
    sql(`delete from mkt_admin_invites where email like 'invite-%-${run}@test.local'`);
  });

  it("un correo preautorizado y confirmado queda como administrador una sola vez", async () => {
    sql(`insert into mkt_admin_invites (email) values ('${email("ok")}')`);
    const id = await createUser(email("ok").toUpperCase(), true);
    expect(isAdmin(id)).toBe(true);
    expect(sql(`select used_by from mkt_admin_invites where email = '${email("ok")}'`)).toBe(id);
  });

  it("sin confirmar el correo no obtiene permisos; al confirmarlo, sí", async () => {
    sql(`insert into mkt_admin_invites (email) values ('${email("pend")}')`);
    const id = await createUser(email("pend"), false);
    expect(isAdmin(id)).toBe(false);
    const r = await fetch(`${API_URL}/auth/v1/admin/users/${id}`, { method: "PUT", headers, body: JSON.stringify({ email_confirm: true }) });
    expect(r.ok).toBe(true);
    expect(isAdmin(id)).toBe(true);
  });

  it("correos no invitados o invitaciones caducadas no dan permisos", async () => {
    const other = await createUser(email("otro"), true);
    expect(isAdmin(other)).toBe(false);
    sql(`insert into mkt_admin_invites (email, expires_at) values ('${email("vieja")}', now() - interval '1 day')`);
    const late = await createUser(email("vieja"), true);
    expect(isAdmin(late)).toBe(false);
  });

  it("la lista de invitaciones no se puede leer ni escribir desde la app", async () => {
    const client = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const read = await client.from("mkt_admin_invites").select("email");
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    const write = await client.from("mkt_admin_invites").insert({ email: email("intruso") });
    expect(write.error).not.toBeNull();
  });
});
