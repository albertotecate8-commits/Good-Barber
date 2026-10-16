import type { NextConfig } from "next";

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
