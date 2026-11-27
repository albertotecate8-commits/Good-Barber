"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, envProblems } from "../env";

let client: SupabaseClient | null = null;

/**
 * Cliente único de Supabase para el navegador.
 * - Usa SOLO la clave publishable (pública por diseño).
 * - Apunta al esquema `vision` por defecto (configurable).
 * - La sesión se guarda en el almacenamiento del navegador (supabase-js).
 */
export function getSupabase(): SupabaseClient {
  if (envProblems().length > 0) {
    throw new Error("Supabase no está configurado. Revisa las variables NEXT_PUBLIC_SUPABASE_*.");
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseKey, {
      db: { schema: env.supabaseSchema },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    }) as unknown as SupabaseClient;
  }
  return client;
}
