"use client";

import { useEffect } from "react";

/** Registra el service worker (solo en producción; en desarrollo estorba). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin SW la app sigue funcionando; solo pierde el arranque rápido sin red.
    });
  }, []);
  return null;
}
