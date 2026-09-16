// Notificaciones push del barbero: activar, desactivar y saber en qué estado
// está este dispositivo.
//
// Lo que NO hace, a propósito:
//   · No pide permiso al cargar la página. Solo cuando el barbero pulsa el
//     botón. iOS además lo exige: rechaza la petición si no viene de un
//     gesto directo del usuario.
//   · No reproduce ningún sonido desde la página. El aviso lo dibuja el
//     sistema operativo, que decide sonido, vibración y pantalla de bloqueo
//     según lo que el usuario tenga configurado para Good Barber.
//   · No simula soporte que el navegador no tenga.

import * as data from "./data.js";

// La clave PÚBLICA de VAPID. Tiene que estar aquí: PushManager.subscribe()
// la exige para cifrar contra el servidor. No es un secreto — la privada, que
// sí lo es, vive únicamente como secreto de Edge Function y nunca sale de
// Supabase.
export const VAPID_PUBLIC_KEY =
  "BOMwUaiDN_8kDhGv0o7lal2cxuIeP9Ud_xmUIlNTn773clT5A6daZA1l9BcxSS74u8Qfb2L6iTgfusgVKL02yBA";

function base64UrlABytes(base64Url) {
  const relleno = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const crudo = atob(base64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

function bytesABase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function esIOS() {
  const ua = navigator.userAgent || "";
  // iPadOS moderno se anuncia como Macintosh; el táctil lo delata.
  return /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// ¿Está corriendo como aplicación instalada en la pantalla de inicio?
export function esPWAInstalada() {
  return window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

/* Qué puede hacer ESTE dispositivo. Se comprueba de verdad, no se supone.
   Devuelve un motivo legible cuando no se puede, para poder explicarlo. */
export function capacidades() {
  const tieneSW = "serviceWorker" in navigator;
  const tienePush = "PushManager" in window;
  const tieneNotificaciones = "Notification" in window;

  if (!tieneSW || !tienePush || !tieneNotificaciones) {
    // En iPhone esto es exactamente lo que ocurre fuera de la PWA: Safari no
    // expone PushManager hasta que la aplicación está en la pantalla de
    // inicio (iOS 16.4 o posterior, documentado por Apple).
    if (esIOS() && !esPWAInstalada()) {
      return {
        puede: false,
        motivo: "ios-sin-instalar",
        mensaje: "Para recibir notificaciones en iPhone, agrega Good Barber a tu pantalla de inicio.",
      };
    }
    return {
      puede: false,
      motivo: "navegador",
      mensaje: "Este navegador no admite notificaciones push.",
    };
  }

  if (esIOS() && !esPWAInstalada()) {
    return {
      puede: false,
      motivo: "ios-sin-instalar",
      mensaje: "Para recibir notificaciones en iPhone, agrega Good Barber a tu pantalla de inicio.",
    };
  }

  if (Notification.permission === "denied") {
    return {
      puede: false,
      motivo: "denegado",
      mensaje: "Bloqueaste las notificaciones para Good Barber. Vuelve a permitirlas en los ajustes del navegador.",
    };
  }

  return { puede: true, motivo: null, mensaje: "" };
}

async function registroSW() {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.ready;
}

// ¿Está activado en ESTE dispositivo? Hay que mirar las dos caras: que el
// navegador siga teniendo la suscripción y que esté guardada en la base. Si
// el navegador la perdió, lo que haya en la base no sirve.
export async function estadoActual() {
  const c = capacidades();
  if (!c.puede) return { activo: false, ...c };

  const reg = await registroSW();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return { activo: false, puede: true, motivo: null, mensaje: "" };

  let guardada = false;
  try {
    guardada = await data.existeSuscripcionPush(sub.endpoint);
  } catch {
    // Sin conexión con Supabase no se puede afirmar; se trata como no
    // guardada para que el barbero pueda volver a activarla.
    guardada = false;
  }
  return { activo: guardada, puede: true, motivo: null, mensaje: "", endpoint: sub.endpoint };
}

/* Activar. SOLO se llama desde el botón, dentro del gesto del usuario. */
export async function activar(barberId) {
  const c = capacidades();
  if (!c.puede) throw new Error(c.mensaje);

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("No diste permiso para las notificaciones.");
  }

  const reg = await registroSW();
  if (!reg) throw new Error("El service worker no está listo todavía.");

  // Si ya había una suscripción en este navegador se reutiliza: el endpoint
  // es el mismo y en la base hace upsert, así que no se duplica la fila.
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      // Obligatorio en Chrome: cada push tiene que mostrar una notificación
      // visible. Es también la razón de no usar silent.
      userVisibleOnly: true,
      applicationServerKey: base64UrlABytes(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  await data.guardarSuscripcionPush({
    barberId,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || bytesABase64Url(sub.getKey("p256dh")),
    auth: json.keys?.auth || bytesABase64Url(sub.getKey("auth")),
    userAgent: navigator.userAgent,
    origin: window.location.origin,
  });

  return { endpoint: sub.endpoint };
}

/* Desactivar: solo ESTE dispositivo. Los demás teléfonos del mismo barbero
   siguen recibiendo, que es lo que uno espera al apagarlas en un aparato. */
export async function desactivar() {
  const reg = await registroSW();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return false;

  const endpoint = sub.endpoint;
  // Primero la base: si falla, el navegador conserva la suscripción y el
  // estado sigue siendo coherente.
  await data.borrarSuscripcionPush(endpoint);
  try {
    await sub.unsubscribe();
  } catch {
    /* la fila ya no está; el navegador la soltará por su cuenta */
  }
  return true;
}

// Contador del icono. Se limpia al entrar en la aplicación: el número son las
// citas nuevas sin mirar, no los push recibidos.
export async function limpiarContador() {
  try {
    if (navigator.clearAppBadge) await navigator.clearAppBadge();
    const reg = await registroSW();
    if (reg?.getNotifications) {
      const abiertas = await reg.getNotifications();
      abiertas.forEach((n) => n.close());
    }
  } catch {
    /* mejora progresiva: si no existe, no pasa nada */
  }
}
