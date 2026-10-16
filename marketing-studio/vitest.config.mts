import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },
      // Comparten una sola base local y el proceso de publicación toma TODO lo
      // vencido: en paralelo, un archivo podía procesar las filas de otro.
      { extends: true, test: { name: "integration", include: ["tests/integration/**/*.test.ts"], fileParallelism: false } },
    ],
  },
});
