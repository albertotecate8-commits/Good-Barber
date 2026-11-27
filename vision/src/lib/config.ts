/** Parámetros de interpretación de estado. Ajustables sin tocar la base. */
export const STATUS_THRESHOLDS = {
  /** Sin latido del motor en este tiempo → motor desconectado. */
  engineOfflineAfterMs: 3 * 60_000,
  /** Sin "visto por última vez" de la cámara en este tiempo → desconectada. */
  cameraOfflineAfterMs: 2 * 60_000,
  /** Días hacia atrás para calcular horas de mayor afluencia. */
  peakHoursLookbackDays: 7,
} as const;

/** Enlace a la app oficial TP-Link Tapo en App Store (abre la app si ya está instalada). */
export const TAPO_APP_STORE_URL = "https://apps.apple.com/mx/app/tp-link-tapo/id1472718009";

export const APP_NAME = "Smart Business Vision";
export const APP_VERSION = "0.1.0 · Etapa 1";
