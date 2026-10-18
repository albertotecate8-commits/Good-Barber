// Asistente «Crear anuncio» en navegador real: flujo completo, recuperación
// tras recargar, confirmación al cambiar de negocio, aviso de precios y
// guardado en el calendario (sin publicar nada).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const psql = (q: string) =>
  execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("Admin12345!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Crear", level: 1 })).toBeAttached();
}

const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(Date.now() + 2 * 86400_000));

test.describe.configure({ mode: "serial" });

test("crear anuncio: pasos, vista previa, recuperación, confirmaciones y guardado", async ({ page }, info) => {
  test.setTimeout(120_000);
  const run = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const admin = psql(`select id from auth.users where email = '${EMAIL}'`);
  const a = randomUUID();
  const b = randomUUID();
  psql(
    `insert into mkt_businesses (id, name, slug, sector, city, created_by) values ('${a}', 'AA Barber ${run}', 'aa-barber-${run}', 'Barbería', 'Durango, Dgo.', '${admin}'), ('${b}', 'AB Uñas ${run}', 'ab-unas-${run}', 'Salón de uñas', 'Durango', '${admin}')`,
  );
  psql(`insert into mkt_offerings (business_id, name, kind, price_cents, active) values ('${a}', 'Corte de cabello', 'service', 12000, true)`);
  psql(`insert into mkt_social_accounts (business_id, platform, handle) values ('${a}', 'instagram', 'aa_${run.replace(/\W/g, "")}'), ('${a}', 'facebook_page', 'AA Barber')`);

  await login(page);
  // Negocio activo desde la barra superior (queda en la cookie).
  await page.goto("/resumen");
  await page.getByLabel("Negocio activo").selectOption({ label: `AA Barber ${run}` });
  await expect(page.getByRole("heading", { name: new RegExp(`Qué preparamos hoy para AA Barber ${run}`) })).toBeVisible();

  await page.goto("/anuncio/nuevo");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const next = page.getByRole("button", { name: "Siguiente" });
  await expect(page.getByRole("radio", { name: new RegExp(`AA Barber ${run}`) })).toBeChecked();
  await next.click();

  await page.getByText("Conseguir citas", { exact: true }).click();
  await next.click();
  await page.getByText("Corte de cabello", { exact: true }).click();
  await expect(page.getByText("$120").first()).toBeVisible();
  await next.click();

  // Recargar a mitad del flujo conserva el avance.
  await page.reload();
  await expect(page.getByText("Recuperamos el anuncio")).toBeVisible();
  await expect(page.getByRole("heading", { name: "¿En qué formato?" }).or(page.getByText("¿En qué formato?"))).toBeVisible();
  await page.getByText("Publicación", { exact: true }).first().click();
  await next.click();

  // Propuestas con el precio registrado y vista previa.
  await expect(next).toBeDisabled();
  await page.getByText("Corte de cabello $120").first().click();
  const preview = page.getByRole("complementary", { name: "Vista previa del anuncio" });
  await expect(preview.getByText("Corte de cabello $120")).toBeVisible();
  await page.getByRole("button", { name: "Otras propuestas" }).click();
  await expect(next).toBeDisabled();
  await page.locator("input[name=propuesta]").first().check({ force: true });

  // Cambiar de negocio con contenido preparado pide confirmación (y se puede cancelar).
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByRole("button", { name: "Atrás" }).click();
  await page.getByRole("button", { name: "Atrás" }).click();
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#contenido label", { hasText: `AB Uñas ${run}` }).click();
  await expect(page.getByRole("radio", { name: new RegExp(`AA Barber ${run}`) })).toBeChecked();
  for (let i = 0; i < 5; i++) await next.click();

  // Revisar: un precio que no existe se avisa.
  const text = page.getByLabel("Texto del anuncio");
  const original = await text.inputValue();
  await text.fill(`${original} Barba $99.`);
  await expect(page.getByText("Revisa los precios")).toBeVisible();
  await text.fill(original);
  await expect(page.getByText("Revisa los precios")).toHaveCount(0);
  await page.getByLabel("Titular").fill("Corte de cabello $120 en AA");
  await next.click();

  // Publicar: Instagram sin imagen no se puede programar (error del servidor, vuelve a «Contenido»).
  await page.locator("#contenido label", { hasText: /^Instagram/ }).click();
  await page.getByText("Programar", { exact: true }).click();
  await page.getByLabel("Fecha", { exact: true }).fill(tomorrow());
  await page.getByLabel("Hora (Ciudad de México)").fill("10:30");
  await expect(page.getByText(/Instagram exige una imagen o video para programar/)).toBeVisible();
  await page.getByRole("button", { name: "Programar publicación" }).click();
  await expect(page.getByText(/Instagram exige una imagen o un video/).first()).toBeVisible();
  for (let i = 0; i < 2; i++) await next.click();

  // Página de Facebook (registrada, sin conectar): queda programada en el calendario, sin publicar.
  await page.locator("#contenido label", { hasText: /^Página de Facebook/ }).click();
  await expect(page.getByText("Preparado no es publicado")).toBeVisible();
  await page.getByRole("button", { name: "Programar publicación" }).click();
  await expect(page).toHaveURL(/\/calendario\/[0-9a-f-]{36}\?guardado=1/);
  const id = page.url().match(/calendario\/([0-9a-f-]{36})/)![1];
  expect(psql(`select business_id || '|' || platform || '|' || format || '|' || status || '|' || publish_mode || '|' || title from mkt_content_items where id = '${id}'`)).toBe(
    `${a}|facebook_page|post|scheduled|manual|Corte de cabello $120 en AA`,
  );
  expect(psql(`select coalesce(external_post_id, 'null') || '|' || coalesce(approved_at::text, 'null') from mkt_content_items where id = '${id}'`)).toBe("null|null");
  // El borrador local se limpió.
  expect(await page.evaluate(() => localStorage.getItem("mkt-anuncio-en-curso-v1"))).toBeNull();

  // El resumen del negocio activo lo muestra como próxima publicación.
  await page.goto("/resumen");
  await expect(page.getByText("Corte de cabello $120 en AA")).toBeVisible();

  // El otro negocio no tiene servicios: el asistente lo dice y permite escribir la oferta.
  await page.goto("/anuncio/nuevo");
  await page.locator("#contenido label", { hasText: `AB Uñas ${run}` }).click();
  await next.click();
  await page.getByText("Atraer clientes nuevos", { exact: true }).click();
  await next.click();
  await expect(page.getByText(/aún no tiene servicios registrados/)).toBeVisible();
  await expect(page.getByText("Corte de cabello", { exact: true })).toHaveCount(0);

  expect(errors).toEqual([]);
  psql(`delete from mkt_businesses where id in ('${a}', '${b}')`);
});
