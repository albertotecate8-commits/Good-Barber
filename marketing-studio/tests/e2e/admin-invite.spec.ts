// Alta del primer administrador por correo preautorizado, en navegador real:
// la persona crea su cuenta (aquí, con la API de administración del stack
// local, como lo haría «Add user» en Supabase) e inicia sesión con su propia
// contraseña. Nadie más la conoce.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const { API_URL, SERVICE_KEY } = JSON.parse(execFileSync("node", ["scripts/local-supabase/stack.mjs", "keys"], { encoding: "utf8" })) as {
  API_URL: string;
  SERVICE_KEY: string;
};
const psql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

async function createUser(email: string, password: string) {
  const r = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!r.ok) throw new Error(await r.text());
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Crear", level: 1 })).toBeVisible();
}

test("correo preautorizado: inicia sesión y es administrador; uno no invitado es miembro sin permisos", async ({ page, browser }, info) => {
  const run = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const invited = `dueno-${run}@test.local`;
  const other = `otro-${run}@test.local`;
  const password = `Clave-${randomUUID()}`;
  psql(`insert into mkt_admin_invites (email) values ('${invited}')`);
  await createUser(invited, password);
  await createUser(other, password);

  await login(page, invited, password);
  await page.goto("/configuracion");
  await expect(page.getByText("Administrador", { exact: true })).toBeVisible();
  await page.goto("/negocios");
  await expect(page.getByRole("button", { name: /Cargar Good Barber/ })).toBeVisible();

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, other, password);
  await p2.goto("/configuracion");
  await expect(p2.getByText("Miembro", { exact: true })).toBeVisible();
  await p2.goto("/negocios");
  await expect(p2.getByRole("button", { name: /Cargar Good Barber/ })).toHaveCount(0);
  await ctx.close();

  psql(`delete from auth.users where email in ('${invited}', '${other}')`);
  psql(`delete from mkt_admin_invites where email = '${invited}'`);
});
