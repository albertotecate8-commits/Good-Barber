/*
 * Service worker de Smart Business Vision.
 * - Navegación: primero la red (siempre la versión más nueva); si no hay
 *   red, la última página guardada.
 * - Archivos estáticos con hash (/_next/static/): caché primero.
 * - NUNCA cachea Supabase ni ninguna otra API: los datos siempre son en
 *   vivo, nunca se muestran métricas viejas como si fueran actuales.
 * - Las notificaciones push propias se agregarán y probarán en un iPhone
 *   real más adelante (Etapa 6).
 */
const VERSION = "sbv-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase y terceros: sin caché.

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(PAGES)).put(req, res.clone());
          return res;
        } catch {
          const cached = await caches.match(req);
          return cached || new Response("Sin conexión. Smart Business Vision necesita internet para mostrar datos.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
  }
});
