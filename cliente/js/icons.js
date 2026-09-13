// Iconografía de la app: SVG de trazo, heredan currentColor y escalan sin
// perder nitidez. Nada de emoji en el chrome de la interfaz — los pinta el
// sistema a todo color y rompen la paleta negro/dorado.
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.4V20h13V9.4"/>',
  scissors:
    '<circle cx="6" cy="6" r="2.8"/><circle cx="6" cy="18" r="2.8"/><path d="M20 4 8.4 15.6"/><path d="M14.6 14.6 20 20"/><path d="M8.4 8.4 12 12"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  pin: '<path d="M12 21s6.8-5.6 6.8-11a6.8 6.8 0 1 0-13.6 0C5.2 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.5"/>',
  cal: '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3"/><path d="M8 3v4M16 3v4M3.6 10.4h16.8"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>',
  phone:
    '<path d="M6.3 3.6h3l1.5 3.8-2 1.3a11.4 11.4 0 0 0 5.5 5.5l1.3-2 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8A15.8 15.8 0 0 1 4.5 5.6a1.8 1.8 0 0 1 1.8-2Z"/>',
  chat: '<path d="M20.4 12.2c0 3.9-3.8 7-8.4 7a9.6 9.6 0 0 1-2.6-.35L4.6 20.4l1.35-4.1a6.6 6.6 0 0 1-2.35-4.9c0-3.9 3.8-7 8.4-7s8.4 3.1 8.4 7Z"/>',
  instagram:
    '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle cx="12" cy="12" r="3.7"/><circle cx="17" cy="7" r="1"/>',
  arrow: '<path d="M5 12h13"/><path d="m12.6 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12"/><path d="M18 6 6 18"/>',
  // Rasuradora: cabezal con peine + mango. Las versiones diagonales tipo
  // navaja se leían como un lápiz a 22px; esta silueta en T no es ambigua.
  razor: '<rect x="3.6" y="4.2" width="16.8" height="4" rx="1.8"/><path d="M7.4 4.2V2.6M12 4.2V2.6M16.6 4.2V2.6"/><path d="M12 8.2v2.2"/><rect x="10.2" y="10.4" width="3.6" height="10.4" rx="1.8"/>',
  spark: '<path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18.1l-1.8-5.5L4.7 10.8 10.2 9Z"/>',
  calendar: '<rect x="3.6" y="5.2" width="16.8" height="15.2" rx="3"/><path d="M8 3v4M16 3v4M3.6 10.4h16.8"/>',
  ticket: '<path d="M4 8.2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.6a2.2 2.2 0 0 0 0 4.4v1.6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.6a2.2 2.2 0 0 0 0-4.4Z"/><path d="M14 7.4v9.2"/>',
  pole: '<rect x="8.2" y="3.4" width="7.6" height="17.2" rx="3.8"/><path d="M8.4 9.6 15.6 5.2M8.4 14.4l7.2-4.4M8.4 19l7.2-4.4"/>',
  comb: '<path d="M3.6 8.4h16.8v3.2a6 6 0 0 1-6 6h-4.8a6 6 0 0 1-6-6Z"/><path d="M7.2 8.4V4.6M12 8.4V4.6M16.8 8.4V4.6"/>',
  // PASO 6 — piezas que necesita el flujo de reserva.
  check: '<path d="m5 12.6 4.6 4.6L19 7"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5"/><path d="M12 7.9v.1"/>',
  alert: '<path d="M12 4.2 21 19.8H3Z"/><path d="M12 10.4v4"/><path d="M12 17.3v.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/>',
  moon: '<path d="M20.4 14.6A8.8 8.8 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11Z"/>',
};

export function icon(name, cls = "") {
  return `<svg class="gb-svg ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}

// El campo `icon` de public_services guarda un emoji elegido desde el panel.
// La interfaz pública no pinta emoji —los colorea el sistema y rompen la
// paleta—, así que se traduce al icono vectorial equivalente. Si el emoji no
// está en la tabla, se usa la tijera: nunca se inventa un significado nuevo.
const EMOJI_A_SVG = {
  "✂️": "scissors", "✂": "scissors", "💇": "scissors", "💇‍♂️": "scissors",
  "🪒": "razor", "🧔": "razor", "🧔‍♂️": "razor",
  "💈": "pole",
  "🧴": "comb", "💆": "comb", "💆‍♂️": "comb", "🪮": "comb",
  "⏱️": "clock", "🕐": "clock",
};

export function iconForService(emoji) {
  if (typeof emoji !== "string") return "scissors";
  const limpio = emoji.trim();
  return EMOJI_A_SVG[limpio] || EMOJI_A_SVG[limpio.replace(/\uFE0F/g, "")] || "scissors";
}

export function iconFilled(name, cls = "") {
  return `<svg class="gb-svg ${cls}" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}
