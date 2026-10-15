import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Usa el Chromium preinstalado si existe (entornos sin descarga de navegadores).
const executablePath =
  process.env.PW_CHROMIUM_PATH ?? (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: process.env.PW_OUTPUT_DIR ?? "test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    {
      name: "iphone",
      use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    // La Biblioteca usa el almacenamiento local de desarrollo en las pruebas.
    env: { ...process.env, MKT_STORAGE_BACKEND: "local" } as Record<string, string>,
    timeout: 60_000,
  },
});
