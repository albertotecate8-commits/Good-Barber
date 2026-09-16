// Service worker mínimo: cachea solo el shell estático de la app, como
// respaldo para cuando no hay red. Cuando SÍ hay red, siempre se sirve la
// versión más reciente (network-first) — antes era cache-first, lo que
// hacía que un teléfono con la PWA ya instalada pudiera quedarse mostrando
// código viejo indefinidamente aunque hubiera una versión nueva desplegada.
// Nunca intercepta llamadas a Supabase (auth/datos) para no dar
// una falsa sensación de "guardado" cuando en realidad no hay red.
const CACHE_NAME = "goodbarber-shell-v6";
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
  "js/agenda-data.js",
  "js/agenda-ui.js",
  "js/render-agenda-admin.js",
  "js/render-agenda-barber.js",
  "js/migration.js",
  "js/media.js",
  "js/image-field.js",
  "js/push.js",
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
  // `cache: "reload"` salta la caché HTTP del navegador, que es la que se
  // interpone entre este service worker y el servidor. Sin esto, "ir a la
  // red" podía devolver igualmente un archivo viejo guardado por el
  // navegador, y el usuario seguía viendo la versión anterior aunque ya
  // hubiera otra desplegada.
  const alServidor = new Request(event.request, { cache: "reload" });

  event.respondWith(
    fetch(alServidor)
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


/* ===============================================================
   NOTIFICACIONES PUSH

   Añadido sobre el service worker existente. No cambia ni una línea del
   shell, ni la caché v6, ni el network-first, ni el respaldo sin conexión:
   solo se suman dos escuchadores que antes no existían.

   El aviso lo dibuja el SISTEMA OPERATIVO, no la página. Por eso llega con
   Good Barber cerrada, y por eso el sonido, la vibración y la pantalla de
   bloqueo los decide el teléfono según lo que el usuario tenga configurado
   para esta aplicación. No podemos —ni intentamos— elegir el sonido.
   =============================================================== */

// Qué respeta cada plataforma, comprobado en los datos de compatibilidad de
// MDN antes de escribir esto (no de memoria):
//
//   body, data, dir ....... Chrome, Firefox, Safari macOS 16, Safari iOS 16.4
//   tag ................... Chrome y Firefox. Safari LO IGNORA (se puede
//                           poner, no tiene efecto). Por eso la defensa real
//                           contra duplicados está en el servidor.
//   icon .................. Chrome y Firefox. Safari lo ignora: en iPhone el
//                           icono sale del manifest.
//   badge, vibrate ........ solo Chrome/Android. Safari no los admite.
//   requireInteraction .... Chrome. Firefox solo en Windows. Safari no.
//
// Todo lo que una plataforma no admite lo ignora sin lanzar error, así que
// se envía igual: mejora Android sin perjudicar a iPhone.
self.addEventListener("push", (event) => {
  event.waitUntil(mostrarAviso(event));
});

async function mostrarAviso(event) {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    // Si el cuerpo no fuera JSON, se muestra algo útil igualmente: nunca se
    // deja pasar un push sin notificación visible.
    d = { body: event.data ? event.data.text() : "" };
  }

  const titulo = d.title || "🔔 Good Barber";
  const opciones = {
    body: d.body || "Tienes una cita nueva.",
    tag: d.tag || undefined,
    data: { url: d.url || "/", appointment_id: d.appointment_id || null },
    icon: "icons/icon-512.png",
    badge: "icons/icon-512.png",
    vibrate: [200, 100, 200],
    requireInteraction: false,
    renotify: false,
    // Nunca silent: además de no quererlo, el navegador exige que cada push
    // muestre una notificación visible (userVisibleOnly) y puede dejar de
    // entregarnos avisos si se incumple.
  };

  await self.registration.showNotification(titulo, opciones);

  // Contador sobre el icono de la aplicación. En iPhone es la ÚNICA forma de
  // conseguirlo: la opción `badge` de arriba es el iconito de la barra de
  // estado de Android, otra cosa distinta.
  //
  // El número son las citas nuevas sin atender, no los push enviados: se
  // cuentan las notificaciones que siguen sin abrir. Se limpia solo cuando el
  // barbero entra en la aplicación.
  //
  // Mejora progresiva: si la API no existe, no pasa nada y el push ya se
  // mostró. Nunca puede romper la notificación.
  try {
    if (self.registration.getNotifications && navigator.setAppBadge) {
      const pendientes = await self.registration.getNotifications();
      await navigator.setAppBadge(pendientes.length);
    }
  } catch {
    /* sin contador; el aviso ya está dado */
  }
}

// Al tocar la notificación: abrir Good Barber en esa cita. Si ya hay una
// ventana abierta se reutiliza en vez de abrir otra.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = event.notification.data?.url || "/";
  event.waitUntil(abrirEnLaCita(destino));
});

async function abrirEnLaCita(destino) {
  const url = new URL(destino, self.location.origin).href;
  const ventanas = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const ventana of ventanas) {
    // Misma aplicación ya abierta: se enfoca y se le pide navegar, sin
    // recargar y sin perder lo que el barbero estuviera haciendo.
    if (new URL(ventana.url).origin === self.location.origin) {
      try {
        await ventana.focus();
        ventana.postMessage({ tipo: "ir-a-cita", url });
        return;
      } catch {
        /* si no se pudo enfocar, se abre una ventana nueva */
      }
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url);
}
