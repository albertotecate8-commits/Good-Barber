const SUPABASE_URL = "https://smswcsbxefeeuugabqfb.supabase.co";

const SUPABASE_KEY = "sb_publishable_IyoPemj_PIq71ykyF5LHoA_RJEvFKTb";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;
