// Estudio creativo en navegador real: editor en Canvas, exportación, revisión,
// calendario, importación asistida y montaje de video con FFmpeg.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const PASSWORD = "Admin12345!";
const { API_URL, SERVICE_KEY } = JSON.parse(execFileSync("node", ["scripts/local-supabase/stack.mjs", "keys"], { encoding: "utf8" })) as { API_URL: string; SERVICE_KEY: string };
const psql = (q: string) => execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();

// Material de prueba generado con FFmpeg (no son fotos reales de ningún negocio).
const media = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-e2e-"));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
ff("-f", "lavfi", "-i", "testsrc2=s=1600x2000:d=1", "-frames:v", "1", path.join(media, "local.jpg"));
ff("-f", "lavfi", "-i", "color=c=0xD6A73A:s=800x200:d=1", "-frames:v", "1", path.join(media, "logo.png"));
ff("-f", "lavfi", "-i", "testsrc=s=600x400:d=1", "-frames:v", "1", path.join(media, "chatgpt.png"));
ff("-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(media, "clip.mp4"));
ff("-f", "lavfi", "-i", "sine=f=330:d=6", "-c:a", "libmp3lame", path.join(media, "musica.mp3"));

async function login(page: Page, email = EMAIL) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Crear", level: 1 })).toBeVisible();
}
async function noHorizontalScroll(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}
async function upload(page: Page, file: string, kind: string, title: string, extra: (p: Page) => Promise<unknown> = async () => {}) {
  await page.goto("/biblioteca?negocio=good-barber");
  await page.locator("#up-kind").selectOption(kind);
  await page.locator("#up-file").setInputFiles(path.join(media, file));
  await page.locator("#up-title").fill(title);
  await extra(page);
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText(`«${file}» se subió correctamente.`)).toBeVisible({ timeout: 30_000 });
}
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Secciones del proyecto" }).getByRole("link", { name });

test.describe.configure({ mode: "serial" });

test("estudio creativo: de concepto a material revisado en el calendario", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const shots = process.env.PW_SHOTS ?? "test-results";
  const shot = (n: string) => page.screenshot({ path: `${shots}/${info.project.name}-est-${n}.png`, fullPage: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  psql(`delete from mkt_businesses where created_by = (select id from auth.users where email = '${EMAIL}')`);
  await login(page);
  await page.getByRole("button", { name: /Cargar Good Barber/ }).click();
  await expect(page.getByText("Negocios cargados")).toBeVisible();

  await upload(page, "local.jpg", "image", "Foto del local", async (p) => p.locator("#up-origin").selectOption("real_photo"));
  await upload(page, "logo.png", "logo", "Logotipo Good Barber");
  // Audio sin licencia: rechazado
  await page.locator("#up-kind").selectOption("audio");
  await page.locator("#up-file").setInputFiles(path.join(media, "musica.mp3"));
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText(/Indica la licencia de la música/)).toBeVisible();
  await page.locator("#up-license").fill("Música propia grabada por el dueño");
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText("«musica.mp3» se subió correctamente.")).toBeVisible();
  await upload(page, "clip.mp4", "video", "Clip del servicio", async (p) => p.locator("#up-origin").selectOption("real_photo"));
  // Dimensiones leídas en el servidor desde el archivo
  expect(psql(`select width || 'x' || height from mkt_assets where title = 'Foto del local'`)).toBe("1600x2000");

  // ---------- Proyecto ----------
  await page.goto("/estudio");
  await expect(page.getByText("Qué es real y qué es asistido")).toBeVisible();
  await page.locator("#np-business").selectOption({ label: "Good Barber" });
  await page.locator("#np-material").selectOption("ad");
  await page.locator("#np-format").selectOption("ig_portrait");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByText("Escribe un título")).toBeVisible();
  await page.locator("#np-title").fill("Promo corte octubre");
  await page.locator("#np-instruction").fill("Anuncio con el precio del corte y una foto real del local");
  await page.getByRole("checkbox", { name: /Foto del local/ }).check();
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Promo corte octubre" })).toBeVisible();
  const projectId = page.url().split("/estudio/")[1].split("?")[0];

  // ---------- Conceptos ----------
  await page.getByRole("button", { name: "Generar conceptos" }).click();
  await expect(page.getByText(/3 conceptos creados. Son ideas y prompts: todavía no hay imágenes./)).toBeVisible();
  await expect(page.getByText("$120").first()).toBeVisible();
  await shot("01-conceptos");

  // ---------- Editor: exportación real ----------
  await page.getByRole("link", { name: "Diseñar en el editor" }).first().click();
  const canvas = page.getByRole("img", { name: /Vista previa/ });
  await expect(canvas).toBeVisible();
  await expect(page.locator("#ed-bg")).not.toHaveValue("");
  await expect(page.locator("#ed-logo")).not.toHaveValue("");
  await page.locator("#ed-headline").fill("Corte clásico");
  await page.locator("#ed-price").fill("$120");
  await page.locator("#ed-cta").fill("Agenda por mensaje");
  await page.getByRole("checkbox", { name: /Instagram publicación cuadrada/ }).check();
  // Tipografía del catálogo (archivo local OFL): debe cargarse antes de exportar.
  await page.getByLabel("Tipografía de títulos y precio").selectOption("montserrat");
  await expect.poll(() => page.evaluate(() => document.fonts.check('800 40px "MAS Montserrat"'))).toBe(true);
  await noHorizontalScroll(page);
  await shot("02-editor");
  await page.getByRole("button", { name: "Exportar y revisar" }).click();
  await expect(page.getByText(/2 versión\(es\) guardadas/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Logotipo sin deformar/).first()).toBeVisible();
  await expect(page.getByText(/Contraste \(headline\)/).first()).toBeVisible();
  await expect(page.getByText(/No se encontraron palabras desconocidas/).first()).toBeVisible();
  const exported = psql(`select a.width || 'x' || a.height || '|' || a.origin from mkt_creative_versions v join mkt_assets a on a.id = v.asset_id where v.project_id = '${projectId}' and v.kind = 'code_edit' order by v.version_no`);
  expect(exported.split("\n")).toEqual(["1080x1350|code_edited", "1080x1080|code_edited"]);
  expect(psql(`select string_agg(distinct qa_status, ',') from mkt_creative_versions where project_id = '${projectId}' and kind = 'code_edit'`)).not.toContain("failed");

  // Precio inventado: la revisión automática lo marca como error
  await page.getByRole("checkbox", { name: /Instagram publicación cuadrada/ }).uncheck();
  await page.locator("#ed-price").fill("$99");
  await page.locator("#ed-cta").fill("Agenda tu promocion");
  await page.getByRole("button", { name: "Exportar y revisar" }).click();
  await expect(page.getByText(/No coinciden con ningún precio registrado: \$99/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/«promocion» \(¿promoción/)).toBeVisible();
  await expect(page.getByText("Con errores")).toBeVisible();

  // ---------- Versiones, comparación y revisión ----------
  await tab(page, "Versiones y revisión").click();
  const failedId = psql(`select id from mkt_creative_versions where project_id = '${projectId}' and qa_status = 'failed' limit 1`);
  await page.goto(`/estudio/${projectId}?tab=versiones&v=${failedId}`);
  await expect(page.getByText("Hay errores automáticos. Corrígelos en el editor")).toBeVisible();
  const goodId = psql(`select id from mkt_creative_versions where project_id = '${projectId}' and kind = 'code_edit' and format_key = 'ig_portrait' and qa_status <> 'failed' order by version_no limit 1`);
  await page.goto(`/estudio/${projectId}?tab=versiones`);
  await page.waitForLoadState("networkidle");
  for (const box of (await page.getByRole("checkbox", { name: "Comparar" }).all()).slice(0, 2)) await box.check();
  await page.getByRole("button", { name: "Comparar seleccionadas" }).click();
  await page.waitForURL(/comparar=.*comparar=/);
  await expect(page.getByRole("heading", { name: "Comparación" })).toBeVisible();
  await page.goto(`/estudio/${projectId}?tab=versiones&v=${goodId}`);
  await page.getByRole("button", { name: "Marcar como definitiva" }).click();
  await expect(page.getByText(/Falta confirmar/)).toBeVisible();
  for (const box of await page.locator("input[name^='check_']").all()) await box.check();
  const ack = page.locator("input[name='ack_warnings']");
  if (await ack.count()) await ack.check();
  await page.getByRole("button", { name: "Marcar como definitiva" }).click();
  await expect(page.getByText("Revisión completada: versión marcada como definitiva.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Agregar al calendario" }).click();
  await expect(page.getByText("Borrador creado en el calendario (no se publica automáticamente).")).toBeVisible();
  expect(psql(`select c.status || '|' || (c.asset_id = v.asset_id) from mkt_content_items c join mkt_creative_versions v on v.id = '${goodId}' where c.title = 'Promo corte octubre'`)).toBe("draft|true");
  await noHorizontalScroll(page);
  await shot("03-revision");

  // ---------- Herramientas externas e importación ----------
  await tab(page, "Herramientas externas").click();
  await expect(page.locator("pre").first()).toContainText("NO incluyas texto, precios");
  await expect(page.getByRole("link", { name: /Abrir ChatGPT/ }).first()).toHaveAttribute("href", "https://chatgpt.com/");
  await expect(page.getByRole("link", { name: /Abrir Gemini/ }).first()).toHaveAttribute("href", "https://gemini.google.com/app");
  await expect(page.getByText(/Ninguna suscripción incluye una API/)).toBeVisible();
  await page.locator("#imp-tool").selectOption("chatgpt");
  await page.locator("#up-file").setInputFiles(path.join(media, "chatgpt.png"));
  await expect(page.locator("#up-origin")).toHaveValue("ai_generated");
  await page.getByRole("button", { name: "Importar a la Biblioteca y al proyecto" }).click();
  await expect(page.getByText(/Resultado importado como nueva versión/)).toBeVisible({ timeout: 30_000 });
  expect(psql(`select v.tool || '|' || a.origin || '|' || v.qa_status from mkt_creative_versions v join mkt_assets a on a.id = v.asset_id where v.project_id = '${projectId}' and v.kind = 'imported_result'`)).toBe("chatgpt|ai_generated|passed_with_warnings");

  // ---------- Video con FFmpeg ----------
  await page.goto("/estudio");
  await page.locator("#np-business").selectOption({ label: "Good Barber" });
  await page.locator("#np-material").selectOption("reel");
  await page.locator("#np-title").fill("Reel corte");
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page.getByRole("heading", { name: "Reel corte" })).toBeVisible();
  const videoId = page.url().split("/estudio/")[1].split("?")[0];
  await tab(page, "Video").click();
  await expect(page.getByText(/escena\(s\) sin material/)).toBeVisible();
  await page.getByLabel("Material de la escena 1").selectOption({ label: "Foto del local (foto)" });
  await page.getByLabel("Texto en pantalla de la escena 1").fill("Corte $120");
  await page.getByLabel("Material de la escena 2").selectOption({ label: "Clip del servicio (video)" });
  await page.getByLabel("Duración de la escena 2").fill("2");
  await page.getByRole("button", { name: "Quitar escena 3" }).click();
  await page.getByRole("combobox", { name: "Música (de la Biblioteca)" }).selectOption({ label: "musica" });
  await page.getByRole("button", { name: "Guardar plan de video" }).click();
  await expect(page.getByText("Plan de video guardado.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Montar video" }).click();
  await expect(page.getByText(/Video montado \(versión 1\)/)).toBeVisible({ timeout: 120_000 });
  const v = psql(`select a.mime_type || '|' || a.origin || '|' || (a.size_bytes > 1000) from mkt_creative_versions v join mkt_assets a on a.id = v.asset_id where v.project_id = '${videoId}' and v.kind = 'video_render'`);
  expect(v).toBe("video/mp4|code_edited|true");
  const assetId = psql(`select asset_id from mkt_creative_versions where project_id = '${videoId}' and kind = 'video_render'`);
  const res = await page.request.get(`/api/biblioteca/archivo/${assetId}`);
  const file = path.join(media, "salida.mp4");
  fs.writeFileSync(file, Buffer.from(await res.body()));
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", file], { encoding: "utf8" }));
  expect(probe.streams.find((s: { width?: number }) => s.width)).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
  expect(Number(probe.format.duration)).toBeCloseTo(3 + 2, 0); // escena 1 (3 s) + escena 2 (2 s); sin campaña no hay cierre
  await noHorizontalScroll(page);
  await shot("04-video");

  // ---------- Aislamiento ----------
  const otherEmail = `otro-${randomUUID().slice(0, 8)}@test.local`;
  const created = await fetch(`${API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: otherEmail, password: PASSWORD, email_confirm: true }),
  }).then((r) => r.json());
  psql(`insert into mkt_admins (user_id) values ('${created.id}')`);
  const other = await browser.newContext();
  const op = await other.newPage();
  await login(op, otherEmail);
  await op.goto(`/estudio/${projectId}`);
  await expect(op.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  expect((await op.request.get(`/api/biblioteca/archivo/${assetId}?via=app`)).status()).toBe(404);
  await other.close();
  psql(`delete from auth.users where email = '${otherEmail}'`);

  expect(errors).toEqual([]);
});
