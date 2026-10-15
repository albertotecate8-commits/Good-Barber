// Estudio creativo contra el stack local real + montaje real con FFmpeg.
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ANON_KEY, API_URL, SERVICE_KEY } from "../../scripts/local-supabase/stack.mjs";
import { buildFfmpegArgs } from "@/lib/creative/video";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
let ffmpeg = false;
try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  ffmpeg = true;
} catch {
  ffmpeg = false;
}
const run = randomUUID().slice(0, 8);
const password = "Prueba12345!";
const sql = (q: string) => execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

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
async function business(c: SupabaseClient, uid: string, name: string) {
  const id = randomUUID();
  const { error } = await c.from("mkt_businesses").insert({ id, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, created_by: uid });
  if (error) throw error;
  return id;
}
async function asset(c: SupabaseClient, biz: string, over: Record<string, unknown> = {}) {
  const id = randomUUID();
  const { error } = await c.from("mkt_assets").insert({ id, business_id: biz, kind: "image", title: "Foto", storage_backend: "local_dev", storage_path: `${biz}/${id}/f.jpg`, original_name: "f.jpg", mime_type: "image/jpeg", ...over });
  if (error) throw error;
  await c.from("mkt_assets").update({ upload_status: "ready" }).eq("id", id);
  return id;
}
async function project(c: SupabaseClient, biz: string, over: Record<string, unknown> = {}) {
  const id = randomUUID();
  const { error } = await c.from("mkt_creative_projects").insert({ id, business_id: biz, title: "Promo corte", material_type: "ad", format_key: "ig_portrait", width: 1080, height: 1350, ...over });
  return { id, error };
}

describe.skipIf(!reachable)("estudio creativo: permisos y reglas", () => {
  let ana: Awaited<ReturnType<typeof makeUser>>;
  let beto: Awaited<ReturnType<typeof makeUser>>;
  let caro: Awaited<ReturnType<typeof makeUser>>;
  let bizA: string;
  let bizA2: string;
  let bizB: string;

  beforeAll(async () => {
    [ana, beto, caro] = await Promise.all([makeUser("ana", true), makeUser("beto", true), makeUser("caro", false)]);
    [bizA, bizA2, bizB] = await Promise.all([business(ana.client, ana.id, "Barberia A"), business(ana.client, ana.id, "Unas A2"), business(beto.client, beto.id, "Barberia B")]);
    await ana.client.from("mkt_business_members").insert({ business_id: bizA, user_id: caro.id, role: "viewer" });
  });
  afterAll(() => {
    if (!reachable) return;
    sql(`delete from mkt_businesses where slug like '%-${run}'`);
    sql(`delete from auth.users where email like '%-${run}@test.local'`);
  });

  it("crear proyecto con referencias propias y versiones numeradas", async () => {
    const ref = await asset(ana.client, bizA);
    const { id, error } = await project(ana.client, bizA, { reference_asset_ids: [ref] });
    expect(error).toBeNull();
    for (const n of [1, 2]) {
      const { error: e } = await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: id, version_no: n, kind: "concept", concept: { angle: "Precio claro" } });
      expect(e).toBeNull();
    }
    const { error: dup } = await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: id, version_no: 2, kind: "concept" });
    expect(dup?.code).toBe("23505");
  });

  it("no se pueden usar referencias ni campañas de otro negocio", async () => {
    const refB = await asset(beto.client, bizB);
    expect((await project(ana.client, bizA, { reference_asset_ids: [refB] })).error?.code).toBe("42501");
    const refA2 = await asset(ana.client, bizA2);
    expect((await project(ana.client, bizA, { reference_asset_ids: [refA2] })).error?.code).toBe("42501");
    const campaignB = randomUUID();
    await beto.client.from("mkt_campaigns").insert({ id: campaignB, business_id: bizB, name: "Campaña B" });
    expect((await project(ana.client, bizA, { campaign_id: campaignB })).error?.code).toBe("42501");
  });

  it("una versión no puede usar archivos ni versiones de otro negocio o proyecto", async () => {
    const { id: pA } = await project(ana.client, bizA);
    const { id: pA_other } = await project(ana.client, bizA);
    const fileA2 = await asset(ana.client, bizA2);
    const { error } = await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: pA, version_no: 1, kind: "code_edit", asset_id: fileA2 });
    expect(error?.code).toBe("42501");
    const parent = randomUUID();
    await ana.client.from("mkt_creative_versions").insert({ id: parent, business_id: bizA, project_id: pA_other, version_no: 1, kind: "concept" });
    const { error: e2 } = await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: pA, version_no: 1, kind: "concept", parent_version_id: parent });
    expect(e2?.code).toBe("42501");
  });

  it("un material definitivo exige archivo y revisión aprobada", async () => {
    const { id: p } = await project(ana.client, bizA);
    const file = await asset(ana.client, bizA);
    const base = { business_id: bizA, project_id: p, kind: "code_edit", asset_id: file };
    expect((await ana.client.from("mkt_creative_versions").insert({ ...base, version_no: 1, is_final: true, qa_status: "failed" })).error?.code).toBe("23514");
    expect((await ana.client.from("mkt_creative_versions").insert({ ...base, version_no: 2, is_final: true, qa_status: "pending" })).error?.code).toBe("23514");
    expect((await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: p, version_no: 3, kind: "concept", is_final: true, qa_status: "passed" })).error?.code).toBe("23514");
    expect((await ana.client.from("mkt_creative_versions").insert({ ...base, version_no: 4, is_final: true, qa_status: "passed_with_warnings" })).error).toBeNull();
  });

  it("otro negocio no ve ni modifica proyectos ni versiones; la lectora solo lee", async () => {
    const { id: p } = await project(ana.client, bizA);
    await ana.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: p, version_no: 1, kind: "concept" });
    expect((await beto.client.from("mkt_creative_projects").select("id").eq("id", p)).data).toEqual([]);
    expect((await beto.client.from("mkt_creative_versions").select("id").eq("project_id", p)).data).toEqual([]);
    expect((await beto.client.from("mkt_creative_projects").update({ title: "x" }).eq("id", p).select("id")).data).toEqual([]);
    expect((await beto.client.from("mkt_creative_versions").insert({ business_id: bizB, project_id: p, version_no: 9, kind: "concept" })).error?.code).toBe("42501");
    expect((await caro.client.from("mkt_creative_projects").select("id").eq("id", p)).data).toHaveLength(1);
    expect((await caro.client.from("mkt_creative_projects").update({ title: "x" }).eq("id", p).select("id")).data).toEqual([]);
    expect((await caro.client.from("mkt_creative_versions").insert({ business_id: bizA, project_id: p, version_no: 5, kind: "concept" })).error?.code).toBe("42501");
  });

  it("un proyecto no se puede mover a otro negocio", async () => {
    const { id: p } = await project(ana.client, bizA);
    expect((await ana.client.from("mkt_creative_projects").update({ business_id: bizA2 }).eq("id", p)).error?.code).toBe("42501");
  });

  it("valida tipo de material, formato y dimensiones", async () => {
    expect((await project(ana.client, bizA, { material_type: "meme" })).error?.code).toBe("23514");
    expect((await project(ana.client, bizA, { format_key: "Formato Raro!" })).error?.code).toBe("23514");
    expect((await project(ana.client, bizA, { width: 99999 })).error?.code).toBe("23514");
  });

  it("la biblioteca acepta audio con licencia y dimensiones reales", async () => {
    const a = await asset(ana.client, bizA, { kind: "audio", mime_type: "audio/mpeg", storage_path: `${bizA}/${randomUUID()}/m.mp3`, original_name: "m.mp3", license_note: "Música propia" });
    expect(a).toBeTruthy();
    const { error } = await ana.client.from("mkt_assets").update({ width: 0 }).eq("id", a);
    expect(error?.code).toBe("23514");
  });
});

describe.skipIf(!ffmpeg)("montaje real con FFmpeg", () => {
  it("produce un MP4 vertical H.264 + AAC con la duración del plan", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-ff-"));
    try {
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=s=1600x1200:d=1", "-frames:v", "1", path.join(dir, "a.jpg")]);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=30:d=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "b.mp4")]);
      execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=f=440:d=2", path.join(dir, "m.wav")]);
      fs.writeFileSync(path.join(dir, "t.txt"), "Corte $120");
      fs.writeFileSync(path.join(dir, "c.txt"), "Agenda por mensaje");
      const font = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"].find((f) => fs.existsSync(f)) ?? null;
      const out = path.join(dir, "o.mp4");
      execFileSync("ffmpeg", buildFfmpegArgs({
        inputs: [{ path: path.join(dir, "a.jpg"), kind: "image", duration: 2, textFile: font ? path.join(dir, "t.txt") : null }, { path: path.join(dir, "b.mp4"), kind: "video", duration: 2.5, textFile: null }],
        endCard: font ? { seconds: 1.5, textFile: path.join(dir, "c.txt") } : null,
        music: path.join(dir, "m.wav"),
        width: 1080,
        height: 1920,
        safeBottom: 320,
        background: "#0B0B0D",
        fade: true,
        font,
        output: out,
      }));
      const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", out], { encoding: "utf8" });
      const info = JSON.parse(probe);
      expect(info.streams.map((s: { codec_name: string }) => s.codec_name).sort()).toEqual(["aac", "h264"]);
      expect(info.streams.find((s: { width?: number }) => s.width)).toMatchObject({ width: 1080, height: 1920 });
      expect(Number(info.format.duration)).toBeCloseTo(font ? 6 : 4.5, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
