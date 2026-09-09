const SUPABASE_URL = "https://sisgfnykjzovnaxylxyq.supabase.co";

const SUPABASE_KEY = "sb_publishable_3S-1ENyE1F12JHSHsFeOyA_G3tDOcc0";

// Se detecta aquí, de forma síncrona y ANTES de crear el cliente, si el
// usuario llegó desde el enlace de "¿Olvidaste tu contraseña?". No basta con
// esperar el evento PASSWORD_RECOVERY del SDK: ese evento se dispara de forma
// asíncrona en cuanto se crea el cliente, y como js/app.js se carga como
// <script type="module"> (el navegador lo difiere hasta terminar de parsear
// el documento, igual que "defer"), el evento puede llegar a dispararse
// ANTES de que app.js alcance a registrar su listener — perdiéndose para
// siempre. Leer el hash aquí, en este script clásico síncrono que corre
// antes que cualquier lógica async del SDK, es la única forma de detectarlo
// sin depender de esa carrera.
window.__IS_PASSWORD_RECOVERY__ = /type=recovery/.test(window.location.hash);

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

window.supabaseClient = supabaseClient;
window.supabase = supabaseClient;
