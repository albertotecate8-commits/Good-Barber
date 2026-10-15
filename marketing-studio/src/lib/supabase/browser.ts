"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente del navegador con la sesión del usuario (cookies). Se usa solo para
// subir archivos directamente a Supabase Storage; las políticas RLS de Storage
// deciden si la subida se permite.
export function createBrowserSupabase() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
