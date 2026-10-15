// Calendario + Biblioteca contra el stack local real (Auth + PostgREST + Postgres
// con todas las migraciones). Requiere: npm run local:up. Si no responde, se omite.
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
const PSQL = ["-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres"];

function sql(query: string) {
  return execFileSync("psql", [...PSQL, "-c", query], { encoding: "utf8" }).trim();
}

/** Ejecuta SQL como un usuario autenticado (igual que hace PostgREST), dentro de una transacción. */
function sqlAs(userId: string, query: string): { ok: true; out: string } | { ok: false; error: string } {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const script = `begin;\nset local role authenticated;\nset local request.jwt.claims = '${claims}';\n${query};\ncommit;`;
  try {
    return { ok: true, out: execFileSync("psql", PSQL, { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() };
  } catch (e) {
    return { ok: false, error: String((e as { stderr?: string }).stderr ?? e) };
  }
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
  const { error } = await c.from("mkt_businesses").insert({ id, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${run}`, created_by: userId });
  if (error) throw error;
  return id;
}

async function createAsset(c: SupabaseClient, businessId: string, opts: { ready?: boolean; backend?: string } = {}) {
  const id = randomUUID();
  const path = `${businessId}/${id}/foto.jpg`;
  const { error } = await c.from("mkt_assets").insert({
    id,
    business_id: businessId,
    kind: "image",
    title: "Foto",
    storage_backend: opts.backend ?? "local_dev",
    storage_path: path,
    original_name: "foto.jpg",
    mime_type: "image/jpeg",
    size_bytes: 1000,
  });
  if (error) throw error;
  if (opts.ready !== false) {
    const { error: e2 } = await c.from("mkt_assets").update({ upload_status: "ready" }).eq("id", id);
    if (e2) throw e2;
  }
  return { id, path };
}

const service = createClient(API_URL, SERVICE_KEY, { auth: { persistSession: false } });

describe.skipIf(!reachable)("calendario y biblioteca: permisos y aislamiento", () => {
  let ana: Awaited<ReturnType<typeof makeUser>>;
  let beto: Awaited<ReturnType<typeof makeUser>>;
  let caro: Awaited<ReturnType<typeof makeUser>>; // lectora del negocio de Ana
  let bizA: string;
  let bizA2: string;
  let bizB: string;

  beforeAll(async () => {
    [ana, beto, caro] = await Promise.all([makeUser("ana", true), makeUser("beto", true), makeUser("caro", false)]);
    [bizA, bizA2, bizB] = await Promise.all([
      createBusiness(ana.client, ana.id, "Barberia A"),
      createBusiness(ana.client, ana.id, "Unas A2"),
      createBusiness(beto.client, beto.id, "Negocio B"),
    ]);
    const { error } = await ana.client.from("mkt_business_members").insert({ business_id: bizA, user_id: caro.id, role: "viewer" });
    if (error) throw error;
  });

  afterAll(() => {
    if (!reachable) return;
    sql(`delete from storage.objects where name like any (array(select id::text || '/%' from mkt_businesses where slug like '%-${run}'))`);
    sql(`delete from mkt_businesses where slug like '%-${run}'`);
    sql(`delete from auth.users where email like '%-${run}@test.local'`);
  });

  describe("publicaciones", () => {
    it("crear, leer, editar y eliminar (dueña)", async () => {
      const id = randomUUID();
      const scheduled = "2030-01-10T18:00:00.000Z";
      const { error } = await ana.client.from("mkt_content_items").insert({
        id,
        business_id: bizA,
        platform: "instagram",
        format: "reel",
        title: "Reel promo",
        caption: "Corte $120",
        hashtags: ["barberia", "durango"],
        scheduled_at: scheduled,
        status: "scheduled",
      });
      expect(error).toBeNull();
      const { data: read } = await ana.client.from("mkt_content_items").select("title,hashtags,status,publish_mode").eq("id", id).single();
      expect(read).toEqual({ title: "Reel promo", hashtags: ["barberia", "durango"], status: "scheduled", publish_mode: "manual" });

      const { data: upd } = await ana.client.from("mkt_content_items").update({ status: "review", title: "Reel v2" }).eq("id", id).select("status,title");
      expect(upd).toEqual([{ status: "review", title: "Reel v2" }]);

      const { data: del } = await ana.client.from("mkt_content_items").delete().eq("id", id).select("id");
      expect(del).toEqual([{ id }]);
      const { data: gone } = await ana.client.from("mkt_content_items").select("id").eq("id", id);
      expect(gone).toEqual([]);
    });

    it("otro negocio no puede leer, editar ni eliminar", async () => {
      const id = randomUUID();
      await ana.client.from("mkt_content_items").insert({ id, business_id: bizA, caption: "Privado" });
      expect((await beto.client.from("mkt_content_items").select("id").eq("id", id)).data).toEqual([]);
      expect((await beto.client.from("mkt_content_items").update({ caption: "x" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await beto.client.from("mkt_content_items").delete().eq("id", id).select("id")).data).toEqual([]);
      const { error } = await beto.client.from("mkt_content_items").insert({ business_id: bizA, caption: "intruso" });
      expect(error?.code).toBe("42501");
      const { data: still } = await ana.client.from("mkt_content_items").select("caption").eq("id", id).single();
      expect(still?.caption).toBe("Privado");
    });

    it("una lectora puede ver pero no crear, editar ni eliminar", async () => {
      const id = randomUUID();
      await ana.client.from("mkt_content_items").insert({ id, business_id: bizA, caption: "Visible" });
      expect((await caro.client.from("mkt_content_items").select("id").eq("id", id)).data).toHaveLength(1);
      expect((await caro.client.from("mkt_content_items").insert({ business_id: bizA, caption: "x" })).error?.code).toBe("42501");
      expect((await caro.client.from("mkt_content_items").update({ caption: "x" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await caro.client.from("mkt_content_items").delete().eq("id", id).select("id")).data).toEqual([]);
    });

    it("el estado «En revisión» se guarda como review y «pending» ya no existe", async () => {
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", status: "review" })).error).toBeNull();
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", status: "pending" })).error).not.toBeNull();
    });

    it("programar exige fecha (regla en la base)", async () => {
      const { error } = await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", status: "scheduled" });
      expect(error?.code).toBe("23514");
    });

    it("el navegador no puede fijar error, modo api, ni campos de la plataforma", async () => {
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", status: "error" })).error?.code).toBe("42501");
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", publish_mode: "api" })).error?.code).toBe("42501");
      const { data } = await ana.client
        .from("mkt_content_items")
        .insert({ business_id: bizA, caption: "a", last_error: "falso", external_post_id: "123" })
        .select("last_error,external_post_id");
      expect(data).toEqual([{ last_error: null, external_post_id: null }]);
    });

    it("máximo 30 hashtags y URL manual https", async () => {
      const many = Array.from({ length: 31 }, (_, i) => `t${i}`);
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", hashtags: many })).error?.code).toBe("23514");
      expect((await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "a", manual_post_url: "http://x.com" })).error?.code).toBe("23514");
    });

    it("solo el servidor registra intentos de publicación; cada negocio ve solo los suyos", async () => {
      const id = randomUUID();
      await ana.client.from("mkt_content_items").insert({ id, business_id: bizA, caption: "a" });
      const { error } = await ana.client.from("mkt_publish_attempts").insert({ content_id: id, business_id: bizA, platform: "instagram", outcome: "success" });
      expect(error).not.toBeNull();
      const { error: svcError } = await service
        .from("mkt_publish_attempts")
        .insert({ content_id: id, business_id: bizA, platform: "instagram", outcome: "skipped" });
      expect(svcError).toBeNull();
      expect((await ana.client.from("mkt_publish_attempts").select("outcome").eq("content_id", id)).data).toEqual([{ outcome: "skipped" }]);
      expect((await beto.client.from("mkt_publish_attempts").select("id").eq("content_id", id)).data).toEqual([]);
    });
  });

  describe("biblioteca", () => {
    it("crear, editar metadatos y eliminar un recurso", async () => {
      const { id } = await createAsset(ana.client, bizA);
      const { data } = await ana.client.from("mkt_assets").update({ title: "Logo nuevo", tags: ["logo", "oficial"] }).eq("id", id).select("title,tags");
      expect(data).toEqual([{ title: "Logo nuevo", tags: ["logo", "oficial"] }]);
      expect((await ana.client.from("mkt_assets").delete().eq("id", id).select("id")).data).toEqual([{ id }]);
    });

    it("otro negocio no ve, edita ni elimina los recursos", async () => {
      const { id } = await createAsset(ana.client, bizA);
      expect((await beto.client.from("mkt_assets").select("id").eq("id", id)).data).toEqual([]);
      expect((await beto.client.from("mkt_assets").update({ title: "x" }).eq("id", id).select("id")).data).toEqual([]);
      expect((await beto.client.from("mkt_assets").delete().eq("id", id).select("id")).data).toEqual([]);
      expect((await caro.client.from("mkt_assets").select("id").eq("id", id)).data).toHaveLength(1);
      expect((await caro.client.from("mkt_assets").delete().eq("id", id).select("id")).data).toEqual([]);
    });

    it("no se puede registrar un archivo en la carpeta de otro negocio", async () => {
      const { error } = await beto.client.from("mkt_assets").insert({
        business_id: bizB,
        kind: "image",
        title: "x",
        storage_backend: "supabase",
        storage_path: `${bizA}/${randomUUID()}/x.jpg`,
        original_name: "x.jpg",
        mime_type: "image/jpeg",
      });
      expect(error?.code).toBe("23514");
      const { error: e2 } = await beto.client.from("mkt_assets").insert({
        business_id: bizA,
        kind: "image",
        title: "x",
        storage_backend: "supabase",
        storage_path: `${bizA}/${randomUUID()}/x.jpg`,
        original_name: "x.jpg",
        mime_type: "image/jpeg",
      });
      expect(e2?.code).toBe("42501");
    });

    it("un archivo no se puede mover de negocio ni cambiar sus datos técnicos", async () => {
      const { id } = await createAsset(ana.client, bizA);
      expect((await ana.client.from("mkt_assets").update({ business_id: bizA2 }).eq("id", id)).error?.code).toBe("42501");
      expect((await ana.client.from("mkt_assets").update({ mime_type: "image/png" }).eq("id", id)).error?.code).toBe("42501");
    });

    it("una publicación solo puede usar recursos de su mismo negocio", async () => {
      const { id: assetA } = await createAsset(ana.client, bizA);
      // Misma dueña, otro negocio suyo: tampoco se permite mezclar.
      const r1 = await ana.client.from("mkt_content_items").insert({ business_id: bizA2, caption: "a", asset_id: assetA });
      expect(r1.error?.code).toBe("42501");
      // Otro dueño con el id adivinado.
      const r2 = await beto.client.from("mkt_content_items").insert({ business_id: bizB, caption: "a", asset_id: assetA });
      expect(r2.error?.code).toBe("42501");
      const r3 = await ana.client.from("mkt_content_items").insert({ business_id: bizA, caption: "ok", asset_id: assetA }).select("id");
      expect(r3.error).toBeNull();
    });

    it("al eliminar un recurso, las publicaciones quedan sin recurso", async () => {
      const { id: assetId } = await createAsset(ana.client, bizA);
      const contentId = randomUUID();
      await ana.client.from("mkt_content_items").insert({ id: contentId, business_id: bizA, caption: "a", asset_id: assetId });
      await ana.client.from("mkt_assets").delete().eq("id", assetId);
      const { data } = await ana.client.from("mkt_content_items").select("asset_id").eq("id", contentId).single();
      expect(data?.asset_id).toBeNull();
    });

    it("registra auditoría de los recursos", async () => {
      const { id } = await createAsset(ana.client, bizA);
      const { data } = await ana.client.from("mkt_audit_log").select("action").eq("entity", "mkt_assets").eq("entity_id", id);
      expect(data?.map((d) => d.action)).toEqual(expect.arrayContaining(["insert", "update"]));
    });
  });

  describe("políticas de Supabase Storage (bucket mkt-assets)", () => {
    it("el bucket es privado con límite de 50 MB", () => {
      expect(sql(`select public || ',' || file_size_limit from storage.buckets where id = 'mkt-assets'`)).toBe("false,52428800");
    });

    it("solo se sube un objeto si existe su registro pendiente y puedes editar el negocio", async () => {
      const { path } = await createAsset(ana.client, bizA, { ready: false, backend: "supabase" });
      const insert = (who: string, name: string) =>
        sqlAs(who, `insert into storage.objects (bucket_id, name) values ('mkt-assets', '${name}')`);
      expect(insert(beto.id, path).ok).toBe(false); // otro negocio
      expect(insert(caro.id, path).ok).toBe(false); // lectora
      expect(insert(ana.id, `${bizA}/${randomUUID()}/suelto.jpg`).ok).toBe(false); // sin registro
      expect(insert(ana.id, path)).toMatchObject({ ok: true });
    });

    it("leer y borrar objetos respeta el negocio", async () => {
      const { path } = await createAsset(ana.client, bizA, { ready: false, backend: "supabase" });
      sql(`insert into storage.objects (bucket_id, name) values ('mkt-assets', '${path}')`);
      const count = (who: string) => sqlAs(who, `select count(*) from storage.objects where name = '${path}'`);
      expect(count(ana.id)).toEqual({ ok: true, out: "1" });
      expect(count(caro.id)).toEqual({ ok: true, out: "1" });
      expect(count(beto.id)).toEqual({ ok: true, out: "0" });
      sqlAs(beto.id, `delete from storage.objects where name = '${path}'`);
      sqlAs(caro.id, `delete from storage.objects where name = '${path}'`);
      expect(sql(`select count(*) from storage.objects where name = '${path}'`)).toBe("1");
      sqlAs(ana.id, `delete from storage.objects where name = '${path}'`);
      expect(sql(`select count(*) from storage.objects where name = '${path}'`)).toBe("0");
    });

    it("no se puede sobrescribir un objeto existente", async () => {
      const { path } = await createAsset(ana.client, bizA, { ready: false, backend: "supabase" });
      sql(`insert into storage.objects (bucket_id, name) values ('mkt-assets', '${path}')`);
      sqlAs(ana.id, `update storage.objects set metadata = '{"x":1}' where name = '${path}'`);
      expect(sql(`select coalesce(metadata::text, 'null') from storage.objects where name = '${path}'`)).toBe("null");
    });
  });
});
