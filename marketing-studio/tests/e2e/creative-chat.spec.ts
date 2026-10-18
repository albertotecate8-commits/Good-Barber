// Chat creativo en navegador real (escritorio e iPhone): memoria por negocio,
// estilo creado desde una referencia y reutilizado («el estilo que guardamos
// la semana pasada»), ajustes por instrucciones, flujo asistido con ChatGPT
// (simulado: no sale nada a internet), importación, comparación, aprobación
// por destino sin publicar (Meta no está conectada) y aislamiento entre negocios.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const psql = (q: string) => execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

// Imágenes de prueba generadas con FFmpeg (no son de ningún negocio real).
const media = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-chat-"));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
ff("-f", "lavfi", "-i", "color=c=0x101010:s=1080x1350:d=1", "-vf", "drawbox=x=640:y=420:w=360:h=420:color=0xC9A227:t=fill", "-frames:v", "1", path.join(media, "referencia.png"));
ff("-f", "lavfi", "-i", "testsrc2=s=1080x1350:d=1", "-frames:v", "1", path.join(media, "chatgpt-1.png"));
ff("-f", "lavfi", "-i", "testsrc=s=1080x1350:d=1", "-frames:v", "1", path.join(media, "chatgpt-2.png"));
const SHOTS = process.env.MKT_SHOTS_DIR;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("Admin12345!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Crear", level: 1 })).toBeAttached();
}
async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
}
async function shot(page: Page, name: string, project: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${project}-${name}.png`), fullPage: false });
}
async function say(page: Page, text: string) {
  const before = await page.locator("ol > li").count();
  await page.getByLabel("Mensaje para el estudio").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect.poll(() => page.locator("ol > li").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 2);
  await expect(page.getByText(/Preparando propuestas/)).toHaveCount(0);
}

test.describe.configure({ mode: "serial" });

test("chat creativo: memoria, estilo reutilizado, ajustes, ChatGPT asistido, aprobación y aislamiento", async ({ page, context, isMobile }, info) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(15_000);
  const run = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // ChatGPT se simula: se registra la apertura y no se carga nada externo.
  const opened: string[] = [];
  await context.route(/chatgpt\.com/, (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<title>ChatGPT (simulado)</title>" });
  });

  const admin = psql(`select id from auth.users where email = '${EMAIL}'`);
  const gb = randomUUID();
  const gl = randomUUID();
  const GB = `GB Chat ${run}`;
  const GL = `GL Chat ${run}`;
  psql(`insert into mkt_businesses (id, name, slug, sector, city, created_by) values ('${gb}', '${GB}', 'gb-chat-${run}', 'Barbería', 'Durango, Dgo.', '${admin}'), ('${gl}', '${GL}', 'gl-chat-${run}', 'Salón de uñas', 'Durango', '${admin}')`);
  psql(`insert into mkt_offerings (business_id, name, kind, price_cents, active, sort_order) values ('${gb}', 'Corte de cabello', 'service', 12000, true, 1), ('${gb}', 'Corte + barba', 'service', 20000, true, 2), ('${gl}', 'Uñas acrílicas', 'service', 15000, true, 1)`);
  psql(`insert into mkt_brand_profiles (business_id, color_primary, color_secondary, color_accent, color_background, font_heading, tone_of_voice) values ('${gb}', '#C9A227', '#1F1F23', '#7C5CFF', '#0B0B0D', 'Bebas Neue', 'Cercano y seguro') on conflict (business_id) do update set color_primary = excluded.color_primary`);

  await login(page);
  await page.getByLabel("Negocio activo").selectOption({ label: GB });
  await expect(page.getByRole("heading", { name: GB, level: 2 })).toBeVisible();

  // --- Estilos y memoria -------------------------------------------------
  await page.goto("/estilos");
  await expect(page.getByRole("heading", { name: "Estilos y memoria", level: 1 })).toBeVisible();
  await page.getByLabel("Dato para recordar").fill("Nunca usar color rosa");
  await page.locator("#memoria form select").selectOption("restriction");
  await page.getByRole("button", { name: "Guardar en memoria" }).click();
  await expect(page.getByText("Nunca usar color rosa")).toBeVisible();

  await page.locator("#estilos input[type=file]").setInputFiles(path.join(media, "referencia.png"));
  await expect(page.getByText("Medido por la app")).toBeVisible();
  await expect(page.getByText(/#101010 \d+%/)).toBeVisible();
  await page.getByLabel("Pegar respuesta de ChatGPT (opcional)").fill("Composición: sujeto a la derecha, mucho aire\nTipografía: serif condensada en mayúsculas\nIluminación: lateral dura");
  await expect(page.getByRole("textbox", { name: "Tipografía", exact: true })).toHaveValue("serif condensada en mayúsculas");
  await page.getByLabel("Nombre del estilo").fill("Barbería noir");
  await page.getByRole("button", { name: "Guardar como estilo" }).click();
  await expect(page.getByText("Estilo «Barbería noir» guardado.")).toBeVisible();
  const styleId = psql(`select id from mkt_styles where business_id = '${gb}' and name = 'Barbería noir'`);
  expect(psql(`select (attributes->'measured'->'palette'->0->>'hex') || '|' || (attributes->'interpreted'->>'typography') || '|' || cardinality(reference_asset_ids) from mkt_styles where id = '${styleId}'`)).toBe(
    "#101010|serif condensada en mayúsculas|1",
  );
  // Se guardó «la semana pasada» (9 días) para probar la referencia por fecha.
  psql(`update mkt_styles set created_at = now() - interval '9 days' where id = '${styleId}'`);
  await shot(page, "estilos", info.project.name);
  await noHorizontalScroll(page);

  // --- Crear: tres propuestas -------------------------------------------
  await page.goto("/?nueva=1");
  await expect(page.getByText(`¿Qué creamos hoy para ${GB}?`)).toBeVisible();
  await shot(page, "crear-inicio", info.project.name);
  await say(page, `Haz tres anuncios diferentes para ${GB}`);
  await expect(page).toHaveURL(/\?c=[0-9a-f-]{36}/);
  const cards = page.getByRole("article", { name: /^Propuesta \d/ });
  await expect(cards).toHaveCount(3);
  await expect(page.getByText(/Preparé 3 propuestas/)).toBeVisible();
  await expect(page.getByText(/Incluí 1 dato de la memoria/)).toBeVisible();
  const firstCard = cards.first();
  await firstCard.getByRole("button", { name: "Ver prompt" }).click();
  const prompt1 = await firstCard.getByLabel("Prompt de la propuesta 1").inputValue();
  expect(prompt1).toContain("Nunca usar color rosa");
  expect(prompt1).toMatch(/\$120|\$200/);
  expect(prompt1).toContain("No incluyas logotipos, marcas ni personajes de terceros");
  await shot(page, "crear-propuestas", info.project.name);

  // --- Reutilizar el estilo de la semana pasada -------------------------
  await say(page, "Usa el estilo que guardamos la semana pasada");
  await expect(page.getByText(/Usé el estilo guardado «Barbería noir» \(guardado la semana pasada/)).toBeVisible();
  const styled = cards.last();
  await expect(styled.getByText(/estilo «Barbería noir»/)).toBeVisible();
  await styled.getByRole("button", { name: "Ver prompt" }).click();
  const promptStyled = await styled.getByRole("textbox", { name: /Prompt de la propuesta/ }).inputValue();
  expect(promptStyled).toContain("Estilo guardado «Barbería noir»");
  expect(promptStyled).toContain("#101010");
  expect(promptStyled).toContain("serif condensada en mayúsculas");

  // --- Ajustes por instrucciones -----------------------------------------
  await say(page, "Hazlo más premium y menos artificial");
  await expect(cards.last().getByText("Más premium")).toBeVisible();
  await expect(cards.last().getByText("Más natural")).toBeVisible();
  await say(page, "Conserva la composición, pero cambia los colores y la promoción");
  await expect(page.getByText(/adjunta en ChatGPT la imagen anterior/)).toBeVisible();
  await say(page, "Adapta este concepto a una historia de Instagram");
  await expect(cards.last().getByText(/Historia 9:16/)).toBeVisible();
  await say(page, "Recuerda que preferimos fotos reales del local");
  await expect(page.getByText(/Guardado en la memoria de/)).toBeVisible();
  expect(psql(`select kind || '|' || source from mkt_memory where business_id = '${gb}' and text = 'Preferimos fotos reales del local'`)).toBe("preference|chat");

  // --- ChatGPT asistido: copiar prompt y abrir (simulado) ----------------
  const target = cards.nth(0);
  const popupPromise = context.waitForEvent("page");
  await target.getByRole("link", { name: /Copiar prompt y abrir ChatGPT/ }).click();
  const popup = await popupPromise;
  await expect.poll(() => opened.length).toBeGreaterThan(0);
  expect(new URL(opened[0]).hostname).toBe("chatgpt.com");
  await popup.close();
  await expect(page.getByText(/Prompt copiado/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(prompt1);

  // --- Importar dos resultados y comparar --------------------------------
  await target.getByLabel("Imagen generada para la propuesta 1").setInputFiles(path.join(media, "chatgpt-1.png"));
  await expect(page.getByText(/Imagen importada para/).first()).toBeVisible({ timeout: 20_000 });
  await cards.nth(1).getByLabel("Imagen generada para la propuesta 2").setInputFiles(path.join(media, "chatgpt-2.png"));
  await expect(page.getByText(/Imagen importada para/)).toHaveCount(2, { timeout: 20_000 });
  expect(
    psql(
      `select count(*) || '|' || count(*) filter (where v.parent_version_id is not null) || '|' || count(*) filter (where a.origin = 'ai_generated') from mkt_creative_versions v join mkt_assets a on a.id = v.asset_id where v.business_id = '${gb}' and v.kind = 'imported_result'`,
    ),
  ).toBe("2|2|2");
  if (isMobile) {
    await page.getByRole("button", { name: "Revisar y aprobar" }).click();
    await expect(page.getByRole("dialog", { name: "Vista previa" })).toBeVisible();
    await shot(page, "crear-vista-previa", info.project.name);
  } else {
    const aside = page.getByRole("complementary", { name: "Vista previa y aprobación" });
    await aside.getByRole("button", { name: "Comparar versiones" }).click();
    await expect(aside.getByLabel("Versión a comparar 1")).toBeVisible();
    await shot(page, "crear-comparar", info.project.name);
    await aside.getByRole("button", { name: /Elegir v/ }).last().click();
  }

  // --- Revisar y aprobar: por destino, sin publicar (Meta no conectada) ---
  const panel = isMobile ? page.getByRole("dialog", { name: "Vista previa" }) : page.getByRole("complementary", { name: "Vista previa y aprobación" });
  await panel.getByRole("button", { name: "Revisar y aprobar" }).click();
  const review = page.getByRole("dialog", { name: "Revisar y aprobar" });
  await expect(review).toBeVisible();
  await expect(review.getByText(/No conectada/).first()).toBeVisible();
  for (const box of await review.locator("fieldset").first().getByRole("checkbox").all()) await box.check();
  await review.getByRole("checkbox", { name: /Página de Facebook/ }).check();
  await review.getByRole("checkbox", { name: /Instagram profesional/ }).check();
  await review.getByRole("radio", { name: "Publicar ahora" }).check();
  await expect(review.getByText(/se aprobará y guardará en el calendario, pero NO se publicará/)).toBeVisible();
  await shot(page, "aprobar", info.project.name);
  await review.getByRole("button", { name: "Aprobar y publicar ahora en Facebook e Instagram" }).click();
  await expect(review.getByText("Facebook: Guardado, no publicado")).toBeVisible({ timeout: 20_000 });
  await expect(review.getByText("Instagram: Guardado, no publicado")).toBeVisible();
  const rows = () =>
    psql(`select string_agg(platform::text || ':' || status::text || ':' || publish_mode || ':' || coalesce(external_post_id, 'null'), ',' order by platform) from mkt_content_items where business_id = '${gb}' and creative_version_id is not null`);
  expect(rows()).toBe("facebook_page:scheduled:manual:null,instagram:scheduled:manual:null");
  expect(psql(`select count(*) from mkt_creative_versions where business_id = '${gb}' and is_final`)).toBe("1");
  await review.getByRole("button", { name: "Listo" }).click();

  // Reintentar no duplica.
  await panel.getByRole("button", { name: "Revisar y aprobar" }).click();
  await expect(review.getByText("Ya aprobada antes")).toBeVisible();
  for (const box of await review.locator("fieldset").first().getByRole("checkbox").all()) await box.check();
  await review.getByRole("checkbox", { name: /Página de Facebook/ }).check();
  await review.getByRole("button", { name: /Aprobar y guardar para Facebook/ }).click();
  await expect(review.getByText("Facebook: Guardado, no publicado")).toBeVisible({ timeout: 20_000 });
  expect(psql(`select count(*) from mkt_content_items where business_id = '${gb}' and creative_version_id is not null`)).toBe("2");
  await review.getByRole("button", { name: "Listo" }).click();
  await noHorizontalScroll(page);

  // --- Investigar: conclusión con fuente → memoria → crear ----------------
  const report = randomUUID();
  psql(`insert into mkt_research_reports (id, business_id, title, city, keywords) values ('${report}', '${gb}', 'Prueba ${run}', 'Durango', '{barbería}')`);
  psql(
    `insert into mkt_research_findings (business_id, report_id, source_type, source_name, url, summary, evidence_level, confidence, capture_method) values ('${gb}', '${report}', 'manual', 'Ficha pública de prueba', 'https://example.com/ficha', 'Los fines de semana hay más búsquedas de corte en Durango (dato de prueba)', 'observation', 'medium', 'manual')`,
  );
  await page.goto("/investigar");
  await expect(page.getByRole("heading", { name: "Investigar", level: 1 })).toBeVisible();
  const finding = page.getByRole("listitem").filter({ hasText: "dato de prueba" });
  await expect(finding.getByText("Interpretación")).toBeVisible();
  await finding.getByRole("button", { name: "Guardar en memoria" }).click();
  await expect(finding.getByText("En la memoria")).toBeVisible();
  expect(psql(`select kind || '|' || source || '|' || source_url from mkt_memory where business_id = '${gb}' and kind = 'research_insight'`)).toBe("research_insight|research|https://example.com/ficha");
  await shot(page, "investigar", info.project.name);
  await noHorizontalScroll(page);
  await finding.getByRole("link", { name: "Crear con esto" }).click();
  await expect(page.getByLabel("Mensaje para el estudio")).toHaveValue(/basados en esta conclusión \(interpretación\)/);

  // --- Aislamiento: Glamour no ve nada de Good Barber ---------------------
  await page.getByLabel("Negocio activo").selectOption({ label: GL });
  await expect(page.getByRole("heading", { name: GL, level: 2 })).toBeVisible();
  await expect(page.getByRole("option", { name: "Barbería noir" })).toHaveCount(0);
  await say(page, "Haz dos anuncios");
  const glPrompt = await (async () => {
    const c = page.getByRole("article", { name: /^Propuesta 1/ });
    await c.getByRole("button", { name: "Ver prompt" }).click();
    return c.getByLabel("Prompt de la propuesta 1").inputValue();
  })();
  expect(glPrompt).toContain("$150");
  expect(glPrompt).not.toMatch(/\$120|\$200|Nunca usar color rosa|Barbería noir|fotos reales del local/);
  await page.goto("/estilos");
  await expect(page.getByText("Nunca usar color rosa")).toHaveCount(0);
  await expect(page.getByText("Sin datos guardados todavía.")).toBeVisible();

  // Navegación: tres áreas principales.
  const nav = page.locator("nav[aria-label='Principal']").filter({ visible: true }).first();
  for (const name of [/Crear/, /Investigar/, /Estilos/]) await expect(nav.getByRole("link", { name })).toBeVisible();

  expect(errors).toEqual([]);
  psql(`delete from mkt_businesses where id in ('${gb}', '${gl}')`);
});
