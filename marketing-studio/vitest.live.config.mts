import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Pruebas EN VIVO contra fuentes externas reales (npm run test:live).
// No forman parte de la suite normal: dependen de la red y de terceros.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: { environment: "node", include: ["tests/live/**/*.live.ts"], testTimeout: 60000 },
});
