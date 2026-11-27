import type { NextConfig } from "next";

/**
 * Exportación estática (`out/`): la app es 100 % del lado del cliente.
 * - Se puede servir gratis en Cloudflare Pages (u otro hosting estático)
 *   sin Workers, sin funciones de servidor y sin facturación.
 * - La autenticación y los datos van directo a Supabase desde el navegador;
 *   la protección real la dan las políticas RLS de la base de datos.
 * - Ninguna clave privada existe en este proyecto: solo la URL pública y la
 *   clave publishable de Supabase (variables NEXT_PUBLIC_*).
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
