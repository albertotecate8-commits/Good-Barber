/**
 * Variables públicas del frontend. Next.js las incrusta en el bundle en
 * tiempo de compilación (por eso se leen con acceso directo a process.env).
 * Ninguna es secreta: la seguridad la dan las políticas RLS de Supabase.
 */
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
  supabaseSchema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "vision",
} as const;

export type EnvProblem = { variable: string; message: string };

export function envProblems(): EnvProblem[] {
  const problems: EnvProblem[] = [];
  if (!env.supabaseUrl || env.supabaseUrl.includes("TU-PROYECTO")) {
    problems.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", message: "Falta la URL del proyecto de Supabase." });
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.supabaseUrl) && !env.supabaseUrl.startsWith("http://localhost") && !env.supabaseUrl.startsWith("http://127.0.0.1")) {
    problems.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", message: "La URL no parece de Supabase (https://<proyecto>.supabase.co)." });
  }
  if (!env.supabaseKey || env.supabaseKey.includes("xxxx")) {
    problems.push({ variable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", message: "Falta la clave publishable/anon." });
  } else if (looksLikeServiceRole(env.supabaseKey)) {
    problems.push({
      variable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      message: "Esta clave parece ser la service_role/secret. NUNCA debe ir en el frontend: reemplázala por la publishable.",
    });
  }
  return problems;
}

/** Detecta claves privadas puestas por error en el frontend. */
export function looksLikeServiceRole(key: string): boolean {
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
      return payload.role === "service_role";
    } catch {
      return false;
    }
  }
  return false;
}
