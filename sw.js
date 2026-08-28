// Service worker mínimo: cachea solo el shell estático de la app, como
// respaldo para cuando no hay red. Cuando SÍ hay red, siempre se sirve la
// versión más reciente (network-first) — antes era cache-first, lo que
// hacía que un teléfono con la PWA ya instalada pudiera quedarse mostrando
// código viejo indefinidamente aunque hubiera una versión nueva desplegada.
// Nunca intercepta llamadas a Supabase (auth/datos) para no dar
// una falsa sensación de "guardado" cuando en realidad no hay red.
const CACHE_NAME = "goodbarber-shell-v3";
const SHELL_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "supabase-config.js",
  "css/styles.css",
  "js/vendor/supabase.js",
  "js/app.js",
  "js/auth.js",
  "js/data.js",
  "js/calc.js",
  "js/money.js",
  "js/dates.js",
  "js/ui.js",
  "js/shell.js",
  "js/render-login.js",
  "js/render-admin.js",
  "js/render-barber.js",
  "js/migration.js",
  "icons/apple-touch-icon.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear ni interceptar peticiones a Supabase: siempre deben ir a la red.
  if (url.hostname.endsWith("supabase.co") || url.hostname.endsWith("supabase.in")) {
    return;
  }

  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // Network-first: si hay red, siempre se usa la respuesta más reciente del
  // servidor (y se refresca la caché para el modo sin conexión). Solo se cae
  // a la caché cuando la red falla de verdad (sin conexión).
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
