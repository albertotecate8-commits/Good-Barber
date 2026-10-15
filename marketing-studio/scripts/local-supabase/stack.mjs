#!/usr/bin/env node
// Stack local de Supabase sin Docker: Postgres + Supabase Auth + PostgREST + proxy.
// Uso: node scripts/local-supabase/stack.mjs up|down|seed|env
// Solo para desarrollo/pruebas en Linux x86_64. Ver README.md de esta carpeta.
import { spawn, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HOME = path.join(ROOT, ".local-supabase");
const BIN = path.join(HOME, "bin");
// Como root, Postgres corre con el usuario "postgres", que no siempre puede
// entrar a la carpeta del proyecto: en ese caso los datos van a /var/lib.
const IS_ROOT = process.getuid?.() === 0;
const PGDATA = process.env.LOCAL_PGDATA || (IS_ROOT ? "/var/lib/postgresql/mkt-local" : path.join(HOME, "pgdata"));
const LOGS = path.join(HOME, "logs");
const PG_PORT = 54322;
const API_PORT = 54321;
const AUTH_PORT = 54329;
const REST_PORT = 54328;
const JWT_SECRET = "local-only-jwt-secret-with-at-least-32-characters";
const AUTH_VERSION = "v2.180.0";
const POSTGREST_VERSION = "v12.2.3";

const b64url = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
function signJwt(payload) {
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url(payload);
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const exp = Math.floor(Date.UTC(2035, 0, 1) / 1000);
export const ANON_KEY = signJwt({ iss: "supabase-local", role: "anon", iat: 1700000000, exp });
export const SERVICE_KEY = signJwt({ iss: "supabase-local", role: "service_role", iat: 1700000000, exp });
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const DB_URL = `postgres://postgres@127.0.0.1:${PG_PORT}/postgres`;

function pgBinDir() {
  for (const v of ["17", "16", "15", "14"]) {
    const d = `/usr/lib/postgresql/${v}/bin`;
    if (fs.existsSync(path.join(d, "initdb"))) return d;
  }
  throw new Error("No se encontró PostgreSQL (initdb). Instala postgresql.");
}

function asPg(cmd, args) {
  if (!IS_ROOT) return execFileSync(cmd, args, { stdio: "inherit" });
  const quoted = [cmd, ...args].map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(" ");
  return execFileSync("su", ["postgres", "-s", "/bin/sh", "-c", quoted], { stdio: "inherit" });
}

function download() {
  fs.mkdirSync(BIN, { recursive: true });
  if (!fs.existsSync(path.join(BIN, "postgrest"))) {
    const url = `https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x64.tar.xz`;
    console.log("Descargando PostgREST…");
    execFileSync("sh", ["-c", `curl -fsSL '${url}' | tar -xJ -C '${BIN}'`], { stdio: "inherit" });
  }
  if (!fs.existsSync(path.join(BIN, "auth"))) {
    const url = `https://github.com/supabase/auth/releases/download/${AUTH_VERSION}/auth-${AUTH_VERSION}-x86.tar.gz`;
    console.log("Descargando Supabase Auth…");
    execFileSync("sh", ["-c", `curl -fsSL '${url}' | tar -xz -C '${BIN}'`], { stdio: "inherit" });
  }
}

function psql(sqlOrFile, { file = false } = {}) {
  const args = ["-X", "-h", "127.0.0.1", "-p", String(PG_PORT), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", "set client_min_messages = warning"];
  args.push(file ? "-f" : "-c", sqlOrFile);
  execFileSync("psql", args, { stdio: ["ignore", "ignore", "inherit"] });
}

function startDetached(name, cmd, args, env = {}) {
  fs.mkdirSync(LOGS, { recursive: true });
  const out = fs.openSync(path.join(LOGS, `${name}.log`), "a");
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, detached: true, stdio: ["ignore", out, out] });
  child.unref();
  fs.writeFileSync(path.join(HOME, `${name}.pid`), String(child.pid));
}

async function waitFor(url, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label} no respondió (${url}). Revisa ${LOGS}`);
}

async function up() {
  download();
  const pg = pgBinDir();
  fs.mkdirSync(HOME, { recursive: true });
  if (IS_ROOT) {
    fs.mkdirSync(PGDATA, { recursive: true });
    execFileSync("chown", ["-R", "postgres", PGDATA]);
  }
  if (!fs.existsSync(path.join(PGDATA, "PG_VERSION"))) {
    asPg(`${pg}/initdb`, ["-D", PGDATA, "-U", "postgres", "--auth=trust", "-E", "UTF8"]);
  }
  try {
    asPg(`${pg}/pg_ctl`, ["-D", PGDATA, "status"]);
  } catch {
    asPg(`${pg}/pg_ctl`, ["-D", PGDATA, "-o", `-p ${PG_PORT} -k /tmp -c listen_addresses=127.0.0.1`, "-l", path.join(PGDATA, "..", "mkt-local-postgres.log"), "-w", "start"]);
  }
  psql(path.join(ROOT, "scripts/local-supabase/roles.sql"), { file: true });
  psql(path.join(ROOT, "scripts/local-supabase/storage-mock.sql"), { file: true });

  startDetached("auth", path.join(BIN, "auth"), [], {
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(AUTH_PORT),
    API_EXTERNAL_URL: `${API_URL}/auth/v1`,
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `postgres://supabase_auth_admin:postgres@127.0.0.1:${PG_PORT}/postgres?search_path=auth&sslmode=disable`,
    GOTRUE_DB_MIGRATIONS_PATH: path.join(BIN, "migrations"),
    GOTRUE_SITE_URL: "http://localhost:3000",
    GOTRUE_URI_ALLOW_LIST: "http://localhost:3000/**",
    GOTRUE_JWT_SECRET: JWT_SECRET,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DISABLE_SIGNUP: "true",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_LOG_LEVEL: "warn",
  });
  await waitFor(`http://127.0.0.1:${AUTH_PORT}/health`, "Supabase Auth");

  for (const f of fs.readdirSync(path.join(ROOT, "supabase/migrations")).sort()) {
    if (f.endsWith(".sql")) psql(path.join(ROOT, "supabase/migrations", f), { file: true });
  }

  startDetached("rest", path.join(BIN, "postgrest"), [], {
    PGRST_DB_URI: `postgres://authenticator:postgres@127.0.0.1:${PG_PORT}/postgres`,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: JWT_SECRET,
    PGRST_SERVER_HOST: "127.0.0.1",
    PGRST_SERVER_PORT: String(REST_PORT),
  });
  await waitFor(`http://127.0.0.1:${REST_PORT}/`, "PostgREST");
  // PostgREST cachea el esquema: se le avisa tras aplicar migraciones.
  psql("notify pgrst, 'reload schema'");

  startDetached("proxy", process.execPath, [fileURLToPath(import.meta.url), "proxy"]);
  await waitFor(`${API_URL}/auth/v1/health`, "Proxy");
  console.log(`\nStack local listo en ${API_URL}`);
  printEnv();
}

function stop(name) {
  const f = path.join(HOME, `${name}.pid`);
  if (!fs.existsSync(f)) return;
  try { process.kill(Number(fs.readFileSync(f, "utf8")), "SIGTERM"); } catch {}
  fs.rmSync(f);
}

function down() {
  for (const n of ["proxy", "rest", "auth"]) stop(n);
  if (fs.existsSync(path.join(PGDATA, "PG_VERSION"))) {
    try { asPg(`${pgBinDir()}/pg_ctl`, ["-D", PGDATA, "-m", "fast", "stop"]); } catch {}
  }
  console.log("Stack local detenido.");
}

function proxy() {
  http
    .createServer((req, res) => {
      const route = req.url.startsWith("/auth/v1") ? [AUTH_PORT, "/auth/v1"]
        : req.url.startsWith("/rest/v1") ? [REST_PORT, "/rest/v1"] : null;
      if (!route) { res.writeHead(404).end("not found"); return; }
      const headers = { ...req.headers, host: `127.0.0.1:${route[0]}` };
      const upstream = http.request(
        { host: "127.0.0.1", port: route[0], method: req.method, path: req.url.slice(route[1].length) || "/", headers },
        (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
      );
      upstream.on("error", (e) => { res.writeHead(502).end(String(e)); });
      req.pipe(upstream);
    })
    .listen(API_PORT, "127.0.0.1");
}

export async function seed({ email = "admin@local.test", password = "Admin12345!" } = {}) {
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json();
  if (!r.ok && !/already/i.test(JSON.stringify(body))) throw new Error(JSON.stringify(body));
  psql(`insert into mkt_admins (user_id) select id from auth.users where email = '${email.replace(/'/g, "''")}' on conflict do nothing`);
  console.log(`Administrador local: ${email} / ${password}`);
}

function printEnv() {
  console.log(`\n# .env.local para el stack local\nNEXT_PUBLIC_SUPABASE_URL=${API_URL}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const cmd = isMain ? process.argv[2] : undefined;
if (cmd === "up") await up();
else if (cmd === "down") down();
else if (cmd === "seed") await seed();
else if (cmd === "env") printEnv();
else if (cmd === "keys") console.log(JSON.stringify({ API_URL, ANON_KEY, SERVICE_KEY }));
else if (cmd === "proxy") proxy();
else if (cmd) { console.error("Uso: stack.mjs up|down|seed|env"); process.exit(1); }
