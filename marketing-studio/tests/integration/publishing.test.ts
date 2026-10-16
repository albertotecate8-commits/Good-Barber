// Publicación automática contra la base local real (RLS, triggers, candados).
// La llamada a Meta se sustituye por una función simulada: NO se publica nada.
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";
import { encryptToken } from "@/lib/meta/crypto";
import { MetaError } from "@/lib/meta/graph";
import { publishDue } from "@/lib/meta/worker";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const KEY = randomBytes(32).toString("base64");
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();
const graph = { appId: "1", appSecret: "s", graphVersion: "v26.0", redirectUri: "http://localhost/api/meta/retorno" };

async function makeOwner() {
  const email = `pub-${run}@test.local`;
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

describe.skipIf(!reachable)("publicación automática (base local + Meta simulada)", () => {
  let owner: Awaited<ReturnType<typeof makeOwner>>;
  let db: SupabaseClient;
  let biz: string;
  const future = () => new Date(Date.now() + 3600_000).toISOString();

  async function content(over: Record<string, unknown> = {}) {
    const id = randomUUID();
    const { error } = await owner.client
      .from("mkt_content_items")
      .insert({ id, business_id: biz, platform: "facebook_page", title: "Corte", caption: "Corte $120", status: "scheduled", scheduled_at: future(), ...over });
    if (error) throw error;
    return id;
  }
  /** Aprobación como la hace el servidor (service_role) tras verificar al dueño. */
  const approve = (id: string) => db.from("mkt_content_items").update({ publish_mode: "api", approved_by: owner.id, approved_at: new Date().toISOString() }).eq("id", id);
  // Adelanta la hora como lo haría el paso del tiempo (como servidor, para no revocar la aprobación).
  const makeDue = (id: string) =>
    sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); update mkt_content_items set scheduled_at = now() - interval '1 minute' where id = '${id}'; commit;`);

  beforeAll(async () => {
    db = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    owner = await makeOwner();
    biz = randomUUID();
    await owner.client.from("mkt_businesses").insert({ id: biz, name: "GB Pub", slug: `gb-pub-${run}`, created_by: owner.id });
    const { data: acc } = await db
      .from("mkt_social_accounts")
      .insert({ business_id: biz, platform: "facebook_page", handle: "Good barber", external_id: "1001", connection_status: "connected" })
      .select("id")
      .single();
    await db.from("mkt_social_tokens").insert({
      social_account_id: acc!.id,
      business_id: biz,
      token_ciphertext: encryptToken("PAGE-TOKEN", KEY),
      scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
      page_tasks: ["MANAGE", "CREATE_CONTENT"],
    });
  });

  it("el navegador no puede aprobar ni activar la publicación automática", async () => {
    const id = await content();
    const r = await owner.client.from("mkt_content_items").update({ publish_mode: "api" }).eq("id", id);
    expect(r.error?.code).toBe("42501");
    await owner.client.from("mkt_content_items").update({ approved_at: new Date().toISOString(), title: "Corte" }).eq("id", id);
    expect(sql(`select coalesce(approved_at::text, 'null') from mkt_content_items where id = '${id}'`)).toBe("null");
  });

  it("editar una publicación aprobada revoca la aprobación", async () => {
    const id = await content();
    await approve(id);
    await owner.client.from("mkt_content_items").update({ caption: "Corte $99" }).eq("id", id);
    expect(sql(`select publish_mode || '|' || coalesce(approved_at::text, 'null') from mkt_content_items where id = '${id}'`)).toBe("manual|null");
  });

  it("no publica lo que no está aprobado o cuya hora no ha llegado", async () => {
    const notApproved = await content();
    makeDue(notApproved);
    const notDue = await content();
    await approve(notDue);
    const publish = vi.fn();
    await publishDue({ db, graph, tokenKey: KEY, publish });
    expect(publish).not.toHaveBeenCalled();
  });

  it("publica una sola vez aunque el proceso se ejecute dos veces a la vez", async () => {
    const id = await content({ caption: "Corte clásico $120", hashtags: ["barberia"] });
    await approve(id);
    makeDue(id);
    const publish = vi.fn(async (...args: [unknown, unknown]) => {
      void args;
      await new Promise((r) => setTimeout(r, 150));
      return { externalPostId: "1001_777" };
    });
    const [a, b] = await Promise.all([publishDue({ db, graph, tokenKey: KEY, publish }), publishDue({ db, graph, tokenKey: KEY, publish })]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toMatchObject({ platform: "facebook_page", externalId: "1001", pageToken: "PAGE-TOKEN", caption: "Corte clásico $120\n\n#barberia", media: null });
    expect(a.published + b.published).toBe(1);
    expect(sql(`select status || '|' || external_post_id from mkt_content_items where id = '${id}'`)).toBe("published|1001_777");
    expect(sql(`select count(*) from mkt_publish_attempts where content_id = '${id}' and outcome = 'success'`)).toBe("1");
    // Una tercera ejecución no la vuelve a tomar.
    await publishDue({ db, graph, tokenKey: KEY, publish });
    expect(publish).toHaveBeenCalledTimes(1);
    // La base impide registrar un segundo éxito para el mismo contenido.
    const dup = await db.from("mkt_publish_attempts").insert({ content_id: id, business_id: biz, platform: "facebook_page", outcome: "success" });
    expect(dup.error?.code).toBe("23505");
  });

  it("reintenta errores temporales y a los 3 fallos la deja en «Error»", async () => {
    const id = await content();
    await approve(id);
    makeDue(id);
    const publish = vi.fn(async () => {
      throw new MetaError("Meta respondió con un error: temporal", "graph_2");
    });
    for (let i = 1; i <= 3; i++) {
      await publishDue({ db, graph, tokenKey: KEY, publish });
      expect(sql(`select publish_attempts from mkt_content_items where id = '${id}'`)).toBe(String(i));
    }
    expect(sql(`select status || '|' || last_error from mkt_content_items where id = '${id}'`)).toBe("error|Meta respondió con un error: temporal");
    expect(sql(`select count(*) from mkt_publish_attempts where content_id = '${id}' and outcome = 'error'`)).toBe("3");
    await publishDue({ db, graph, tokenKey: KEY, publish });
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it("sin permisos de publicación falla de inmediato sin llamar a Meta", async () => {
    const id = await content({ platform: "instagram" });
    await approve(id);
    makeDue(id);
    const { data: acc } = await db
      .from("mkt_social_accounts")
      .insert({ business_id: biz, platform: "instagram", handle: "good_barber_oficial", external_id: "1784", connection_status: "connected" })
      .select("id")
      .single();
    await db.from("mkt_social_tokens").insert({ social_account_id: acc!.id, business_id: biz, token_ciphertext: encryptToken("PAGE-TOKEN", KEY), scopes: ["instagram_basic"] });
    const publish = vi.fn();
    const r = await publishDue({ db, graph, tokenKey: KEY, publish });
    expect(publish).not.toHaveBeenCalled();
    expect(r.details.find((d) => d.contentId === id)?.message).toMatch(/Faltan permisos de publicación: instagram_content_publish/);
    expect(sql(`select status from mkt_content_items where id = '${id}'`)).toBe("error");
  });
});
