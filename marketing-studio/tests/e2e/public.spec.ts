// Páginas que Meta exige públicas y la comprobación de salud del despliegue.
import { expect, test } from "@playwright/test";

test("privacidad y eliminación de datos se abren sin sesión; el resto sigue protegido", async ({ page, request }) => {
  await page.goto("/privacidad");
  await expect(page.getByRole("heading", { name: /Política de privacidad/, level: 1 })).toBeVisible();
  await expect(page.getByText(/No pide ni guarda contraseñas/)).toBeVisible();
  await page.getByRole("link", { name: /instrucciones de eliminación/ }).click();
  await expect(page.getByRole("heading", { name: /Eliminación de datos/, level: 1 })).toBeVisible();

  await page.goto("/distribucion");
  await expect(page).toHaveURL(/\/login/);

  const salud = await request.get("/api/salud");
  expect(salud.status()).toBe(200);
  const body = await salud.json();
  expect(body).toMatchObject({ ok: true, database: "ok" });
  expect(JSON.stringify(body)).not.toMatch(/key|secret|token/i);
});
