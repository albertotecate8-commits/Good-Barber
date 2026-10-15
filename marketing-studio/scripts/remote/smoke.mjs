#!/usr/bin/env node
// Prueba de humo contra los servicios REALES (Supabase Auth, base de datos con
// RLS y Storage) usando la sesión de tu usuario, exactamente con las mismas
// llamadas que hace la app. No usa la clave service_role.
//
// Crea un negocio temporal «Prueba de humo …», escribe y lee en él una campaña,
// una publicación, un proyecto creativo y archivos reales (imagen PNG y video
// MP4), comprueba los permisos y AL FINAL LO BORRA TODO (archivos incluidos).
// No toca Good Barber, Glamour Studio ni AFORE PRO.
//
// Uso:
//   SMOKE_SUPABASE_URL=https://xxxx.supabase.co \
//   SMOKE_SUPABASE_ANON_KEY=... \
//   SMOKE_EMAIL=tu-correo SMOKE_PASSWORD=tu-contraseña \
//   [SMOKE_APP_URL=https://tu-sitio.netlify.app] \
//   [SMOKE_SECOND_EMAIL=... SMOKE_SECOND_PASSWORD=...]   # usuario SIN negocios, para probar aislamiento
//   node scripts/remote/smoke.mjs
//
// Tu usuario debe estar en mkt_admins (ver docs/DESPLIEGUE.md).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const env = process.env;
const URL_ = env.SMOKE_SUPABASE_URL;
const KEY = env.SMOKE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY || !env.SMOKE_EMAIL || !env.SMOKE_PASSWORD) {
  console.error("Faltan SMOKE_SUPABASE_URL, SMOKE_SUPABASE_ANON_KEY, SMOKE_EMAIL o SMOKE_PASSWORD.");
  process.exit(2);
}
const BUCKET = "mkt-assets";
const results = [];
const record = (status, name, detail = "") => {
  results.push({ status, name, detail });
  const icon = status === "ok" ? "✔" : status === "skip" ? "–" : "✘";
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function step(name, fn) {
  try {
    const detail = await fn();
    record("ok", name, typeof detail === "string" ? detail : "");
  } catch (e) {
    if (e && e.skip) record("skip", name, e.message);
    else record("fail", name, e?.message ?? String(e));
  }
}
const skip = (message) => Object.assign(new Error(message), { skip: true });
const must = (cond, message) => {
  if (!cond) throw new Error(message);
};
const newClient = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// Archivos de prueba: PNG 2×2 fijo y un MP4 de 1 s (ffmpeg si está disponible).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);
function makeMp4() {
  const out = path.join(os.tmpdir(), `smoke-${process.pid}.mp4`);
  try {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x1F1F23:s=320x568:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
    const b = fs.readFileSync(out);
    fs.rmSync(out, { force: true });
    return b;
  } catch {
    return null;
  }
}

const a = newClient();
let userId = null;
let bizId = null;
const uploaded = [];
const slug = `prueba-humo-${Date.now().toString(36)}`;

await step("Auth: iniciar sesión con correo y contraseña", async () => {
  const { data, error } = await a.auth.signInWithPassword({ email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD });
  if (error) throw new Error(error.message);
  userId = data.user.id;
  return `usuario ${data.user.email}`;
});
if (!userId) {
  finish();
}

await step("Auth: el registro público está desactivado", async () => {
  // Se consulta la configuración pública de Auth: no crea ningún usuario.
  const res = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
  must(res.ok, `/auth/v1/settings respondió ${res.status}`);
  const settings = await res.json();
  must(settings.disable_signup === true, "Cualquiera puede registrarse: desactiva «Allow new users to sign up» en Supabase.");
});

await step("Permisos: tu usuario es administrador", async () => {
  const { data, error } = await a.from("mkt_admins").select("user_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  must(data.length === 1, "Tu usuario no está en mkt_admins.");
});

await step("Negocios: crear negocio temporal y leerlo", async () => {
  const { error } = await a.from("mkt_businesses").insert({ slug, name: "Prueba de humo (se borra sola)" });
  if (error) throw new Error(error.message);
  const { data, error: e2 } = await a.from("mkt_businesses").select("id, name").eq("slug", slug).single();
  if (e2) throw new Error(e2.message);
  bizId = data.id;
});

await step("Persistencia: campaña, publicación y proyecto creativo", async () => {
  must(bizId, "Sin negocio temporal.");
  const { data: camp, error: e1 } = await a.from("mkt_campaigns").insert({ business_id: bizId, name: "Campaña de humo" }).select("id").single();
  if (e1) throw new Error(`campaña: ${e1.message}`);
  const when = new Date(Date.now() + 7 * 864e5).toISOString();
  const { error: e2 } = await a
    .from("mkt_content_items")
    .insert({ business_id: bizId, campaign_id: camp.id, title: "Publicación de humo", status: "draft", scheduled_at: when });
  if (e2) throw new Error(`calendario: ${e2.message}`);
  const { error: e3 } = await a
    .from("mkt_creative_projects")
    .insert({ business_id: bizId, campaign_id: camp.id, title: "Proyecto de humo", material_type: "ad", format_key: "ig_portrait", width: 1080, height: 1350 });
  if (e3) throw new Error(`estudio: ${e3.message}`);
  // Se lee con un cliente nuevo para comprobar que quedó guardado en el servidor.
  const b = newClient();
  await b.auth.signInWithPassword({ email: env.SMOKE_EMAIL, password: env.SMOKE_PASSWORD });
  const [c, i, p] = await Promise.all([
    b.from("mkt_campaigns").select("id", { count: "exact", head: true }).eq("business_id", bizId),
    b.from("mkt_content_items").select("id", { count: "exact", head: true }).eq("business_id", bizId),
    b.from("mkt_creative_projects").select("id", { count: "exact", head: true }).eq("business_id", bizId),
  ]);
  must(c.count === 1 && i.count === 1 && p.count === 1, `lecturas: campañas=${c.count} publicaciones=${i.count} proyectos=${p.count}`);
  await b.auth.signOut();
});

await step("Reglas: el navegador no puede marcar «publicado» ni «conectado»", async () => {
  const r1 = await a.from("mkt_content_items").insert({ business_id: bizId, title: "x", status: "published" });
  must(r1.error, "Se pudo marcar una publicación como publicada.");
  const r2 = await a.from("mkt_social_accounts").insert({ business_id: bizId, platform: "facebook_page", handle: "x", connection_status: "connected" });
  must(r2.error, "Se pudo marcar una red como conectada.");
});

async function uploadAndDownload(label, bytes, mime, kind, name) {
  must(bizId, "Sin negocio temporal.");
  const id = crypto.randomUUID();
  const storagePath = `${bizId}/${id}/${name}`;
  const { error: e1 } = await a.from("mkt_assets").insert({
    id, business_id: bizId, kind, title: `${label} de humo`, storage_backend: "supabase", storage_path: storagePath,
    original_name: name, mime_type: mime, size_bytes: bytes.length, upload_status: "pending",
  });
  if (e1) throw new Error(`registro: ${e1.message}`);
  const { error: e2 } = await a.storage.from(BUCKET).upload(storagePath, bytes, { contentType: mime, upsert: false });
  if (e2) throw new Error(`subida: ${e2.message}`);
  uploaded.push(storagePath);
  const { error: e3 } = await a.from("mkt_assets").update({ upload_status: "ready" }).eq("id", id);
  if (e3) throw new Error(`marcar listo: ${e3.message}`);
  const { data: signed, error: e4 } = await a.storage.from(BUCKET).createSignedUrl(storagePath, 60);
  if (e4) throw new Error(`enlace firmado: ${e4.message}`);
  const res = await fetch(signed.signedUrl);
  must(res.ok, `descarga HTTP ${res.status}`);
  const got = Buffer.from(await res.arrayBuffer());
  must(got.equals(Buffer.from(bytes)), `el archivo descargado no coincide (${got.length} vs ${bytes.length} bytes)`);
  const unsigned = await fetch(`${URL_}/storage/v1/object/public/${BUCKET}/${storagePath}`);
  must(!unsigned.ok, "El archivo es accesible sin sesión: el bucket debería ser privado.");
  return { id, storagePath, size: bytes.length };
}

let imageAsset = null;
await step("Storage: subir y descargar una imagen real (PNG)", async () => {
  imageAsset = await uploadAndDownload("Imagen", PNG, "image/png", "image", "humo.png");
  return `${imageAsset.size} bytes, bucket privado`;
});
await step("Storage: subir y descargar un video real (MP4)", async () => {
  const mp4 = makeMp4();
  if (!mp4) throw skip("ffmpeg no está instalado en este equipo; no se generó el video de prueba");
  const v = await uploadAndDownload("Video", mp4, "video/mp4", "video", "humo.mp4");
  return `${v.size} bytes`;
});
await step("Storage: no se puede subir fuera de un registro pendiente propio", async () => {
  must(bizId, "Sin negocio temporal.");
  const { error } = await a.storage.from(BUCKET).upload(`${bizId}/sin-registro/x.png`, PNG, { contentType: "image/png" });
  must(error, "Storage aceptó un archivo sin registro pendiente.");
  must(!/^not found$/i.test(error.message), "Storage no respondió (¿falta el bucket o la API de Storage?).");
});

await step("Aislamiento: un usuario sin negocios no ve nada", async () => {
  if (!env.SMOKE_SECOND_EMAIL || !env.SMOKE_SECOND_PASSWORD) throw skip("define SMOKE_SECOND_EMAIL y SMOKE_SECOND_PASSWORD para probarlo");
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email: env.SMOKE_SECOND_EMAIL, password: env.SMOKE_SECOND_PASSWORD });
  if (error) throw new Error(error.message);
  const biz = await c.from("mkt_businesses").select("id").eq("id", bizId);
  const assets = await c.from("mkt_assets").select("id").eq("business_id", bizId);
  must(!biz.data?.length && !assets.data?.length, "El segundo usuario ve datos del negocio temporal.");
  if (imageAsset) {
    const dl = await c.storage.from(BUCKET).download(imageAsset.storagePath);
    must(dl.error, "El segundo usuario pudo descargar el archivo.");
  }
  const ins = await c.from("mkt_campaigns").insert({ business_id: bizId, name: "Intrusa" });
  must(ins.error, "El segundo usuario pudo escribir en el negocio temporal.");
  await c.auth.signOut();
});

await step("App desplegada: responde y protege las páginas privadas", async () => {
  if (!env.SMOKE_APP_URL) throw skip("define SMOKE_APP_URL (URL de Netlify) para probarlo");
  const base = env.SMOKE_APP_URL.replace(/\/$/, "");
  const login = await fetch(`${base}/login`);
  must(login.ok, `/login respondió ${login.status}`);
  const html = await login.text();
  must(/Marketing AI Studio/i.test(html), "/login no parece la app (no contiene «Marketing AI Studio»).");
  const priv = await fetch(`${base}/biblioteca`, { redirect: "manual" });
  must([302, 303, 307, 308].includes(priv.status), `/biblioteca sin sesión respondió ${priv.status} (esperado redirección a /login)`);
  const file = await fetch(`${base}/api/biblioteca/archivo/${imageAsset?.id ?? crypto.randomUUID()}`, { redirect: "manual" });
  must(file.status !== 200, "Un archivo se pudo descargar desde la app sin sesión.");
  return `${base} OK`;
});

// Limpieza: archivos primero (el borrado en cascada de la base no los quita).
await step("Limpieza: borrar archivos y negocio temporal", async () => {
  if (uploaded.length) {
    const { error } = await a.storage.from(BUCKET).remove(uploaded);
    if (error) throw new Error(`archivos: ${error.message}`);
  }
  if (bizId) {
    const { error } = await a.from("mkt_businesses").delete().eq("id", bizId);
    if (error) throw new Error(`negocio: ${error.message}`);
    const { data } = await a.from("mkt_businesses").select("id").eq("id", bizId);
    must(!data?.length, "El negocio temporal sigue existiendo.");
  }
});

finish();

function finish() {
  const fail = results.filter((r) => r.status === "fail").length;
  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log(`\nResultado: ${ok} correctas, ${fail} con fallo, ${skipped} omitidas.`);
  process.exit(fail ? 1 : 0);
}
