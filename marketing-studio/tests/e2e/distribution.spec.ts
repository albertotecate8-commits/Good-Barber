// Distribución a grupos en navegador real. Facebook se intercepta: la prueba
// verifica a dónde se abriría, sin cargar ni publicar nada en Facebook.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const PASSWORD = "Admin12345!";

function psql(query: string) {
  return execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", query], {
    encoding: "utf8",
  }).trim();
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Inicio", level: 1 })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("distribución a grupos: alta, cola, abrir Facebook, confirmar, recargar, pausar y aislamiento", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const run = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  // Nada sale hacia Facebook: se registra la URL y se responde una página vacía.
  const opened: string[] = [];
  await context.route(/facebook\.com/, (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>facebook (simulado)</title>" });
  });

  const admin = psql(`select id from auth.users where email = '${EMAIL}'`);
  const gb = randomUUID();
  const gl = randomUUID();
  psql(`insert into mkt_businesses (id, name, slug, created_by) values ('${gb}', 'GB Grupos ${run}', 'gb-grupos-${run}', '${admin}'), ('${gl}', 'Glamour Grupos ${run}', 'gl-grupos-${run}', '${admin}')`);
  const content = randomUUID();
  const source = `https://www.facebook.com/goodbarber/posts/${Date.now()}`;
  psql(
    `insert into mkt_content_items (id, business_id, platform, title, caption, status, manual_posted_at, manual_post_url) values ('${content}', '${gb}', 'facebook_page', 'Promo grupos ${run}', 'Corte + barba $250', 'draft', now(), '${source}')`,
  );

  await login(page);
  await page.goto(`/distribucion?negocio=gb-grupos-${run}`);
  await expect(page.getByRole("heading", { name: "Distribución a grupos", level: 1 })).toBeVisible();

  // Dirección inválida: se rechaza con mensaje claro.
  await page.locator("#g-nuevo-name").fill("Grupo falso");
  await page.locator("#g-nuevo-url").fill("https://ejemplo.com/groups/x");
  await page.getByRole("button", { name: "Agregar grupo" }).click();
  await expect(page.getByText(/facebook\.com\/groups/).first()).toBeVisible();

  for (const name of ["Vecinos Durango", "Ofertas Durango", "Emprendedores Dgo"]) {
    await page.locator("#g-nuevo-name").fill(name);
    await page.locator("#g-nuevo-url").fill(`https://m.facebook.com/groups/${name.toLowerCase().replace(/\W+/g, "")}${run.replace(/\W/g, "")}?ref=share`);
    await page.getByRole("button", { name: "Agregar grupo" }).click();
    await expect(page.locator("summary", { hasText: name })).toBeVisible();
  }
  // La URL quedó normalizada (sin parámetros, www).
  expect(psql(`select count(*) from mkt_fb_groups where business_id = '${gb}' and url like 'https://www.facebook.com/groups/%/' and url not like '%?%'`)).toBe("3");

  // Publicación lista → elegir solo 2 de los 3 grupos.
  await page.getByRole("link", { name: "Distribuir a grupos" }).first().click();
  await expect(page.getByRole("heading", { name: "Distribuir a grupos", level: 1 })).toBeVisible();
  await page.getByLabel(/Vecinos Durango/).check();
  await page.getByLabel(/Ofertas Durango/).check();
  await page.getByRole("button", { name: "Crear cola de distribución" }).click();
  await expect(page.getByRole("heading", { name: "Cola de distribución", level: 1 })).toBeVisible();
  expect(psql(`select string_agg(g.name, ',' order by t.position) from mkt_distribution_tasks t join mkt_fb_groups g on g.id = t.group_id where t.content_id = '${content}'`)).toBe(
    "Vecinos Durango,Ofertas Durango",
  );

  // Siguiente grupo y apertura del diálogo oficial de Facebook.
  await expect(page.getByText("Siguiente grupo: Vecinos Durango")).toBeVisible();
  await expect(page.getByRole("button", { name: /Copiar/ }).first()).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: /Compartir la publicación original/ }).click();
  const popup = await popupPromise;
  await expect.poll(() => opened.length).toBeGreaterThan(0);
  const shareTarget = new URL(opened[0]);
  expect(["/sharer/sharer.php", "/dialog/share"]).toContain(shareTarget.pathname);
  expect(shareTarget.searchParams.get("u") ?? shareTarget.searchParams.get("href")).toBe(source);
  await popup.close();
  await expect(page.getByText("Abierto en Facebook (sin confirmar)")).toBeVisible();
  expect(psql(`select status from mkt_distribution_tasks t join mkt_fb_groups g on g.id = t.group_id where t.content_id = '${content}' and g.name = 'Vecinos Durango'`)).toBe("opened");

  // Confirmación explícita de la persona, con enlace del grupo.
  await page.getByPlaceholder("Enlace de la publicación en el grupo (opcional)").fill("https://www.facebook.com/groups/vecinos/posts/1");
  await page.getByRole("button", { name: "2. Confirmar: ya se publicó" }).click();
  await expect(page.getByText("Siguiente grupo: Ofertas Durango")).toBeVisible();

  // Recargar: el progreso sigue ahí y no se repite el grupo confirmado.
  await page.reload();
  await expect(page.getByText("Siguiente grupo: Ofertas Durango")).toBeVisible();
  await expect(page.getByText("Confirmado como publicado")).toBeVisible();
  expect(psql(`select confirmed_by from mkt_distribution_tasks t join mkt_fb_groups g on g.id = t.group_id where t.content_id = '${content}' and g.name = 'Vecinos Durango'`)).toBe(admin);

  // Pausar oculta el siguiente paso; continuar lo devuelve; cancelar cierra lo pendiente.
  await page.getByRole("button", { name: "Pausar" }).click();
  await expect(page.getByText("La distribución no está activa.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Siguiente grupo: Ofertas Durango")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar pendientes" }).click();
  await expect(page.getByText("La distribución no está activa.")).toBeVisible();
  expect(psql(`select string_agg(t.status, ',' order by t.position) from mkt_distribution_tasks t where t.content_id = '${content}'`)).toBe("confirmed,cancelled");

  // Volver a distribuir: el grupo ya usado no se repite para esta publicación.
  await page.goto(`/distribucion/nueva?contenido=${content}`);
  await expect(page.getByLabel(/Vecinos Durango/)).toBeDisabled();

  // Ficha de la publicación: botón «Distribuir a grupos» porque ya tiene enlace.
  await page.goto(`/calendario/${content}`);
  await expect(page.getByText("Enlace y distribución a grupos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Distribuir a grupos" })).toHaveAttribute("href", `/distribucion/nueva?contenido=${content}`);

  // Publicación aún sin publicar: se planean los grupos y quedan guardados (solo los elegidos).
  const planned = randomUUID();
  psql(`insert into mkt_content_items (id, business_id, platform, title, caption, status) values ('${planned}', '${gb}', 'facebook_page', 'Plan ${run}', 'Promo', 'draft')`);
  await page.goto(`/calendario/${planned}`);
  await page.getByLabel(/Ofertas Durango/).check();
  await page.getByLabel(/Emprendedores Dgo/).check();
  await page.getByRole("button", { name: "Guardar grupos planeados" }).click();
  await expect(page.getByText(/2 grupo\(s\) planeados/)).toBeVisible();
  expect(psql(`select string_agg(g.name, ',' order by g.name) from mkt_content_items c join mkt_fb_groups g on g.id = any(c.planned_group_ids) where c.id = '${planned}'`)).toBe(
    "Emprendedores Dgo,Ofertas Durango",
  );
  expect(psql(`select count(*) from mkt_distributions where content_id = '${planned}'`)).toBe("0");

  // Aislamiento: Glamour no ve los grupos de Good Barber.
  await page.goto(`/distribucion?negocio=gl-grupos-${run}`);
  await expect(page.getByText("Sin grupos registrados")).toBeVisible();
  await expect(page.getByText("Vecinos Durango")).toHaveCount(0);

  // Ningún destino se abrió aparte del diálogo para compartir.
  expect(opened.every((u) => /facebook\.com\/(sharer\/sharer\.php|dialog\/share)/.test(u))).toBe(true);
  expect(errors).toEqual([]);
  psql(`delete from mkt_businesses where id in ('${gb}', '${gl}')`);
});
