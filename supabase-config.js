const SUPABASE_URL = "https://smswcsbxefeeuugabqfb.supabase.co";

const SUPABASE_KEY = "sb_publishable_IyoPemj_PIq71ykyF5LHoA_RJEvFKTb";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;

// Diagnóstico temporal: SUPABASE_URL ya es pública (se ve en cualquier
// petición de red), así que exponerla aquí para depuración no es un riesgo.
window.__SUPABASE_URL_FOR_DIAGNOSTICS__ = SUPABASE_URL;
