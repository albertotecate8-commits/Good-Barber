const SUPABASE_URL = "https://sisgfnykjzovnaxylxyq.supabase.co";

const SUPABASE_KEY = "sb_publishable_3S-1ENyE1F12JHSHsFeOyA_G3tDOcc0";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;

// Diagnóstico temporal: SUPABASE_URL ya es pública (se ve en cualquier
// petición de red), así que exponerla aquí para depuración no es un riesgo.
window.__SUPABASE_URL_FOR_DIAGNOSTICS__ = SUPABASE_URL;
