import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  // App privada: todo depende de la sesión, así que se usa renderizado
  // dinámico clásico en lugar de Cache Components.
  poweredByHeader: false,
  // Commit desplegado: /api/salud lo informa para verificar qué versión está en
  // producción. Netlify define COMMIT_REF al construir desde Git; en los
  // despliegues por subida se toma de .deploy-commit (lo escribe el script de
  // despliegue en la copia limpia, no está en Git). No es un secreto.
  env: {
    MKT_BUILD_COMMIT: (process.env.COMMIT_REF || (existsSync(".deploy-commit") ? readFileSync(".deploy-commit", "utf8").trim() : "")).slice(0, 7),
  },
  // El corrector ortográfico lee el diccionario con fs: se incluye en las funciones del servidor.
  outputFileTracingIncludes: {
    "/estudio/**": ["./node_modules/dictionary-es/index.aff", "./node_modules/dictionary-es/index.dic"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
