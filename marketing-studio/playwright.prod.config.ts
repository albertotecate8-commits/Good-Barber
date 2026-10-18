import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Verificación en PRODUCCIÓN con la cuenta de pruebas (sus negocios «QA … (pruebas)»).
// Credenciales por variables de entorno (QA_EMAIL / QA_PASSWORD), nunca en Git.
const executablePath = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
// Netlify bloquea ráfagas de «HeadlessChrome»: se usa el agente de un navegador normal.
const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export default defineConfig({
  testDir: "tests/prod",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.PW_OUTPUT_DIR ?? "test-results-prod",
  use: { baseURL: process.env.PROD_URL ?? "https://marketing-ai-studio-7c75.netlify.app", userAgent, launchOptions: { executablePath }, trace: "retain-on-failure" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], userAgent, launchOptions: { executablePath } } },
    { name: "iphone", use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: { executablePath } } },
  ],
});
