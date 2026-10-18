// Estilos, memoria y chat creativo contra la base local real: aislamiento por
// negocio (RLS) y guardas que impiden mezclar marcas aunque una misma persona
// administre ambas.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const run = randomUUID().slice(0, 8);
const password = "Prueba12345!";
const sql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

async function makeUser(name: string) {
  const email = `studio-${name}-${run}@test.local`;
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

describe.skipIf(!reachable)("chat creativo, estilos y memoria (base local)", () => {
  let ana: Awaited<ReturnType<typeof makeUser>>; // dueña de Good Barber y de Glamour
  let beto: Awaited<ReturnType<typeof makeUser>>; // dueño de otro negocio
  const gb = randomUUID();
  const gl = randomUUID();
  const bz = randomUUID();
  let assetGb: string;
  let assetGl: string;

  beforeAll(async () => {
    [ana, beto] = await Promise.all([makeUser("ana"), makeUser("beto")]);
    await ana.client.from("mkt_businesses").insert([
      { id: gb, name: "GB Studio", slug: `gb-studio-${run}`, created_by: ana.id },
      { id: gl, name: "GL Studio", slug: `gl-studio-${run}`, created_by: ana.id },
    ]);
    await beto.client.from("mkt_businesses").insert({ id: bz, name: "BZ Studio", slug: `bz-studio-${run}`, created_by: beto.id });
    assetGb = randomUUID();
    assetGl = randomUUID();
    sql(
      `insert into mkt_assets (id, business_id, kind, title, storage_backend, storage_path, original_name, mime_type, upload_status) values ('${assetGb}', '${gb}', 'image', 'ref', 'local_dev', '${gb}/${assetGb}/a.png', 'a.png', 'image/png', 'ready'), ('${assetGl}', '${gl}', 'logo', 'logo GL', 'local_dev', '${gl}/${assetGl}/l.png', 'l.png', 'image/png', 'ready')`,
    );
  });

  afterAll(() => {
    sql(`delete from mkt_businesses where id in ('${gb}', '${gl}', '${bz}')`);
    sql(`delete from auth.users where email like 'studio-%-${run}@test.local'`);
  });

  it("estilos: se guardan con sus referencias del mismo negocio; nunca con archivos de otra marca", async () => {
    const ok = await ana.client
      .from("mkt_styles")
      .insert({ business_id: gb, name: "Barbería noir", attributes: { measured: { brightness: 20 }, interpreted: {} }, reference_asset_ids: [assetGb], source: "reference_image" })
      .select("id")
      .single();
    expect(ok.error).toBeNull();
    // El logotipo de Glamour no puede ser referencia de un estilo de Good Barber.
    const cross = await ana.client.from("mkt_styles").insert({ business_id: gb, name: "Mezcla", reference_asset_ids: [assetGl] });
    expect(cross.error?.message).toMatch(/mismo negocio/);
    // Nombre único por negocio (sin distinguir mayúsculas), pero se puede repetir en otra marca.
    const dup = await ana.client.from("mkt_styles").insert({ business_id: gb, name: "barbería NOIR " });
    expect(dup.error?.code).toBe("23505");
    const otherBiz = await ana.client.from("mkt_styles").insert({ business_id: gl, name: "Barbería noir" });
    expect(otherBiz.error).toBeNull();
    // Un estilo no se mueve de negocio.
    const move = await ana.client.from("mkt_styles").update({ business_id: gl }).eq("id", ok.data!.id);
    expect(move.error?.message).toMatch(/otro negocio/);
  });

  it("memoria: aislada por negocio y por usuario (RLS)", async () => {
    const m = await ana.client.from("mkt_memory").insert({ business_id: gb, kind: "restriction", text: "Nunca usar color rosa", source: "chat" }).select("id").single();
    expect(m.error).toBeNull();
    const { data: seenByBeto } = await beto.client.from("mkt_memory").select("id").eq("id", m.data!.id);
    expect(seenByBeto).toEqual([]);
    const intrude = await beto.client.from("mkt_memory").insert({ business_id: gb, kind: "fact", text: "Dato ajeno" });
    expect(intrude.error).not.toBeNull();
    const { data: glMem } = await ana.client.from("mkt_memory").select("id").eq("business_id", gl);
    expect(glMem).toEqual([]);
    const bad = await ana.client.from("mkt_memory").insert({ business_id: gb, kind: "invented", text: "x y z" });
    expect(bad.error).not.toBeNull();
  });

  it("conversación: mensajes, versiones y publicación sin mezclar negocios ni duplicar", async () => {
    const { data: project } = await ana.client
      .from("mkt_creative_projects")
      .insert({ business_id: gb, title: "Chat", material_type: "ad", format_key: "ig_portrait", width: 1080, height: 1350 })
      .select("id")
      .single();
    const { data: styleGl } = await ana.client.from("mkt_styles").select("id").eq("business_id", gl).limit(1).single();
    const crossStyle = await ana.client.from("mkt_creative_threads").insert({ business_id: gb, title: "x", project_id: project!.id, style_id: styleGl!.id });
    expect(crossStyle.error?.message).toMatch(/estilo pertenece a otro negocio/);
    const { data: thread, error } = await ana.client.from("mkt_creative_threads").insert({ business_id: gb, title: "Tres anuncios", project_id: project!.id }).select("id").single();
    expect(error).toBeNull();

    const msgCross = await ana.client.from("mkt_creative_messages").insert({ business_id: gl, thread_id: thread!.id, role: "user", content: "hola" });
    expect(msgCross.error?.message).toMatch(/conversación pertenece a otro negocio/);
    const attachCross = await ana.client.from("mkt_creative_messages").insert({ business_id: gb, thread_id: thread!.id, role: "user", content: "con logo ajeno", asset_ids: [assetGl] });
    expect(attachCross.error?.message).toMatch(/mismo negocio/);
    const msg = await ana.client.from("mkt_creative_messages").insert({ business_id: gb, thread_id: thread!.id, role: "user", content: "Haz tres anuncios", asset_ids: [assetGb] });
    expect(msg.error).toBeNull();
    const { data: seen } = await beto.client.from("mkt_creative_messages").select("id").eq("thread_id", thread!.id);
    expect(seen).toEqual([]);

    // Versión importada con estilo propio; un estilo ajeno se rechaza.
    const versionId = randomUUID();
    const vCross = await ana.client.from("mkt_creative_versions").insert({ id: randomUUID(), business_id: gb, project_id: project!.id, version_no: 1, kind: "concept", style_id: styleGl!.id });
    expect(vCross.error?.message).toMatch(/estilo pertenece a otro negocio/);
    const v = await ana.client.from("mkt_creative_versions").insert({ id: versionId, business_id: gb, project_id: project!.id, version_no: 1, kind: "imported_result", asset_id: assetGb });
    expect(v.error).toBeNull();

    // Una publicación por versión y red: el reintento no duplica.
    const row = { business_id: gb, platform: "facebook_page", caption: "Corte", creative_version_id: versionId, asset_id: assetGb };
    expect((await ana.client.from("mkt_content_items").insert(row)).error).toBeNull();
    expect((await ana.client.from("mkt_content_items").insert(row)).error?.code).toBe("23505");
    expect((await ana.client.from("mkt_content_items").insert({ ...row, platform: "instagram" })).error).toBeNull();
    // Glamour no puede colgar su publicación de una versión de Good Barber.
    const glPost = await ana.client.from("mkt_content_items").insert({ business_id: gl, platform: "instagram", caption: "x", creative_version_id: versionId });
    expect(glPost.error?.message).toMatch(/versión pertenece a otro negocio/);
    // Nadie marca «publicado» desde la app.
    const fake = await ana.client.from("mkt_content_items").update({ status: "published" }).eq("creative_version_id", versionId).eq("platform", "facebook_page");
    expect(fake.error?.message).toMatch(/solo se marca como publicada/);
  });
});
