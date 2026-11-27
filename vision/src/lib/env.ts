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

/**
 * Smart Business Vision usa un proyecto de Supabase PROPIO e independiente.
 * Estos son los proyectos de las otras apps del repositorio: si la URL
 * apunta a uno de ellos, la app se niega a arrancar.
 */
export const FORBIDDEN_PROJECTS: Record<string, string> = {
  sisgfnykjzovnaxylxyq: "Good Barber",
  mwskrwkkiuifedatuvca: "Finanzas",
};

/** "https://abcd.supabase.co" → "abcd" (null si no es una URL de Supabase). */
export function projectRef(url: string): string | null {
  const m = /^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i.exec(url.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export function envProblems(): EnvProblem[] {
  const problems: EnvProblem[] = [];
  if (!env.supabaseUrl || env.supabaseUrl.includes("TU-PROYECTO")) {
    problems.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", message: "Falta la URL del proyecto de Supabase." });
  } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(env.supabaseUrl) && !env.supabaseUrl.startsWith("http://localhost") && !env.supabaseUrl.startsWith("http://127.0.0.1")) {
    problems.push({ variable: "NEXT_PUBLIC_SUPABASE_URL", message: "La URL no parece de Supabase (https://<proyecto>.supabase.co)." });
  } else {
    const ref = projectRef(env.supabaseUrl);
    const other = ref ? FORBIDDEN_PROJECTS[ref] : undefined;
    if (other) {
      problems.push({
        variable: "NEXT_PUBLIC_SUPABASE_URL",
        message: `Esta URL es el proyecto de ${other}. Smart Business Vision debe usar su propio proyecto de Supabase.`,
      });
    }
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
