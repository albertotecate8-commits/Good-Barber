#!/usr/bin/env node
/**
 * Pruebas REALES contra el proyecto de Supabase de Smart Business Vision.
 *
 * Usa solo la URL y la clave publishable (las mismas del frontend). Las
 * contraseñas se leen de ARCHIVOS locales (nunca del repositorio):
 *
 *   VISION_OWNER_EMAIL=...            correo del propietario
 *   VISION_OWNER_PASSWORD_FILE=...    archivo con su contraseña
 *   VISION_TEST_EMAIL=...             (opcional) cuenta temporal SIN membresía
 *   VISION_TEST_PASSWORD_FILE=...     (opcional) archivo con su contraseña
 *
 * Uso (desde vision/, con .env.local configurado):
 *   node --env-file=.env.local scripts/prueba-supabase-real.mjs
 *
 * Crea y borra una estación de prueba; si hay cuenta temporal, le da acceso
 * de solo lectura y se lo quita al final. No deja datos de prueba.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "vision";
if (!URL || !KEY) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (KEY.startsWith("sb_secret_")) throw new Error("Nunca uses una clave secreta para estas pruebas");

const read = (f) => (f ? readFileSync(f, "utf8").trim() : null);
const OWNER_EMAIL = process.env.VISION_OWNER_EMAIL;
const OWNER_PW = read(process.env.VISION_OWNER_PASSWORD_FILE);
const TEST_EMAIL = process.env.VISION_TEST_EMAIL;
const TEST_PW = read(process.env.VISION_TEST_PASSWORD_FILE);

const client = () =>
  createClient(URL, KEY, { db: { schema: SCHEMA }, auth: { persistSession: false, autoRefreshToken: false } });

let fallos = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const mal = (m) => { fallos++; console.log(`  ✘ ${m}`); };
const espera = (cond, bien, malo) => (cond ? ok(bien) : mal(malo ?? bien));
const denegado = (error) => !!error && (error.code === "42501" || /permission denied|row-level security/i.test(error.message));

console.log(`Proyecto: ${new globalThis.URL(URL).host} · esquema ${SCHEMA}`);

// ---------------------------------------------------------------- anónimo
console.log("1) Visitante sin sesión");
{
  const sb = client();
  const { error } = await sb.from("businesses").select("name");
  espera(denegado(error), "no puede leer negocios", `leyó negocios (${error?.message ?? "sin error"})`);
  const r = await sb.rpc("my_memberships");
  espera(denegado(r.error), "no puede ejecutar funciones de la app", "ejecutó my_memberships");
  const s = await sb.auth.signUp({ email: `registro-publico-${Date.now()}@example.com`, password: "Registro-Publico-123456" });
  espera(!!s.error, `el registro público está bloqueado (${s.error?.message})`, "el registro público creó una cuenta");
  const w = await sb.auth.signInWithPassword({ email: OWNER_EMAIL, password: "contraseña-incorrecta-123" });
  espera(!!w.error && /invalid login credentials/i.test(w.error.message), "contraseña incorrecta rechazada", `respuesta inesperada: ${w.error?.message}`);
}

// ---------------------------------------------------------------- propietario
console.log("2) Propietario");
const owner = client();
let siteId = null;
let gbId = null;
{
  const { data, error } = await owner.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PW });
  if (error) { mal(`inicio de sesión: ${error.message}`); process.exit(1); }
  ok(`inicio de sesión real correcto (${data.user.email})`);
  const m = await owner.rpc("my_memberships");
  espera(!m.error && m.data?.[0]?.role === "owner", `rol: ${m.data?.[0]?.role} · ${m.data?.[0]?.site_name} · ${m.data?.[0]?.timezone}`, `membresía: ${m.error?.message}`);
  siteId = m.data?.[0]?.site_id;
  const b = await owner.from("businesses").select("id, slug, name, hours_confirmed").order("sort_order");
  espera(!b.error && b.data.length === 2, `negocios desde la base real: ${b.data?.map((x) => `${x.name} (${x.hours_confirmed ? "horario confirmado" : "horario pendiente"})`).join(", ")}`, `negocios: ${b.error?.message}`);
  gbId = b.data?.find((x) => x.slug === "good-barber")?.id;
  const h = await owner.from("business_hours").select("weekday").eq("business_id", gbId);
  espera(!h.error && h.data.length === 7, "horario de Good Barber: 7 días", `horario: ${h.error?.message ?? h.data?.length}`);
  const c = await owner.from("camera_overview").select("id, business_id, name, health_status");
  espera(!c.error && c.data.length === 2 && c.data.every((x) => x.health_status === null), `cámaras: ${c.data?.map((x) => x.name).join(", ")} (sin probar)`, `cámaras: ${c.error?.message}`);
  const e = await owner.from("engine_nodes").select("id");
  espera(!e.error && e.data.length === 0, "motor de visión: sin latidos (pendiente, no se inventa)", `engine_nodes: ${e.error?.message}`);
  const t = await owner.from("traffic_daily").select("*");
  espera(!t.error && t.data.length === 0, "métricas: 0 filas (sin datos inventados)", `traffic_daily: ${t.error?.message}`);
  const lm = await owner.rpc("list_members", { p_site: siteId });
  espera(!lm.error && lm.data.length >= 1, `usuarios con acceso: ${lm.data?.length}`, `list_members: ${lm.error?.message}`);

  const ins = await owner.from("stations").insert({ business_id: gbId, name: "Prueba temporal API", kind: "otro" }).select("id").single();
  espera(!ins.error, "puede crear una estación (configuración)", `crear estación: ${ins.error?.message}`);
  if (ins.data?.id) {
    const del = await owner.from("stations").delete().eq("id", ins.data.id).select("id");
    espera(!del.error && del.data.length === 1, "y borrarla (limpieza)", `borrar estación: ${del.error?.message}`);
  }
  const cam = c.data?.find((x) => x.business_id === gbId);
  const met = await owner.from("traffic_hourly").insert({ camera_id: cam?.id, business_id: gbId, hour_start: "2026-11-27T20:00:00Z", entries: 99, observed_seconds: 3600 });
  espera(denegado(met.error), "no puede escribir métricas del motor", `escribió métricas: ${met.error?.message}`);
  const boot = await owner.rpc("bootstrap_owner", { p_email: OWNER_EMAIL });
  espera(!!boot.error, "no puede ejecutar bootstrap_owner desde la API", "ejecutó bootstrap_owner");
}

// ---------------------------------------------------------------- cuenta ajena
if (TEST_EMAIL && TEST_PW) {
  console.log("3) Cuenta sin membresía");
  const ajena = client();
  const { error } = await ajena.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PW });
  if (error) { mal(`inicio de sesión de prueba: ${error.message}`); } else {
    ok("inicio de sesión de la cuenta de prueba");
    const m = await ajena.rpc("my_memberships");
    espera(!m.error && m.data.length === 0, "no tiene membresía", `membresía: ${JSON.stringify(m.data ?? m.error)}`);
    const b = await ajena.from("businesses").select("id");
    espera(!b.error && b.data.length === 0, "ve 0 negocios", `ve ${b.data?.length} negocios`);
    const self = await ajena.from("members").insert({ site_id: siteId, user_id: (await ajena.auth.getUser()).data.user.id, role: "owner" });
    espera(denegado(self.error), "no puede autoasignarse propietario", `autoasignación: ${self.error?.message ?? "permitida"}`);
    const add = await ajena.rpc("add_member_by_email", { p_site: siteId, p_email: TEST_EMAIL, p_role: "owner" });
    espera(denegado(add.error), "no puede usar add_member_by_email", "usó add_member_by_email");

    console.log("4) La misma cuenta con rol de solo lectura");
    const give = await owner.rpc("add_member_by_email", { p_site: siteId, p_email: TEST_EMAIL, p_role: "viewer", p_display_name: "Prueba temporal" });
    espera(!give.error, "el propietario le da acceso de solo lectura", `dar acceso: ${give.error?.message}`);
    const b2 = await ajena.from("businesses").select("name");
    espera(!b2.error && b2.data.length === 2, "ahora ve los 2 negocios", `ve ${b2.data?.length}`);
    const up = await ajena.from("businesses").update({ name: "Hackeado" }).eq("id", gbId).select("id");
    espera(!up.error && up.data.length === 0, "no puede editar negocios (0 filas)", `edición: ${up.error?.message ?? up.data?.length}`);
    const st = await ajena.from("stations").insert({ business_id: gbId, name: "Viewer" });
    espera(denegado(st.error), "no puede crear estaciones", `crear estación: ${st.error?.message ?? "permitido"}`);
    const uid = (await ajena.auth.getUser()).data.user.id;
    const rm = await owner.from("members").delete().eq("site_id", siteId).eq("user_id", uid).select("user_id");
    espera(!rm.error && rm.data.length === 1, "el propietario le quita el acceso (limpieza)", `quitar acceso: ${rm.error?.message}`);
    const b3 = await ajena.from("businesses").select("id");
    espera(!b3.error && b3.data.length === 0, "sin acceso vuelve a ver 0 negocios", `ve ${b3.data?.length}`);
    await ajena.auth.signOut();
  }
}

await owner.auth.signOut();
console.log(fallos === 0 ? "\nRESULTADO: todas las pruebas reales pasaron." : `\nRESULTADO: ${fallos} prueba(s) fallaron.`);
process.exit(fallos === 0 ? 0 : 1);
