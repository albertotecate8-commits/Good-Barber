// Distribución asistida a grupos contra la base local real (RLS, triggers).
// Meta se sustituye por funciones simuladas: NO se publica nada en Facebook.
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";
import { encryptToken } from "@/lib/meta/crypto";
import { publishDue } from "@/lib/meta/worker";
import { createDistribution } from "@/lib/distribution/server";
import { nextTask, type QueueTask } from "@/lib/distribution/core";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const KEY = randomBytes(32).toString("base64");
const password = "Prueba12345!";
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();
const graph = { appId: "1", appSecret: "s", graphVersion: "v26.0", redirectUri: "http://localhost/api/meta/retorno" };
const anonClient = () => createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function makeUser(name: string, admin: boolean) {
  const email = `dist-${name}-${run}@test.local`;
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const user = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(user));
  if (admin) sql(`insert into mkt_admins (user_id) values ('${user.id}')`);
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { id: user.id as string, email, client };
}

describe.skipIf(!reachable)("distribución a grupos (base local + Meta simulada)", () => {
  let db: SupabaseClient;
  let ana: Awaited<ReturnType<typeof makeUser>>; // dueña de Good Barber (A)
  let beto: Awaited<ReturnType<typeof makeUser>>; // dueño de Glamour (B)
  let bizA: string;
  let bizB: string;
  const groupsA: string[] = [];
  let groupB: string;
  let inactiveA: string;

  async function group(c: SupabaseClient, business: string, slug: string, over: Record<string, unknown> = {}) {
    const { data, error } = await c
      .from("mkt_fb_groups")
      .insert({ business_id: business, name: `Grupo ${slug}`, url: `https://www.facebook.com/groups/${slug}-${run}/`, ...over })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }
  async function content(c: SupabaseClient, business: string, over: Record<string, unknown> = {}) {
    const id = randomUUID();
    const { error } = await c
      .from("mkt_content_items")
      .insert({ id, business_id: business, platform: "facebook_page", title: "Corte", caption: "Corte $120", status: "scheduled", scheduled_at: new Date(Date.now() + 3600_000).toISOString(), ...over });
    if (error) throw error;
    return id;
  }
  const tasksOf = async (c: SupabaseClient, contentId: string) =>
    ((await c.from("mkt_distribution_tasks").select("id, group_id, status, position, opened_at, confirmed_at, confirmed_by, post_text").eq("content_id", contentId).order("position")).data ?? []) as (QueueTask & {
      group_id: string;
      confirmed_by: string | null;
      post_text: string;
    })[];

  beforeAll(async () => {
    db = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    [ana, beto] = await Promise.all([makeUser("ana", true), makeUser("beto", true)]);
    bizA = randomUUID();
    bizB = randomUUID();
    await ana.client.from("mkt_businesses").insert({ id: bizA, name: "Good Barber Dist", slug: `gb-dist-${run}`, sector: "Barbería", created_by: ana.id });
    await beto.client.from("mkt_businesses").insert({ id: bizB, name: "Glamour Dist", slug: `gl-dist-${run}`, created_by: beto.id });
    for (const s of ["vecinos", "durango", "ofertas"]) groupsA.push(await group(ana.client, bizA, s));
    inactiveA = await group(ana.client, bizA, "inactivo", { active: false });
    groupB = await group(beto.client, bizB, "glamour");
  });

  afterAll(() => {
    if (!reachable) return;
    sql(`delete from mkt_businesses where slug like '%-dist-${run}'`);
    sql(`delete from auth.users where email like 'dist-%-${run}@test.local'`);
  });

  it("los grupos de un negocio no se ven ni se modifican desde otro", async () => {
    const { data: seenByBeto } = await beto.client.from("mkt_fb_groups").select("id").in("id", groupsA);
    expect(seenByBeto).toEqual([]);
    const ins = await beto.client.from("mkt_fb_groups").insert({ business_id: bizA, name: "Intruso", url: `https://www.facebook.com/groups/intruso-${run}/` });
    expect(ins.error).not.toBeNull();
    await beto.client.from("mkt_fb_groups").update({ active: false }).eq("id", groupsA[0]);
    expect(sql(`select active from mkt_fb_groups where id = '${groupsA[0]}'`)).toBe("t");
    const anon = await anonClient().from("mkt_fb_groups").select("id");
    expect(anon.error?.code === "42501" || (anon.data ?? []).length === 0).toBe(true);
  });

  it("solo acepta direcciones de grupos de Facebook y no repite grupos en un negocio", async () => {
    const bad = await ana.client.from("mkt_fb_groups").insert({ business_id: bizA, name: "Malo", url: "https://evil.test/groups/x/" });
    expect(bad.error?.code).toBe("23514");
    const dup = await ana.client.from("mkt_fb_groups").insert({ business_id: bizA, name: "Repetido", url: `https://www.facebook.com/groups/vecinos-${run}/` });
    expect(dup.error?.code).toBe("23505");
  });

  it("el enlace «confirmado por Meta» no se puede fabricar desde la app", async () => {
    const id = await content(ana.client, bizA, { external_post_url: "https://www.facebook.com/falso/posts/1" });
    expect(sql(`select coalesce(external_post_url, 'null') from mkt_content_items where id = '${id}'`)).toBe("null");
    await ana.client.from("mkt_content_items").update({ external_post_url: "https://www.facebook.com/falso/posts/2" }).eq("id", id);
    expect(sql(`select coalesce(external_post_url, 'null') from mkt_content_items where id = '${id}'`)).toBe("null");
  });

  it("la base impide mezclar negocios en distribuciones y tareas", async () => {
    const id = await content(ana.client, bizA, { manual_post_url: "https://www.facebook.com/gb/posts/1", manual_posted_at: new Date().toISOString() });
    const { distributionId } = await createDistribution(ana.client, { businessId: bizA, contentId: id, groupIds: [groupsA[0]], sourceUrl: "https://www.facebook.com/gb/posts/1", createdBy: ana.id });
    // Como servidor (sin RLS) el trigger sigue bloqueando un grupo de otro negocio.
    const cross = await db.from("mkt_distribution_tasks").insert({ business_id: bizA, distribution_id: distributionId, content_id: id, group_id: groupB, position: 9 });
    expect(cross.error).not.toBeNull();
    const crossDist = await db.from("mkt_distributions").insert({ business_id: bizB, content_id: id, source_url: "https://www.facebook.com/gb/posts/1" });
    expect(crossDist.error).not.toBeNull();
    // Beto no ve la cola de Ana.
    expect((await beto.client.from("mkt_distribution_tasks").select("id").eq("content_id", id)).data).toEqual([]);
    expect((await beto.client.from("mkt_distributions").select("id").eq("id", distributionId)).data).toEqual([]);
  });

  it("crea una tarea por grupo elegido, sin repetir y omitiendo inactivos u otros negocios", async () => {
    const id = await content(ana.client, bizA);
    const src = "https://www.facebook.com/gb/posts/2";
    const r1 = await createDistribution(ana.client, { businessId: bizA, contentId: id, groupIds: [groupsA[1], groupsA[2], groupsA[1], inactiveA, groupB], sourceUrl: src, createdBy: ana.id });
    expect(r1.added.map((a) => a.groupId).sort()).toEqual([groupsA[1], groupsA[2]].sort());
    expect(r1.skipped.map((s) => s.reason).sort()).toEqual(["No pertenece a este negocio.", "Está desactivado."].sort());
    // Repetir no duplica; amplía la misma distribución.
    const r2 = await createDistribution(ana.client, { businessId: bizA, contentId: id, groupIds: [groupsA[1], groupsA[0]], sourceUrl: src, createdBy: ana.id });
    expect(r2.distributionId).toBe(r1.distributionId);
    expect(r2.added.map((a) => a.groupId)).toEqual([groupsA[0]]);
    expect(r2.skipped[0].reason).toBe("Ya está en la cola de esta publicación.");
    const tasks = await tasksOf(ana.client, id);
    expect(tasks.map((t) => t.position)).toEqual([0, 1, 2]);
    expect(tasks.every((t) => t.status === "pending")).toBe(true);
    expect(new Set(tasks.map((t) => t.post_text)).size).toBe(3); // texto distinto por grupo
    // La base también lo impide aunque se salte la lógica.
    const dup = await ana.client.from("mkt_distribution_tasks").insert({ business_id: bizA, distribution_id: r1.distributionId, content_id: id, group_id: groupsA[1], position: 7 });
    expect(dup.error?.code).toBe("23505");
  });

  it("confirmar lo registra la persona (nombre y fecha los pone la base) y el progreso sobrevive a recargar", async () => {
    const id = await content(ana.client, bizA);
    await createDistribution(ana.client, { businessId: bizA, contentId: id, groupIds: groupsA, sourceUrl: "https://www.facebook.com/gb/posts/3", createdBy: ana.id });
    let tasks = await tasksOf(ana.client, id);
    const [first, second] = tasks;
    await ana.client.from("mkt_distribution_tasks").update({ status: "opened" }).eq("id", first.id);
    // Intento de falsificar quién confirmó: la base pone al usuario real.
    await ana.client.from("mkt_distribution_tasks").update({ status: "confirmed", confirmed_by: beto.id, confirmed_at: "2020-01-01T00:00:00Z" }).eq("id", first.id);
    // «Recargar»: sesión nueva, sin estado en memoria.
    const fresh = anonClient();
    await fresh.auth.signInWithPassword({ email: ana.email, password });
    tasks = await tasksOf(fresh, id);
    const done = tasks.find((t) => t.id === first.id)!;
    expect(done.status).toBe("confirmed");
    expect(done.confirmed_by).toBe(ana.id);
    expect(new Date(done.confirmed_at!).getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(done.opened_at).not.toBeNull();
    expect(nextTask(tasks)?.id).toBe(second.id);
    // Volver a pendiente borra la confirmación.
    await fresh.from("mkt_distribution_tasks").update({ status: "pending" }).eq("id", first.id);
    expect(sql(`select coalesce(confirmed_by::text, 'null') from mkt_distribution_tasks where id = '${first.id}'`)).toBe("null");
  });

  it("al publicar en la página guarda el enlace y crea la cola SOLO con los grupos elegidos", async () => {
    const { data: acc } = await db
      .from("mkt_social_accounts")
      .insert({ business_id: bizA, platform: "facebook_page", handle: "Good Barber Dist", external_id: "2002", connection_status: "connected" })
      .select("id")
      .single();
    await db.from("mkt_social_tokens").insert({
      social_account_id: acc!.id,
      business_id: bizA,
      token_ciphertext: encryptToken("PAGE-TOKEN", KEY),
      scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
      page_tasks: ["MANAGE", "CREATE_CONTENT"],
    });
    // Una segunda publicación del negocio, sin grupos planeados.
    const id = await content(ana.client, bizA, { caption: "Promo martes" });
    const other = await content(ana.client, bizA, { caption: "Sin grupos" });
    // Planear grupos (como la acción del panel) y aprobar/adelantar como el servidor.
    await ana.client.from("mkt_content_items").update({ planned_group_ids: [groupsA[0], groupsA[2]] }).eq("id", id);
    for (const c of [id, other]) {
      await db.from("mkt_content_items").update({ publish_mode: "api", approved_by: ana.id, approved_at: new Date().toISOString() }).eq("id", c);
      sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); update mkt_content_items set scheduled_at = now() - interval '1 minute' where id = '${c}'; commit;`);
    }
    // Las semanas de pausa no aplican a la prueba: la usamos para fijar 'now' en el futuro.
    const now = new Date(Date.now() + 120 * 864e5);
    const publish = vi.fn(async (_o: unknown, input: { externalId: string }) => ({ externalPostId: input.externalId + (publish.mock.calls.length === 1 ? "_501" : "_502") }));
    const permalink = vi.fn(async (_o: unknown, _p: unknown, postId: string) => ({ url: `https://www.facebook.com/gbdist/posts/${postId.split("_")[1]}`, confirmed: true }));
    const out = await publishDue({ db, graph, tokenKey: KEY, publish: publish as never, permalink: permalink as never, now, limit: 10 });
    expect(out.published).toBeGreaterThanOrEqual(2);
    const row = sql(`select external_post_id || '|' || external_post_url || '|' || status from mkt_content_items where id = '${id}'`);
    expect(row).toMatch(/^2002_50\d\|https:\/\/www\.facebook\.com\/gbdist\/posts\/50\d\|published$/);
    // El intento guarda destino, enlace y contenido enviado.
    const resp = JSON.parse(sql(`select response from mkt_publish_attempts where content_id = '${id}' and outcome = 'success'`));
    expect(resp).toMatchObject({ destination: { platform: "facebook_page", external_id: "2002" }, permalink_confirmed: true, caption: "Promo martes" });
    // Cola creada solo con los dos grupos planeados.
    const tasks = await tasksOf(ana.client, id);
    expect(tasks.map((t) => t.group_id).sort()).toEqual([groupsA[0], groupsA[2]].sort());
    expect(tasks.every((t) => t.status === "pending")).toBe(true);
    const { data: dist } = await ana.client.from("mkt_distributions").select("source_url, status").eq("content_id", id).single();
    expect(dist).toMatchObject({ source_url: expect.stringMatching(/^https:\/\/www\.facebook\.com\/gbdist\/posts\//), status: "active" });
    // La otra publicación no tenía grupos: no se crea ninguna cola.
    expect((await ana.client.from("mkt_distributions").select("id").eq("content_id", other)).data).toEqual([]);
    // Nada se marcó como confirmado en grupos: eso solo lo hace la persona.
    expect(sql(`select count(*) from mkt_distribution_tasks where content_id = '${id}' and status = 'confirmed'`)).toBe("0");
  });

  it("si Meta no devuelve enlace, publica igual pero no crea la cola automática", async () => {
    const id = await content(ana.client, bizA, { caption: "Sin enlace" });
    await ana.client.from("mkt_content_items").update({ planned_group_ids: [groupsA[1]] }).eq("id", id);
    await db.from("mkt_content_items").update({ publish_mode: "api", approved_by: ana.id, approved_at: new Date().toISOString() }).eq("id", id);
    sql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); update mkt_content_items set scheduled_at = now() - interval '1 minute' where id = '${id}'; commit;`);
    const publish = vi.fn(async () => ({ externalPostId: "17890" }));
    const permalink = vi.fn(async () => ({ url: null, confirmed: false }));
    await publishDue({ db, graph, tokenKey: KEY, publish: publish as never, permalink: permalink as never, limit: 10 });
    expect(sql(`select status || '|' || coalesce(external_post_url, 'null') from mkt_content_items where id = '${id}'`)).toBe("published|null");
    expect((await ana.client.from("mkt_distributions").select("id").eq("content_id", id)).data).toEqual([]);
  });
});
