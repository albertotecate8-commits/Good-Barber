const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
const SUPABASE_KEY = "TU_SUPABASE_KEY";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
