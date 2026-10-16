// Flujo real en navegador contra el stack local (npm run local:up && npm run local:seed && npm run build).
import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const PASSWORD = "Admin12345!";

function resetBusinesses() {
  execFileSync("psql", [
    "-X", "-q", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c",
    `delete from mkt_businesses where created_by = (select id from auth.users where email = '${EMAIL}')`,
  ]);
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
}

async function expectNoHorizontalScroll(page: Page) {
  // En emulación móvil innerWidth crece con el contenido: se compara con el ancho del dispositivo.
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe.configure({ mode: "serial" });

test("redirige a login sin sesión y rechaza credenciales incorrectas", async ({ page }) => {
  await page.goto("/negocios");
  await expect(page).toHaveURL(/\/login\?next=%2Fnegocios/);
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("incorrecta");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Correo o contraseña incorrectos.");
});

test("flujo completo: cargar negocios, editar Good Barber y revisar estado honesto", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = (name: string) =>
    page.screenshot({ path: `${process.env.PW_SHOTS ?? "test-results"}/${info.project.name}-${name}.png`, fullPage: true });

  resetBusinesses();
  await login(page);
  await expect(page.getByText("Todavía no hay negocios")).toBeVisible();
  await shot("01-inicio-vacio");

  await page.getByRole("button", { name: /Cargar Good Barber/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Negocios cargados" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Good Barber/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Glamour Studio/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /AFORE PRO/ }).first()).toBeVisible();
  await expect(page.getByText("Registrado · sin conexión").first()).toBeVisible();
  await expect(page.getByText("Aún no hay resultados medidos")).toBeVisible();
  await expect(page.getByRole("link", { name: /Good Barber Barbería 6 Servicios 2 Perfiles/ })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot("02-inicio");

  // Ficha de Good Barber: precios reales
  await page.getByRole("link", { name: /Good Barber/ }).first().click();
  await expect(page.getByRole("heading", { name: "Good Barber", level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Servicios y precios" }).click();
  const list = page.locator("ul").filter({ hasText: "Corte, barba y cejas" });
  for (const [name, price] of [["Corte", "$120"], ["Barba", "$50"], ["Cejas", "$30"], ["Corte y barba", "$170"], ["Corte y cejas", "$150"], ["Corte, barba y cejas", "$199"]]) {
    await expect(list.locator("summary").filter({ has: page.getByText(name, { exact: true }) })).toContainText(price);
  }
  await shot("03-servicios");

  // Agregar un servicio
  await page.locator("#name-new").fill("Diseño de barba");
  await page.locator("#price-new").fill("80");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("«Diseño de barba» agregado.");
  await expect(page.locator("summary").filter({ hasText: "Diseño de barba" })).toContainText("$80");

  // Precio inválido muestra error comprensible
  await page.locator("#name-new").fill("Algo");
  await page.locator("#price-new").fill("gratis");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText('Precio no válido: "gratis"')).toBeVisible();

  // Identidad de marca: colores reales de Good Barber y guardar tono
  await page.getByRole("link", { name: "Identidad de marca" }).click();
  await expect(page.locator("#color_primary")).toHaveValue("#D6A73A");
  await page.getByLabel("Tono de voz").fill("Cercano, seguro y con estilo de barrio premium.");
  await page.getByRole("button", { name: "Guardar identidad" }).click();
  await expect(page.getByRole("status")).toHaveText("Identidad de marca guardada.");
  await page.locator("#color_primary").fill("dorado");
  await page.getByRole("button", { name: "Guardar identidad" }).click();
  await expect(page.getByText("Usa un color hexadecimal como #C9A227")).toBeVisible();
  await shot("04-marca");

  // Redes: Instagram registrado pero NO conectado
  await page.getByRole("link", { name: "Redes sociales" }).click();
  await expect(page.getByText("Registrar no es conectar")).toBeVisible();
  await expect(page.getByText("· @good_barber_oficial")).toBeVisible();
  await expect(page.getByText("No crear otra página.")).toBeVisible();
  await expect(page.getByText("Conectado", { exact: true })).toHaveCount(0);
  // Conexión oficial con Meta: sin app de Meta configurada no se ofrece conectar.
  await expect(page.getByRole("heading", { name: /Conexión oficial con Meta/ })).toBeVisible();
  await expect(page.getByText(/Aún no disponible: falta configurar/)).toContainText("META_APP_ID");
  await expect(page.getByRole("link", { name: "Conectar con Meta" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await shot("04b-redes-meta");
  // Ni la ruta de inicio ni la de retorno marcan nada sin configuración / sin state válido.
  const redesUrl = page.url();
  const businessId = await page.evaluate(async (u) => {
    const html = await (await fetch(u)).text();
    return /negocio=([0-9a-f-]{36})/.exec(html)?.[1] ?? null;
  }, redesUrl);
  expect(businessId).toBeNull();
  await page.goto("/api/meta/retorno?code=x&state=falso");
  await expect(page).toHaveURL(/meta=sin-configurar/);
  await expect(page.getByText("No se conectó nada.")).toBeVisible();
  await page.goto(redesUrl);
  await expect(page.getByText("Conectado", { exact: true })).toHaveCount(0);
  // La ruta de publicación programada exige su secreto y no redirige a /login.
  const cron = await page.request.post("/api/meta/publicar-programadas", { maxRedirects: 0 });
  expect(cron.status()).toBe(401);
  const cronForged = await page.request.post("/api/meta/publicar-programadas", { maxRedirects: 0, headers: { authorization: "Bearer cualquier-cosa-de-mas-de-24-caracteres" } });
  expect(cronForged.status()).toBe(401);

  // Historial de auditoría
  await page.getByRole("link", { name: "Historial" }).click();
  await expect(page.getByText("Diseño de barba").first()).toBeVisible();

  // Configuración: regla de $0 y proveedores bloqueados
  await page.goto("/configuracion");
  await expect(page.getByText("$0 MXN").first()).toBeVisible();
  await expect(page.getByText("Bloqueado", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Suscripción ≠ API")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot("05-configuracion");

  // Prospectos y resultados: registro, importación CSV y aislamiento por negocio
  await page.goto("/mensajes?negocio=good-barber");
  await expect(page.getByText("La app no lee tus bandejas")).toBeVisible();
  await page.locator("#lead-contact_name").fill("Cliente de prueba");
  await page.locator("#lead-status").selectOption("customer");
  await page.locator("#lead-value").fill("$170");
  await page.getByRole("button", { name: "Registrar prospecto" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Prospecto registrado." })).toBeVisible();
  await page.getByLabel("Archivo CSV").setInputFiles({
    name: "prospectos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("fecha;nombre;origen;estado;monto\n16/10/2026;Ana;WhatsApp;cita;\n16/10/2026;Luis;Instagram;cliente;$120\n"),
  });
  await page.getByRole("button", { name: "Importar CSV" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 prospecto(s) importados." })).toBeVisible();
  await expect(page.getByText("$290", { exact: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/mensajes?negocio=glamour-studio");
  await expect(page.getByText("Sin prospectos registrados")).toBeVisible();

  // Analíticas con datos reales y sin alcance inventado
  await page.goto("/analiticas?negocio=good-barber");
  await expect(page.getByText("Ventas registradas")).toBeVisible();
  await expect(page.getByText("$290", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Alcance e interacciones: pendiente")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Un negocio inexistente (o ajeno) muestra «No encontrado» sin datos. Con
  // streaming, Next.js puede responder 200 antes de saber que es 404.
  await page.goto("/negocios/no-existe");
  await expect(page.getByRole("heading", { name: "No encontrado" })).toBeVisible();

  expect(errors.filter((e) => !e.includes("404"))).toEqual([]);
});

test("navegación móvil y cierre de sesión", async ({ page, isMobile }) => {
  await login(page);
  if (isMobile) {
    const bottomNav = page.locator("nav[aria-label='Principal']").last();
    await expect(bottomNav).toBeVisible();
    await bottomNav.getByRole("button", { name: "Más" }).click();
    await page.locator("#menu-mas").getByRole("link", { name: "Configuración" }).click();
    await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();
    await bottomNav.getByRole("button", { name: "Más" }).click();
    await page.locator("#menu-mas").getByRole("button", { name: "Cerrar sesión" }).click();
  } else {
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
  }
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
