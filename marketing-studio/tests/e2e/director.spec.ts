// Director de Marketing + Investigación + Experimentos en navegador real.
// Las fuentes externas (OpenStreetMap, Google Trends, Tavily) dependen de la red
// del entorno: aquí no se asume si responden; se verifica que su resultado
// (consultada, error o sin configurar) quede registrado con honestidad.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const EMAIL = "admin@local.test";
const PASSWORD = "Admin12345!";
const { API_URL, SERVICE_KEY } = JSON.parse(execFileSync("node", ["scripts/local-supabase/stack.mjs", "keys"], { encoding: "utf8" })) as {
  API_URL: string;
  SERVICE_KEY: string;
};

function psql(query: string) {
  return execFileSync("psql", ["-X", "-q", "-tA", "-h", "127.0.0.1", "-p", "54322", "-U", "postgres", "-d", "postgres", "-c", query], { encoding: "utf8" }).trim();
}

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

const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Secciones de la campaña" }).getByRole("link", { name });

test.describe.configure({ mode: "serial" });

test("Director: de una instrucción a una campaña medible", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  const shots = process.env.PW_SHOTS ?? "test-results";
  const shot = (n: string) => page.screenshot({ path: `${shots}/${info.project.name}-dir-${n}.png`, fullPage: true });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  psql(`delete from mkt_businesses where created_by = (select id from auth.users where email = '${EMAIL}')`);
  await login(page);
  await page.getByRole("button", { name: /Cargar Good Barber/ }).click();
  await expect(page.getByText("Negocios cargados")).toBeVisible();

  // ---------- Director ----------
  await page.goto("/crear");
  await expect(page.getByRole("heading", { name: "Director de Marketing" })).toBeVisible();
  await expect(page.getByText(/No disponible: Falta GEMINI_API_KEY/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Gemini API/ })).toBeDisabled();

  // Validación: sin negocio ni instrucción
  await page.getByRole("button", { name: "Preparar campaña" }).click();
  await expect(page.getByText("Elige al menos un negocio")).toBeVisible();
  await expect(page.getByText(/Describe lo que necesitas/)).toBeVisible();

  await page.getByRole("button", { name: "Usar el ejemplo" }).click();
  const tasks = page.getByRole("complementary", { name: "Tareas detectadas" });
  await expect(tasks.getByText("5 anuncios", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Proponer 5 anuncios con enfoques distintos")).toBeVisible();
  await expect(tasks.getByText("Reel", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Competencia", { exact: true })).toBeVisible();
  await expect(page.locator("#goal")).toHaveValue("appointments");
  // La instrucción se conserva tras el error de validación.
  await expect(page.locator("#instruction")).toHaveValue(/Good Barber/);
  await page.getByRole("checkbox", { name: "Good Barber" }).check();
  await noHorizontalScroll(page);
  await shot("01-director");
  await page.getByRole("button", { name: "Preparar campaña" }).click();
  await expect(page.getByText("Campaña preparada como borrador")).toBeVisible({ timeout: 90_000 });
  const campaignId = page.url().split("/campanas/")[1].split("?")[0];

  // ---------- Estrategia ----------
  await expect(page.getByRole("heading", { name: "Problema u oportunidad" })).toBeVisible();
  for (const h of ["Público objetivo", "Oferta propuesta", "Concepto visual"]) await expect(page.getByRole("heading", { name: h })).toBeVisible();
  await expect(page.getByText(/Comunicar precios reales: Corte \$120/)).toBeVisible();
  await expect(page.getByText("Hecho comprobado").first()).toBeVisible();
  await expect(page.getByText("Hipótesis").first()).toBeVisible();
  await expect(page.getByText(/No hay datos de competencia con fuente|Pendiente consulta asistida/).first()).toBeVisible();
  await expect(page.getByText(/Fechas cercanas: .*Día de Muertos/)).toBeVisible();
  await expect(page.getByText("Citado en la campaña").first()).toBeVisible();
  // Cada fuente automática deja constancia de lo que pasó realmente.
  const runs = psql(`select provider_runs from mkt_research_reports r join mkt_campaigns c on c.research_report_id = r.id where c.id = '${campaignId}'`);
  const providerRuns = JSON.parse(runs) as { provider: string; status: string }[];
  expect(providerRuns.map((r) => r.provider)).toEqual(["business_data", "calendar", "osm", "tavily", "google_trends_rss"]);
  expect(providerRuns.find((r) => r.provider === "tavily")?.status).toBe("not_configured");
  for (const r of providerRuns.filter((x) => x.provider === "osm" || x.provider === "google_trends_rss")) expect(["ok", "empty", "error"]).toContain(r.status);
  expect(psql(`select count(*) from mkt_research_findings f join mkt_campaigns c on c.research_report_id = f.report_id where c.id = '${campaignId}' and f.source_type = 'business_data' and f.evidence_level = 'fact'`)).toBe("1");
  await noHorizontalScroll(page);
  await shot("02-estrategia");

  // ---------- Anuncios y Reel ----------
  await tab(page, "Anuncios y Reel").click();
  await expect(page.getByRole("heading", { name: /^Anuncio \d/ })).toHaveCount(5);
  await expect(page.getByText("Corte $120", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Guion de Reel/ })).toBeVisible();
  await expect(page.getByText(/no se generó ninguna imagen/).first()).toBeVisible();
  await noHorizontalScroll(page);
  await shot("03-anuncios");

  // ---------- Calendario: borradores sin publicar ----------
  await tab(page, "Calendario").click();
  await expect(page.getByText(/no se publica nada/i)).toBeVisible();
  await page.getByRole("button", { name: "Crear borradores seleccionados" }).click();
  await expect(page.getByText(/6 borrador\(es\) creados en el calendario \(sin publicar\)/)).toBeVisible();
  expect(psql(`select count(*) || '|' || string_agg(distinct status::text, ',') from mkt_content_items where campaign_id = '${campaignId}'`)).toBe("6|draft");
  await page.reload();
  await expect(page.getByText("Borrador creado → abrir")).toHaveCount(6);
  await expect(page.getByRole("button", { name: "Crear borradores seleccionados" })).toBeVisible();
  await page.getByRole("button", { name: "Crear borradores seleccionados" }).click();
  await expect(page.getByText("Elige al menos una publicación del calendario sugerido.")).toBeVisible();
  expect(psql(`select count(*) from mkt_content_items where campaign_id = '${campaignId}'`)).toBe("6");

  // ---------- IA asistida: prompt + importación validada ----------
  await tab(page, "IA asistida").click();
  await page.getByText("Ver prompt").click();
  await expect(page.locator("pre")).toContainText("Corte $120");
  await expect(page.locator("pre")).toContainText("No inventes precios");
  await expect(page.getByRole("link", { name: /Abrir ChatGPT/ })).toHaveAttribute("href", "https://chatgpt.com/");
  await page.locator("#plan_json").fill("esto no es json");
  await page.getByRole("button", { name: "Importar y validar" }).click();
  await expect(page.getByText("No se encontró un objeto JSON en el texto pegado.")).toBeVisible();
  const imported = {
    opportunity: { text: "Más citas entre semana", basis: "hypothesis" },
    audience: { text: "Hombres de Durango", basis: "hypothesis" },
    offer: { text: "Corte $120", basis: "fact" },
    visual_concept: { text: "Negro y dorado", basis: "fact" },
    ads: [{ angle: "Precio inventado", headline: "Corte a $99", primary_text: "Solo hoy corte a $99", cta: "Agenda", basis: "recommendation" }],
  };
  await page.locator("#plan_json").fill(`Claro, aquí tienes:\n\`\`\`json\n${JSON.stringify(imported)}\n\`\`\``);
  await page.getByRole("button", { name: "Importar y validar" }).click();
  await expect(page.getByText("Plan importado con 1 advertencia(s) de precios.")).toBeVisible();
  await tab(page, "Estrategia").click();
  await expect(page.getByText(/Montos que no coinciden con ningún precio registrado: \$99/)).toBeVisible();
  await expect(page.getByText("Resultado importado de una IA externa (asistido)")).toBeVisible();

  // ---------- Editar el plan ----------
  await tab(page, "Editar").click();
  await page.locator("#ad_0_headline").fill("Corte $120 en Good Barber");
  await page.locator("#ad_0_primary_text").fill("Corte clásico por $120. Agenda por mensaje.");
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await expect(page.getByText("Plan actualizado.")).toBeVisible();
  await page.locator("#status").selectOption("approved");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Campaña guardada.")).toBeVisible();
  expect(psql(`select status || '|' || plan_version from mkt_campaigns where id = '${campaignId}'`)).toBe("approved|4"); // 1 creada → 2 borradores → 3 importada → 4 editada

  // ---------- Experimentos ----------
  await tab(page, "Experimentos").click();
  await expect(page.getByText("Sin resultados todavía")).toBeVisible();
  await page.locator("#hypothesis").fill("Mostrar el precio exacto genera más citas");
  await page.locator("#variant").fill("Precio claro");
  await page.locator("#appointments").fill("-2");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Número entero, 0 o mayor")).toBeVisible();
  await page.locator("#appointments").fill("4");
  await page.locator("#messages").fill("9");
  await page.locator("#revenue").fill("480");
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByText("Resultado registrado.")).toBeVisible();
  await expect(page.getByText(/todavía no alcanza para comparar/)).toBeVisible();
  await expect(page.getByText(/correlaciones/)).toBeVisible();
  expect(psql(`select appointments || '|' || messages || '|' || revenue_cents from mkt_experiments where campaign_id = '${campaignId}'`)).toBe("4|9|48000");
  await noHorizontalScroll(page);
  await shot("04-experimentos");

  await page.goto("/campanas/comparar");
  await expect(page.getByRole("link", { name: /Conseguir citas/ })).toBeVisible();
  await expect(page.getByText("Correlación no es causalidad")).toBeVisible();

  // ---------- Investigación: hallazgo manual de fuente asistida ----------
  const reportId = psql(`select research_report_id from mkt_campaigns where id = '${campaignId}'`);
  await page.goto(`/investigacion/${reportId}`);
  await expect(page.getByRole("link", { name: /Anuncios activos en México/ }).first()).toHaveAttribute("href", /facebook\.com\/ads\/library\/.*country=MX/);
  await page.locator("#source_name").fill("Página de una barbería del centro");
  await page.locator("#summary").fill("Anuncia corte + barba los martes");
  await page.locator("#evidence_level").selectOption("fact");
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Un hecho comprobado necesita el enlace de la fuente.")).toBeVisible();
  await page.locator("#url").fill("https://www.facebook.com/ads/library/?id=123");
  await page.getByRole("button", { name: "Registrar hallazgo" }).click();
  await expect(page.getByText("Hallazgo registrado.")).toBeVisible();
  await expect(page.getByText("Anuncia corte + barba los martes")).toBeVisible();
  await expect(page.getByText("Registro manual").first()).toBeVisible();
  await noHorizontalScroll(page);
  await shot("05-investigacion");

  // ---------- Varios negocios a la vez ----------
  await page.goto("/crear");
  await page.getByRole("checkbox", { name: "Glamour Studio" }).check();
  await page.getByRole("checkbox", { name: "AFORE PRO" }).check();
  await page.locator("#goal").selectOption("messages");
  await page.locator("#instruction").fill("Quiero más mensajes este fin de semana con tres publicaciones");
  await page.getByRole("checkbox", { name: /Investigar fuentes públicas/ }).uncheck();
  await page.getByRole("button", { name: "Preparar campaña" }).click();
  await expect(page.getByText("Se creó una campaña por cada negocio elegido.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("link", { name: /Recibir mensajes/ })).toHaveCount(2);
  const glamour = psql(`select c.plan->'warnings'->>0 from mkt_campaigns c join mkt_businesses b on b.id = c.business_id where b.slug = 'glamour-studio'`);
  expect(glamour).toMatch(/No hay precios registrados/);
  expect(psql(`select count(*) from mkt_campaigns c join mkt_businesses b on b.id = c.business_id where b.slug = 'glamour-studio' and jsonb_array_length(c.plan->'ads') = 3`)).toBe("1");

  // ---------- Aislamiento: otra cuenta ----------
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
  await op.goto(`/campanas/${campaignId}`);
  await expect(op.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  await op.goto(`/investigacion/${reportId}`);
  await expect(op.getByRole("heading", { name: "No encontrado" })).toBeVisible();
  await op.goto("/campanas");
  await expect(op.getByText("Aún no hay campañas")).toBeVisible();
  await op.goto("/campanas/comparar");
  await expect(op.getByText("Sin resultados registrados")).toBeVisible();
  await other.close();
  psql(`delete from auth.users where email = '${otherEmail}'`);

  expect(errors).toEqual([]);
});
