// Funciones centrales en PRODUCCIÓN con la cuenta de pruebas. Usa solo los
// negocios «QA … (pruebas)» de esa cuenta (RLS: nadie más los ve). No publica
// nada: Meta no está conectada y se verifica que la app lo diga.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.QA_EMAIL ?? "";
const PASSWORD = process.env.QA_PASSWORD ?? "";
const SHOTS = process.env.MKT_SHOTS_DIR;
const OUT =
  process.env.PROD_REPORT ?? path.join(os.tmpdir(), "prod-report.json");
const media = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-prod-"));
const ff = (...a: string[]) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
ff(
  "-f",
  "lavfi",
  "-i",
  "color=c=0x101010:s=1080x1350:d=1",
  "-vf",
  "drawbox=x=640:y=420:w=360:h=420:color=0xC9A227:t=fill",
  "-frames:v",
  "1",
  path.join(media, "referencia.png"),
);
ff(
  "-f",
  "lavfi",
  "-i",
  "testsrc2=s=1080x1350:d=1",
  "-frames:v",
  "1",
  path.join(media, "resultado-1.png"),
);
ff(
  "-f",
  "lavfi",
  "-i",
  "testsrc=s=1080x1350:d=1",
  "-frames:v",
  "1",
  path.join(media, "resultado-2.png"),
);
const report: Record<string, unknown> = {};
const SUPABASE = "https://xlhzzyqekkageaegvbab.supabase.co";

async function shot(page: Page, name: string, project: string) {
  if (SHOTS)
    await page.screenshot({
      path: path.join(SHOTS, `prod-${project}-${name}.png`),
    });
}
async function say(page: Page, text: string) {
  const before = await page.locator("ol > li").count();
  await page.getByLabel("Mensaje para el estudio").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect
    .poll(() => page.locator("ol > li").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(before + 2);
}
async function useBusiness(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Negocio activo").selectOption({ label: name });
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe.configure({ mode: "serial" });

test("producción: referencia → estilo, reutilización, versiones, aislamiento, investigación y aprobación honesta", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!EMAIL || !PASSWORD, "Faltan QA_EMAIL / QA_PASSWORD");
  test.skip(
    isMobile,
    "El recorrido completo corre en escritorio; el iPhone se revisa aparte.",
  );
  test.setTimeout(300_000);
  page.setDefaultTimeout(30_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const p = info.project.name;
  // Las subidas van del navegador directo a Supabase Storage: si esta máquina no alcanza supabase.co,
  // esa parte se omite y se reporta (no se simula).
  const storage = await page.request
    .get(`${SUPABASE}/storage/v1/version`)
    .then((r) => r.status() < 500)
    .catch(() => false);
  report.storageReachableFromTestMachine = storage;

  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Crear", level: 1 }),
  ).toBeAttached();
  await useBusiness(page, "QA Barbería (pruebas)");

  // 1) Memoria y referencia → estilo (subida real a Supabase Storage).
  await page.goto("/estilos");
  await page.waitForLoadState("networkidle");
  if (!(await page.getByText("Nunca usar color rosa (QA)").count())) {
    await page.locator("#memoria form select").selectOption("restriction");
    await page
      .getByLabel("Dato para recordar")
      .fill("Nunca usar color rosa (QA)");
    await page.getByRole("button", { name: "Guardar en memoria" }).click();
    await expect(page.getByText("Nunca usar color rosa (QA)")).toBeVisible();
  }
  const styleName = `Estilo QA ${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}`;
  if (storage) {
    if (
      !(await page
        .getByRole("heading", { name: "Nuevo estilo desde una imagen" })
        .count())
    )
      await page
        .getByRole("button", { name: "Nuevo estilo desde una imagen" })
        .click();
    await page
      .locator("#estilos input[type=file]")
      .setInputFiles(path.join(media, "referencia.png"));
    await expect(page.getByText("Medido por la app")).toBeVisible();
    await page
      .getByLabel("Pegar respuesta de ChatGPT (opcional)")
      .fill(
        "Tipografía: serif condensada en mayúsculas\nIluminación: lateral dura",
      );
    await page.getByLabel("Nombre del estilo").fill(styleName);
    await page.getByRole("button", { name: "Guardar como estilo" }).click();
    await expect(page.getByText(`Estilo «${styleName}» guardado.`)).toBeVisible(
      { timeout: 45_000 },
    );
    report.style = styleName;
  }
  await shot(page, "estilos", p);

  // 2) Conversación 1: propuesta con precio real, memoria; generación directa honesta.
  await page.goto("/?nueva=1");
  await say(page, "Haz un anuncio de Corte de cabello");
  const card1 = page.getByRole("article", { name: /^Propuesta 1/ }).last();
  await expect(card1.getByText("Solo prompt")).toBeVisible();
  report.generationNote = await card1
    .locator("p.rounded-xl, div.rounded-xl p")
    .first()
    .innerText();
  await card1.getByRole("button", { name: "Ver prompt" }).click();
  const prompt1 = await card1
    .getByLabel("Prompt de la propuesta 1")
    .inputValue();
  expect(prompt1).toContain("$135");
  expect(prompt1).toContain("Nunca usar color rosa (QA)");

  if (storage) {
    // 3) Importar resultado real → versión; ajuste por instrucción → otra versión.
    await card1
      .getByLabel("Imagen generada para la propuesta 1")
      .setInputFiles(path.join(media, "resultado-1.png"));
    await expect(page.getByText(/Imagen importada para/).first()).toBeVisible({
      timeout: 45_000,
    });
    await say(page, "Hazlo más premium y conserva la composición");
    const card2 = page.getByRole("article", { name: /^Propuesta 1/ }).last();
    await expect(card2.getByText("Más premium")).toBeVisible();
    await card2
      .getByLabel("Imagen generada para la propuesta 1")
      .setInputFiles(path.join(media, "resultado-2.png"));
    await expect(page.getByText(/Imagen importada para/)).toHaveCount(2, {
      timeout: 45_000,
    });
    await shot(page, "crear-versiones", p);
    report.thread1 = page.url();

    // 4) Revisar y aprobar: destinos sin conectar → guardado, NO publicado.
    const aside = page.getByRole("complementary", {
      name: "Vista previa y aprobación",
    });
    await aside.getByRole("button", { name: "Revisar y aprobar" }).click();
    const review = page.getByRole("dialog", { name: "Revisar y aprobar" });
    await expect(review).toBeVisible();
    report.readiness = await review.locator("fieldset").nth(1).innerText();
    for (const box of await review
      .locator("fieldset")
      .first()
      .getByRole("checkbox")
      .all())
      await box.check();
    await review.getByRole("checkbox", { name: /Página de Facebook/ }).check();
    await review
      .getByRole("checkbox", { name: /Instagram profesional/ })
      .check();
    await review.getByRole("radio", { name: "Publicar ahora" }).check();
    await review
      .getByRole("button", {
        name: /Aprobar y publicar ahora en Facebook e Instagram/,
      })
      .click();
    await expect(
      review.getByText("Facebook: Guardado, no publicado"),
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      review.getByText("Instagram: Guardado, no publicado"),
    ).toBeVisible();
    report.approval = await review.locator("section").first().innerText();
    await shot(page, "aprobar", p);
    await review.getByRole("button", { name: "Listo" }).click();
  } else {
    // Sin Storage: el ajuste por instrucción igual se comprueba (propuesta nueva con el modificador).
    await say(page, "Hazlo más premium");
    await expect(
      page
        .getByRole("article", { name: /^Propuesta 1/ })
        .last()
        .getByText("Más premium"),
    ).toBeVisible();
  }

  if (storage) {
    // 5) Conversación 2 del mismo negocio: «usa esta referencia».
    await page.goto("/?nueva=1");
    await say(page, "Usa esta referencia y adapta el estilo a QA Barbería");
    await expect(
      page.getByText(new RegExp(`Usé el estilo guardado «${styleName}»`)),
    ).toBeVisible();
    const card3 = page.getByRole("article", { name: /^Propuesta 1/ }).last();
    await card3.getByRole("button", { name: "Ver prompt" }).click();
    const prompt3 = await card3
      .getByLabel("Prompt de la propuesta 1")
      .inputValue();
    expect(prompt3).toContain(`Estilo guardado «${styleName}»`);
    expect(prompt3).toContain("serif condensada en mayúsculas");
    await shot(page, "crear-referencia", p);
  }

  // 6) Otro negocio: sin precios, memoria ni estilos ajenos.
  await useBusiness(page, "QA Uñas (pruebas)");
  await page.goto("/?nueva=1");
  await say(page, "Haz dos anuncios");
  const cardU = page.getByRole("article", { name: /^Propuesta 1/ }).last();
  await cardU.getByRole("button", { name: "Ver prompt" }).click();
  const promptU = await cardU
    .getByLabel("Prompt de la propuesta 1")
    .inputValue();
  expect(promptU).toContain("$155");
  expect(promptU).not.toMatch(/\$135|color rosa \(QA\)|Estilo QA/);
  await expect(
    page.getByRole("option", { name: new RegExp(styleName) }),
  ).toHaveCount(0);

  // 7) Investigación real desde Netlify (fuentes gratuitas) para QA Barbería.
  await useBusiness(page, "QA Barbería (pruebas)");
  await page.goto("/investigar");
  await page.getByRole("button", { name: "Investigar ahora" }).click();
  await expect(page).toHaveURL(/informe=/, { timeout: 60_000 });
  await expect(
    page.getByText("Fuentes en la última investigación"),
  ).toBeVisible();
  report.sources = await page
    .getByText("Fuentes en la última investigación")
    .locator("..")
    .innerText();
  report.findings = await page
    .locator(
      "#conclusiones ~ ul > li, section[aria-labelledby=conclusiones] li",
    )
    .count();
  await shot(page, "investigar", p);

  report.errors = errors;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});

test("producción en iPhone: Crear, Investigar y Estilos sin desbordes", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!EMAIL || !PASSWORD || !isMobile, "Solo iPhone");
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(
    page.getByRole("heading", { name: "Crear", level: 1 }),
  ).toBeAttached();
  for (const [route, name] of [
    ["/", "crear"],
    ["/investigar", "investigar"],
    ["/estilos", "estilos"],
  ] as const) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(page.viewportSize()!.width);
    await shot(page, name, info.project.name);
  }
});
