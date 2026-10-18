// Calendario + Biblioteca en navegador real, con almacenamiento local de
// desarrollo (MKT_STORAGE_BACKEND=local, lo fija playwright.config.ts).
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// Claves del stack LOCAL de pruebas (no son secretas fuera de esta máquina).
const { API_URL, SERVICE_KEY } = JSON.parse(
  execFileSync("node", ["scripts/local-supabase/stack.mjs", "keys"], { encoding: "utf8" }),
) as { API_URL: string; SERVICE_KEY: string };

const EMAIL = "admin@local.test";
const PASSWORD = "Admin12345!";

function psql(query: string) {
  return execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", query], {
    encoding: "utf8",
  }).trim();
}

// PNG real de 1x1 píxel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function cdmxDate(offsetDays: number) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(d);
}

async function login(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
}

async function noHorizontalScroll(page: Page) {
  const width = page.viewportSize()!.width;
  // En emulación móvil innerWidth crece con el contenido: se compara con el ancho del dispositivo.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.describe.configure({ mode: "serial" });

test("biblioteca y calendario: flujo completo", async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const shots = process.env.PW_SHOTS ?? "test-results";
  const shot = (n: string) => page.screenshot({ path: `${shots}/${info.project.name}-cal-${n}.png`, fullPage: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  // Estado inicial: los tres negocios, sin publicaciones ni recursos.
  psql(`delete from mkt_businesses where created_by = (select id from auth.users where email = '${EMAIL}')`);
  await login(page);
  await page.getByRole("button", { name: /Cargar Good Barber/ }).click();
  await expect(page.getByText("Negocios cargados")).toBeVisible();

  // ---------- Biblioteca: estados vacíos y aviso honesto ----------
  await page.goto("/biblioteca");
  await expect(page.getByText("Almacenamiento local de desarrollo")).toBeVisible();
  await expect(page.getByText("La biblioteca está vacía")).toBeVisible();

  // Subir una imagen real
  await page.getByLabel("Negocio", { exact: true }).first().selectOption({ label: "Good Barber" });
  await page.locator("#up-file").setInputFiles({ name: "promo-corte.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#up-title")).toHaveValue("promo-corte");
  await page.locator("#up-tags").fill("promoción, corte");
  await page.locator("#up-description").fill("Flyer del corte de $120");
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText("«promo-corte.png» se subió correctamente.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 recurso" })).toBeVisible();

  // Un archivo disfrazado se rechaza (los bytes no son PNG)
  await page.locator("#up-file").setInputFiles({ name: "virus.png", mimeType: "image/png", buffer: Buffer.from("MZ\x90\x00 no soy una imagen") });
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText("El contenido del archivo no corresponde a su tipo.")).toBeVisible();
  // Un tipo no permitido para «Imagen» se rechaza antes de subir
  await page.locator("#up-file").setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7") });
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText(/no se permite como «Imagen»/)).toBeVisible();
  // Documento PDF como «Documento» en AFORE PRO
  await page.getByLabel("Negocio", { exact: true }).first().selectOption({ label: "AFORE PRO" });
  await page.locator("#up-kind").selectOption("document");
  await page.locator("#up-file").setInputFiles({ name: "requisitos.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n%prueba") });
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText("«requisitos.pdf» se subió correctamente.")).toBeVisible();
  // El título siguió al archivo elegido (no se quedó el del intento fallido).
  expect(psql("select title from mkt_assets where original_name = 'requisitos.pdf'")).toBe("requisitos");
  await expect(page.getByRole("heading", { name: "2 recursos" })).toBeVisible();
  expect(psql("select count(*) from mkt_assets where upload_status = 'pending'")).toBe("0");

  // Filtros
  await page.getByLabel("Etiqueta", { exact: true }).fill("corte");
  await page.getByRole("button", { name: "Filtrar" }).click();
  await expect(page.getByRole("heading", { name: "1 recurso con estos filtros" })).toBeVisible();
  await page.goto("/biblioteca?tipo=document");
  await expect(page.getByRole("link", { name: /requisitos/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /promo-corte/ })).toHaveCount(0);
  await page.goto("/biblioteca?q=sin-coincidencias");
  await expect(page.getByText("Nada coincide con los filtros")).toBeVisible();
  await page.goto("/biblioteca");
  await noHorizontalScroll(page);
  await shot("01-biblioteca");

  // Detalle: vista previa, descarga y edición de etiquetas
  await page.getByRole("link", { name: /promo-corte/ }).click();
  await expect(page.getByRole("heading", { name: "promo-corte", level: 1 })).toBeVisible();
  const img = page.getByRole("img", { name: "promo-corte" });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  const assetId = page.url().split("/").pop()!;
  const dl = await page.request.get(`/api/biblioteca/archivo/${assetId}?descargar=1`);
  expect(dl.status()).toBe(200);
  expect(dl.headers()["content-disposition"]).toContain('attachment; filename="promo-corte.png"');
  expect(Buffer.from(await dl.body()).equals(PNG)).toBe(true);
  await page.getByLabel("Etiquetas").fill("promoción, corte, octubre");
  await page.getByRole("button", { name: "Guardar datos" }).click();
  await expect(page.getByText("Datos del recurso guardados.")).toBeVisible();
  await shot("02-recurso");

  // ---------- Calendario ----------
  await page.goto("/calendario");
  await expect(page.getByText("Programar no es publicar")).toBeVisible();
  await expect(page.getByText("No hay publicaciones sin fecha.")).toBeVisible();
  await page.getByRole("link", { name: "Nueva publicación", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nueva publicación" })).toBeVisible();

  const tomorrow = cdmxDate(1);
  await page.locator("#business_id").selectOption({ label: "Good Barber" });
  await page.locator("#platform").selectOption("instagram");
  await page.locator("#format").selectOption("post");
  await page.locator("#title").fill("Promo corte octubre");
  await page.locator("#caption").fill("Corte clásico por $120 en Good Barber.");
  await page.locator("#hashtags").fill("#barberia #Durango, fade");
  await page.locator("#date").fill(tomorrow);
  await page.locator("#time").fill("10:30");
  await page.locator("#status").selectOption("scheduled");
  // Sin recurso: Instagram lo exige al programar
  await page.getByRole("button", { name: "Guardar publicación" }).click();
  await expect(page.getByText(/Instagram exige una imagen o un video/)).toBeVisible();
  // Fecha pasada: no se puede programar
  await page.locator("#asset_id").selectOption({ label: "promo-corte · Imagen" });
  await page.locator("#date").fill(cdmxDate(-1));
  await page.getByRole("button", { name: "Guardar publicación" }).click();
  await expect(page.getByText("La fecha y hora programadas deben ser futuras.")).toBeVisible();
  // El recurso de AFORE PRO no aparece para Good Barber
  await expect(page.locator("#asset_id option", { hasText: "requisitos" })).toHaveCount(0);
  await page.locator("#date").fill(tomorrow);
  await page.getByRole("button", { name: "Guardar publicación" }).click();
  await expect(page.getByText("Publicación guardada.")).toBeVisible();
  await expect(page.getByText("Publicación manual", { exact: true })).toBeVisible();
  await expect(page.getByText(/la app no enviará nada a Instagram/)).toBeVisible();
  const contentId = page.url().split("/").pop()!.split("?")[0];
  expect(psql(`select scheduled_at at time zone 'America/Mexico_City' from mkt_content_items where id = '${contentId}'`)).toBe(`${tomorrow} 10:30:00`);
  expect(psql(`select array_to_string(hashtags, ' ') || '|' || status from mkt_content_items where id = '${contentId}'`)).toBe("barberia Durango fade|scheduled");
  await noHorizontalScroll(page);
  await shot("03-publicacion");

  // Editar: pasar a «En revisión»
  await page.locator("#status").selectOption("review");
  await page.locator("#caption").fill("Corte clásico por $120. ¡Agenda tu cita!");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Publicación guardada." }).last()).toBeVisible();
  expect(psql(`select status from mkt_content_items where id = '${contentId}'`)).toBe("review");

  // Registro de publicación manual (no cambia el estado)
  await page.locator("#manual_post_url").fill("http://inseguro.com");
  await page.getByRole("button", { name: "Ya la publiqué manualmente" }).click();
  await expect(page.getByText("El enlace debe empezar con https://")).toBeVisible();
  await page.locator("#manual_post_url").fill("https://www.instagram.com/p/ejemplo/");
  await page.getByRole("button", { name: "Ya la publiqué manualmente" }).click();
  await expect(page.getByText("Publicada a mano (declarado por ti)")).toBeVisible();
  expect(psql(`select status from mkt_content_items where id = '${contentId}'`)).toBe("review");

  // Vistas: mes, semana y próximas
  await page.goto(`/calendario?vista=mes&fecha=${tomorrow}`);
  if (info.project.name === "escritorio") {
    await expect(page.getByRole("link", { name: /Promo corte octubre/ }).first()).toBeVisible();
  } else {
    await expect(page.getByRole("region", { name: "Agenda del mes" }).getByText("Promo corte octubre")).toBeVisible();
  }
  await noHorizontalScroll(page);
  await shot("04-mes");
  await page.goto(`/calendario?vista=semana&fecha=${tomorrow}`);
  await expect(page.getByRole("link", { name: /Promo corte octubre/ })).toBeVisible();
  await noHorizontalScroll(page);
  await shot("05-semana");
  await page.goto("/calendario?vista=proximas");
  await expect(page.getByRole("link", { name: /Promo corte octubre/ })).toBeVisible();
  await noHorizontalScroll(page);
  // Filtros por negocio, plataforma y estado
  await page.goto("/calendario?vista=proximas&negocio=glamour-studio");
  await expect(page.getByText("No hay publicaciones próximas")).toBeVisible();
  await page.goto("/calendario?vista=proximas&plataforma=facebook_page");
  await expect(page.getByText("No hay publicaciones próximas")).toBeVisible();
  await page.goto("/calendario?vista=proximas&estado=review&negocio=good-barber");
  await expect(page.getByRole("link", { name: /Promo corte octubre/ })).toBeVisible();
  await page.goto(`/calendario?vista=proximas&hasta=${cdmxDate(0)}`);
  await expect(page.getByText("No hay publicaciones próximas")).toBeVisible();
  // El panel de inicio muestra las próximas del negocio activo (se elige en la barra superior)
  await page.goto("/");
  await page.getByLabel("Negocio activo").selectOption({ label: "Good Barber" });
  await expect(page.getByRole("link", { name: "Promo corte octubre" })).toBeVisible();

  // Duplicar y eliminar
  await page.goto(`/calendario/${contentId}`);
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByText("Copia creada como borrador.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Promo corte octubre (copia)" })).toBeVisible();
  const copyId = page.url().split("/").pop()!.split("?")[0];
  expect(copyId).not.toBe(contentId);
  expect(psql(`select status || '|' || coalesce(scheduled_at::text, 'sin fecha') from mkt_content_items where id = '${copyId}'`)).toBe("draft|sin fecha");
  await page.goto("/calendario");
  await expect(page.getByRole("link", { name: /Promo corte octubre \(copia\)/ })).toBeVisible();
  await page.goto(`/calendario/${copyId}`);
  await page.getByRole("button", { name: "Eliminar" }).click();
  await expect(page.getByText("Publicación eliminada.")).toBeVisible();
  expect(psql(`select count(*) from mkt_content_items where id = '${copyId}'`)).toBe("0");

  // ---------- Aislamiento por HTTP con otra cuenta ----------
  const otherEmail = `otro-${randomUUID().slice(0, 8)}@test.local`;
  const created = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password: PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  psql(`insert into mkt_admins (user_id) values ('${created.id}')`);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, otherEmail);
  expect((await otherPage.request.get(`/api/biblioteca/archivo/${assetId}`)).status()).toBe(404);
  expect((await otherPage.request.get(`/api/biblioteca/archivo/${assetId}?descargar=1`)).status()).toBe(404);
  await otherPage.goto(`/calendario/${contentId}`);
  await expect(otherPage.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  await otherPage.goto(`/biblioteca/${assetId}`);
  await expect(otherPage.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  await otherPage.goto("/biblioteca");
  await expect(otherPage.getByText("Primero agrega tus negocios")).toBeVisible();
  // Sin sesión tampoco hay archivo
  const anon = await browser.newContext();
  expect((await anon.request.get(`http://localhost:3100/api/biblioteca/archivo/${assetId}`, { maxRedirects: 0 })).status()).not.toBe(200);
  // Subir sin sesión al almacenamiento local: rechazado
  expect((await anon.request.put(`http://localhost:3100/api/biblioteca/local/${assetId}`, { data: PNG })).status()).toBe(401);
  await anon.close();
  await other.close();
  psql(`delete from auth.users where email = '${otherEmail}'`);

  // ---------- Eliminar el recurso: la publicación queda sin recurso ----------
  await page.goto(`/biblioteca/${assetId}`);
  await expect(page.getByText("1 publicación(es) quedarán sin recurso.")).toBeVisible();
  await page.getByRole("button", { name: "Eliminar recurso" }).click();
  await expect(page.getByText("Recurso eliminado.")).toBeVisible();
  expect(psql(`select coalesce(asset_id::text, 'null') from mkt_content_items where id = '${contentId}'`)).toBe("null");
  expect((await page.request.get(`/api/biblioteca/archivo/${assetId}`)).status()).toBe(404);

  expect(errors).toEqual([]);
});
