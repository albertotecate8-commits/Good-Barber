// Variables públicas (seguras en el navegador). La protección real de los
// datos la dan las políticas RLS de Supabase, no el secreto de esta clave.
export function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, anonKey, configured: Boolean(url && anonKey) };
}
