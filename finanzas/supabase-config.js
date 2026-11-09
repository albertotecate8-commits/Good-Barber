// Cliente de Supabase para Mis Finanzas. Proyecto dedicado y separado del de
// la barbería — nunca comparten base de datos.
//
// SUPABASE_URL y SUPABASE_KEY son públicas por diseño (se ven en cualquier
// petición de red del navegador). La app no usa login: cualquiera con estos
// dos valores puede leer y escribir estos datos financieros — es una
// decisión consciente (prioriza simplicidad sobre protección). Si más
// adelante se agrega inicio de sesión, basta con cambiar las políticas RLS
// en supabase/schema.sql para exigir auth.uid() en vez de "true".

const SUPABASE_URL = "https://mwskrwkkiuifedatuvca.supabase.co";

const SUPABASE_KEY = "sb_publishable_qXO_1DZSLO_q672Ei6qVOA_uAmuZFek";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;
