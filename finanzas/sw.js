// Service worker de Mis Finanzas.
//
// Estrategia: "stale-while-revalidate" para el shell. Se sirve al instante
// desde la caché (la app abre sin internet) y en paralelo se busca una versión
// nueva para la próxima vez. Nunca toca los datos: todo vive en IndexedDB.

const CACHE = "finanzas-v1";

// Carpeta donde vive la app. Se deduce de la ubicación del propio service
// worker, así funciona igual si la app está en la raíz del dominio o en una
// subcarpeta como /finanzas/.
const SCOPE = new URL("./", self.location).pathname;

const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/app.css",
  "./js/app.js",
  "./js/store.js",
  "./js/db.js",
  "./js/model.js",
  "./js/seed.js",
  "./js/finance.js",
  "./js/forms.js",
  "./js/ui.js",
  "./js/components.js",
  "./js/dates.js",
  "./js/format.js",
  "./js/screens/home.js",
  "./js/screens/expenses.js",
  "./js/screens/income.js",
  "./js/screens/debts.js",
  "./js/screens/more.js",
  "./js/screens/detail.js",
  "./js/screens/calendar.js",
  "./js/screens/history.js",
  "./js/screens/monthly.js",
  "./js/screens/search.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll falla entero si un archivo falla; se añaden de uno en uno para
      // que la instalación no se rompa por un recurso suelto.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return; // no interferir con el resto del sitio

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));

      return cached || network;
    })
  );
});
