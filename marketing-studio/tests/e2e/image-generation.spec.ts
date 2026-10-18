// Generación directa en navegador real contra un SIMULADOR local de Cloudflare
// Workers AI (127.0.0.1:3199; ninguna llamada sale a internet). Comprueba el
// cableado completo: referencias reducidas en el navegador, versión guardada
// con su prompt/referencias/estilo, modificación de una versión anterior,
// «usa esta referencia» en otra conversación y el tope diario propio.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const psql = (q: string) => execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", q], { encoding: "utf8" }).trim();
const media = fs.mkdtempSync(path.join(os.tmpdir(), "mkt-gen-"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=1024x1280:d=1", "-frames:v", "1", path.join(media, "out.png")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x101010:s=1080x1350:d=1", "-vf", "drawbox=x=640:y=420:w=360:h=420:color=0xC9A227:t=fill", "-frames:v", "1", path.join(media, "ref.png")]);
const OUT = fs.readFileSync(path.join(media, "out.png")).toString("base64");

interface Call {
  url: string;
  auth: string;
  prompt: string;
  images: number;
  width: string;
}
const calls: Call[] = [];
let server: http.Server;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("latin1");
      const field = (name: string) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`))?.[1] ?? "";
      calls.push({ url: req.url ?? "", auth: String(req.headers.authorization), prompt: Buffer.from(field("prompt"), "latin1").toString("utf8"), images: (body.match(/name="input_image_\d"/g) ?? []).length, width: field("width") });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, result: { image: OUT } }));
    });
  });
  await new Promise<void>((ok) => server.listen(3199, "127.0.0.1", ok));
});
test.afterAll(() => server?.close());

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill("Admin12345!");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page.getByRole("heading", { name: "Crear", level: 1 })).toBeAttached();
}
async function say(page: Page, text: string) {
  const before = await page.locator("ol > li").count();
  await page.getByLabel("Mensaje para el estudio").fill(text);
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect.poll(() => page.locator("ol > li").count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 2);
}

test.describe.configure({ mode: "serial" });

test("generación directa: imagen real guardada, modificación, referencia en otra conversación y tope diario", async ({ page }, info) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(20_000);
  calls.length = 0;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const run = `${info.project.name}-${randomUUID().slice(0, 6)}`;
  const admin = psql(`select id from auth.users where email = '${EMAIL}'`);
  const gb = randomUUID();
  const GB = `GB Gen ${run}`;
  psql(`insert into mkt_businesses (id, name, slug, sector, city, created_by) values ('${gb}', '${GB}', 'gb-gen-${run}', 'Barbería', 'Durango', '${admin}')`);
  psql(`insert into mkt_offerings (business_id, name, kind, price_cents, active, sort_order) values ('${gb}', 'Corte de cabello', 'service', 12000, true, 1)`);
  psql(`delete from mkt_ai_usage where provider = 'cloudflare-flux2'`);

  await login(page);
  await page.getByLabel("Negocio activo").selectOption({ label: GB });
  await expect(page.getByRole("heading", { name: GB, level: 2 })).toBeVisible();

  // Referencia guardada como estilo.
  await page.goto("/estilos");
  await page.waitForLoadState("networkidle"); // el selector de archivo debe estar hidratado
  await page.locator("#estilos input[type=file]").setInputFiles(path.join(media, "ref.png"));
  await expect(page.getByText("Medido por la app")).toBeVisible();
  await page.getByLabel("Nombre del estilo").fill("Noir prueba");
  await page.getByRole("button", { name: "Guardar como estilo" }).click();
  await expect(page.getByText("Estilo «Noir prueba» guardado.")).toBeVisible();

  // Conversación 1: generar de verdad (contra el simulador).
  await page.goto("/?nueva=1");
  await say(page, "Haz un anuncio de Corte de cabello");
  const card = page.getByRole("article", { name: /^Propuesta 1/ }).last();
  await expect(card.getByText("Solo prompt")).toBeVisible();
  await expect(card.getByText(/quedan ~\d+ imágenes hoy/)).toBeVisible();
  await card.getByRole("button", { name: "Generar imagen" }).click();
  await expect(page.getByText(/Imagen generada de verdad con FLUX.2/)).toBeVisible();
  await expect(card.getByText(/Generada · FLUX.2/).first()).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe("/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-2-klein-4b");
  expect(calls[0].auth).toBe("Bearer token-de-prueba-no-real-123456");
  expect(calls[0].width).toBe("1024");
  expect(calls[0].prompt).toMatch(/NO incluyas texto/);
  expect(calls[0].images).toBe(0);
  expect(
    psql(
      `select v.tool || '|' || a.origin || '|' || (v.concept->'generation'->>'model') || '|' || ((v.concept->'generation'->>'prompt') <> '') from mkt_creative_versions v join mkt_assets a on a.id = v.asset_id where v.business_id = '${gb}' and v.kind = 'imported_result'`,
    ),
  ).toBe("cloudflare-flux2|ai_generated|@cf/black-forest-labs/flux-2-klein-4b|true");
  expect(Number(psql(`select coalesce(sum(units), 0) from mkt_ai_usage where business_id = '${gb}' and provider = 'cloudflare-flux2' and outcome = 'ok'`))).toBeGreaterThan(0);

  // Modificación por instrucción: la versión anterior viaja como referencia 0.
  await say(page, "Hazlo más premium y conserva la composición");
  const v2 = page.getByRole("article", { name: /^Propuesta 1/ }).last();
  await expect(v2.getByText(/Usará: versión anterior v\d/)).toBeVisible();
  await v2.getByRole("button", { name: "Generar imagen" }).click();
  await expect(page.getByText(/Imagen generada de verdad con FLUX.2/)).toHaveCount(2);
  expect(calls).toHaveLength(2);
  expect(calls[1].images).toBe(1);
  expect(calls[1].prompt).toMatch(/La imagen de referencia 0 es la versión anterior/);
  expect(calls[1].prompt).toMatch(/Estética premium/);
  // La nueva imagen cuelga de la anterior (historial de versiones).
  expect(psql(`select count(*) from mkt_creative_versions c join mkt_creative_versions p on p.id = c.parent_version_id where c.business_id = '${gb}' and c.kind = 'imported_result' and p.kind = 'imported_result'`)).toBe("1");

  // Conversación 2 del mismo negocio: «usa esta referencia» sin repetir nada.
  await page.goto("/?nueva=1");
  await say(page, "Usa esta referencia y adapta el estilo a Good Barber");
  await expect(page.getByText(/Usé el estilo guardado «Noir prueba» \(la última referencia guardada/)).toBeVisible();
  const c3 = page.getByRole("article", { name: /^Propuesta 1/ }).last();
  await expect(c3.getByText(/estilo «Noir prueba»/).first()).toBeVisible();
  await c3.getByRole("button", { name: "Generar imagen" }).click();
  await expect(page.getByText(/Imagen generada de verdad con FLUX.2/)).toBeVisible();
  expect(calls).toHaveLength(3);
  expect(calls[2].images).toBe(1);
  expect(calls[2].prompt).toMatch(/referencia del estilo guardado/);
  expect(calls[2].prompt).toContain("Estilo guardado «Noir prueba»");

  // Tope diario propio: no llama a Cloudflare si no alcanza la cuota gratuita.
  // (como la service_role: el guarda solo deja registrar uso a nombre propio desde la app)
  psql(`begin; select set_config('request.jwt.claims', '{"role":"service_role"}', true); insert into mkt_ai_usage (business_id, user_id, provider, purpose, units) values ('${gb}', '${admin}', 'cloudflare-flux2', 'prueba de tope', 8990); commit;`);
  await page.getByRole("article", { name: /^Propuesta 2/ }).last().getByRole("button", { name: "Generar imagen" }).click();
  await expect(page.getByText(/Se alcanzó el tope gratuito de hoy/)).toBeVisible();
  expect(calls).toHaveLength(3);

  expect(errors).toEqual([]);
  psql(`delete from mkt_ai_usage where provider = 'cloudflare-flux2'`);
  psql(`delete from mkt_businesses where id = '${gb}'`);
});
