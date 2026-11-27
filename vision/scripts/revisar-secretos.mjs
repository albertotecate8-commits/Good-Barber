#!/usr/bin/env node
/**
 * Revisa el sitio COMPILADO (por defecto `out/`) antes de publicarlo y
 * falla si encuentra cualquier credencial que no deba llegar al navegador:
 *   - claves `sb_secret_…` o JWT con role = service_role / supabase_admin
 *   - cadenas de conexión de PostgreSQL con contraseña
 *   - URLs RTSP con usuario/contraseña
 *   - llaves privadas PEM
 *   - archivos .env copiados al sitio
 *   - URLs de los proyectos de Good Barber o Finanzas
 * Lo único permitido es la URL del proyecto de Vision y su clave publishable.
 *
 *   Uso: node scripts/revisar-secretos.mjs out
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? "out";
const FORBIDDEN_URLS = [/https:\/\/sisgfnykjzovnaxylxyq\.supabase\.co/, /https:\/\/mwskrwkkiuifedatuvca\.supabase\.co/];
const TEXT = /\.(html|js|mjs|css|json|txt|webmanifest|map|xml|svg)$|(^|\/)_headers$|(^|\/)_redirects$/;

const problems = [];
const publishable = new Set();
const supabaseUrls = new Set();

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else check(p);
  }
}

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function check(file) {
  const rel = relative(root, file);
  if (/(^|\/)\.env/.test(rel)) problems.push(`${rel}: archivo .env dentro del sitio`);
  if (!TEXT.test(rel)) return;
  const s = readFileSync(file, "utf8");
  for (const m of s.matchAll(/sb_secret_[A-Za-z0-9_-]{8,}/g)) problems.push(`${rel}: clave secreta ${m[0].slice(0, 14)}…`);
  for (const m of s.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    const role = decodeJwtRole(m[0]);
    if (role && role !== "anon") problems.push(`${rel}: JWT con role=${role}`);
  }
  for (const m of s.matchAll(/postgres(?:ql)?:\/\/[^\s"'`:@/]+:[^\s"'`@/]+@/g)) problems.push(`${rel}: cadena de conexión con contraseña`);
  for (const m of s.matchAll(/rtsps?:\/\/[^\s"'`:@/]+:[^\s"'`@/]+@/g)) problems.push(`${rel}: URL RTSP con credenciales`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(s)) problems.push(`${rel}: llave privada PEM`);
  for (const re of FORBIDDEN_URLS) if (re.test(s)) problems.push(`${rel}: URL de un proyecto que no es de Vision (${re.source})`);
  for (const m of s.matchAll(/sb_publishable_[A-Za-z0-9_-]{8,}/g)) publishable.add(m[0]);
  for (const m of s.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)) supabaseUrls.add(m[1]);
}

walk(root);
console.log(`Revisión de secretos en ${root}/`);
console.log(`  proyectos Supabase referenciados: ${[...supabaseUrls].join(", ") || "ninguno"}`);
console.log(`  claves publishable: ${[...publishable].map((k) => k.slice(0, 18) + "…").join(", ") || "ninguna"}`);
if (problems.length) {
  console.error(`  ✘ ${problems.length} problema(s):`);
  for (const p of problems) console.error(`    - ${p}`);
  process.exit(1);
}
if (supabaseUrls.size > 1) {
  console.error("  ✘ el sitio apunta a más de un proyecto de Supabase");
  process.exit(1);
}
console.log("  ✔ sin claves secretas, service_role, contraseñas ni URLs de otros proyectos");
