// Privilegios y aislamiento con los permisos POR DEFECTO de Supabase real
// (roles.sql los replica). Ejecuta el mismo script que se corrió contra el
// proyecto Supabase real: scripts/remote/rls-check.sql. Requiere npm run local:up.
import { execFileSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { API_URL } from "../../scripts/local-supabase/stack.mjs";

const reachable = await fetch(`${API_URL}/auth/v1/health`)
  .then((r) => r.ok)
  .catch(() => false);
const PSQL = ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres"];
const sql = (q: string) => execFileSync("psql", [...PSQL, "-c", q], { encoding: "utf8" }).trim();

describe.skipIf(!reachable)("privilegios endurecidos (como en Supabase real)", () => {
  it("rls-check.sql pasa todas las comprobaciones y no deja rastro", () => {
    const r = spawnSync("psql", [...PSQL, "-f", "scripts/remote/rls-check.sql"], { encoding: "utf8" });
    expect(r.stderr).toMatch(/RLS-CHECK ok=18 fail=0/);
    // Otras pruebas crean usuarios en paralelo: se comprueban solo los del script.
    expect(sql("select count(*) from auth.users where email like 'rls-check-%'")).toBe("0");
  });

  it("authenticated no tiene TRUNCATE/REFERENCES/TRIGGER ni anon acceso a tablas mkt_", () => {
    expect(
      sql(`select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and table_name like 'mkt\\_%'
             and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')))`),
    ).toBe("0");
  });

  it("las tablas de solo lectura no admiten escritura directa", () => {
    expect(
      sql(`select count(*) from information_schema.role_table_grants
           where table_schema = 'public' and grantee = 'authenticated'
             and table_name in ('mkt_admins', 'mkt_audit_log', 'mkt_publish_attempts') and privilege_type <> 'SELECT'`),
    ).toBe("0");
  });

  it("anon no ejecuta funciones mkt_ y nadie ejecuta las de trigger", () => {
    expect(
      sql(`select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'mkt\\_%'
             and (has_function_privilege('anon', p.oid, 'execute')
                  or (p.prorettype = 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')))`),
    ).toBe("0");
  });

  it("detecta la regresión si vuelven los privilegios por defecto", () => {
    const r = spawnSync("psql", [...PSQL], {
      encoding: "utf8",
      input: "begin;\ngrant truncate on mkt_ai_usage to authenticated;\n\\i scripts/remote/rls-check.sql\nrollback;\n",
    });
    expect(r.stderr).toMatch(/RLS-CHECK ok=17 fail=1 \| authenticated pudo hacer TRUNCATE/);
  });
});
