// Componentes de interfaz reutilizables: iconos, hojas modales, avisos y
// animación de confirmación de pago.

import { esc } from "./format.js";

/* ============================================================== Iconos === */

const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20h14V9.8"/>',
  expense: '<path d="M4 7h16v13H4z"/><path d="M4 11h16"/><path d="M9 16h6"/>',
  income: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  debt: '<path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 15.5z"/><path d="M16 12.5h2"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4"/><path d="M16 3v4"/><path d="M3 10h18"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v5h5"/><path d="M12 8v4.5l3 1.8"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1.1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.11A1.7 1.7 0 0 0 4.67 8.6a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.49 1.5z"/>',
  wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a1 1 0 0 1 1 1v2"/><path d="M3 7.5V17a3 3 0 0 0 3 3h13a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H6a3 3 0 0 1-3-2.5z"/><circle cx="17" cy="14.5" r="1.2"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/>',
  upload: '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 4h16"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/>',
  alert: '<path d="M12 8v5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>',
  tag: '<path d="M3 11V4h7l11 11-7 7z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6" fill="currentColor"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.7 4.5"/><path d="M20 4v7h-7"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10.5 19a1.8 1.8 0 0 0 3 0"/>',
  filter: '<path d="M3 5h18"/><path d="M6 12h12"/><path d="M10 19h4"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  send: '<path d="M4 12 20 4l-4 16-4.5-6.5z"/><path d="m11.5 13.5 8.5-9.5"/>',
};

export function icon(name, size, strokeWidth) {
  const d = PATHS[name] || PATHS.info;
  const s = size || 20;
  return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="${strokeWidth || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

/* ============================================================== Toasts === */

let toastTimer = null;

export function toast(message, kind) {
  const root = document.getElementById("toast-root");
  if (!root) return;

  const el = document.createElement("div");
  el.className = `toast ${kind || ""}`;
  const glyph = kind === "err" ? "alert" : "check";
  el.innerHTML = `<span class="ic">${icon(glyph, 17, 2.4)}</span><span>${esc(message)}</span>`;
  root.innerHTML = "";
  root.appendChild(el);

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

/** Animación breve al confirmar un pago o un cobro. */
export function celebrate(title, amount) {
  const root = document.getElementById("confetti-root");
  if (!root) return;
  root.innerHTML = `
    <div class="pay-ok">
      <div class="ring">${icon("check", 30, 3)}</div>
      <div class="t">${esc(title)}</div>
      <div class="v num">${esc(amount)}</div>
    </div>`;
  setTimeout(() => { root.innerHTML = ""; }, 1500);
}

/* =============================================================== Sheets == */

let openSheet = null;

/**
 * Abre una hoja modal. `render(close)` devuelve el HTML interno.
 * `onMount(root, close)` recibe el nodo para enlazar eventos.
 */
export function sheet({ title, subtitle, body, onMount, dismissible = true }) {
  closeSheet(true);

  const root = document.getElementById("sheet-root");
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title || "")}">
      <div class="sheet-grab"></div>
      ${title ? `<div class="sheet-head">
        <div class="grow">
          <div class="sheet-title">${esc(title)}</div>
          ${subtitle ? `<div class="sheet-sub">${esc(subtitle)}</div>` : ""}
        </div>
        <button class="sheet-close" data-close aria-label="Cerrar">${icon("close", 17, 2.2)}</button>
      </div>` : ""}
      <div class="sheet-body"></div>
    </div>`;

  root.appendChild(backdrop);
  document.body.style.overflow = "hidden";

  const panel = backdrop.querySelector(".sheet");
  const bodyEl = backdrop.querySelector(".sheet-body");
  bodyEl.innerHTML = typeof body === "function" ? body() : body || "";

  const close = () => closeSheet();

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop && dismissible) close();
    if (e.target.closest("[data-close]")) close();
  });

  const onKey = (e) => { if (e.key === "Escape" && dismissible) close(); };
  document.addEventListener("keydown", onKey);

  openSheet = { backdrop, onKey };

  if (typeof onMount === "function") onMount(panel, close);

  // Enfoca el primer campo para poder escribir de inmediato (solo escritorio;
  // en móvil se evita que el teclado tape la hoja al abrirse).
  if (window.matchMedia("(min-width: 640px)").matches) {
    const first = panel.querySelector("input:not([type=hidden]), textarea, select");
    if (first) setTimeout(() => first.focus(), 60);
  }

  return close;
}

export function closeSheet(immediate) {
  if (!openSheet) return;
  const { backdrop, onKey } = openSheet;
  openSheet = null;
  document.removeEventListener("keydown", onKey);
  document.body.style.overflow = "";

  if (immediate) {
    backdrop.remove();
    return;
  }
  backdrop.classList.add("is-closing");
  setTimeout(() => backdrop.remove(), 240);
}

/** Confirmación con promesa. Devuelve true/false. */
export function confirmSheet({ title, message, confirmText, cancelText, danger }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    sheet({
      title,
      body: `
        <p class="muted" style="font-size:14.5px;line-height:1.5">${esc(message)}</p>
        <div class="sheet-actions">
          <button class="btn ${danger ? "btn-danger" : "btn-ink"}" data-yes>${esc(confirmText || "Confirmar")}</button>
          <button class="btn btn-outline" data-no>${esc(cancelText || "Cancelar")}</button>
        </div>`,
      onMount: (panel, close) => {
        panel.querySelector("[data-yes]").addEventListener("click", () => { done(true); close(); });
        panel.querySelector("[data-no]").addEventListener("click", () => { done(false); close(); });
        panel.closest(".sheet-backdrop").addEventListener("click", (e) => {
          if (e.target.classList.contains("sheet-backdrop")) done(false);
        });
      },
    });
  });
}

/* ============================================================ Fragmentos = */

export function empty(title, description, glyph) {
  return `
    <div class="empty">
      <div class="ic">${icon(glyph || "wallet", 24)}</div>
      <div class="t">${esc(title)}</div>
      ${description ? `<div class="d">${esc(description)}</div>` : ""}
    </div>`;
}

export function statusChip(key) {
  const map = {
    paid: ["paid", "Pagado"],
    received: ["paid", "Recibido"],
    overdue: ["overdue", "Vencido"],
    pending: ["pending", "Pendiente"],
  };
  const [cls, label] = map[key] || map.pending;
  return `<span class="chip ${cls}">${label}</span>`;
}

/** Delegación de clics por atributo data-action dentro de un contenedor. */
export function onAction(root, handlers) {
  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target || !root.contains(target)) return;
    const action = target.dataset.action;
    const handler = handlers[action];
    if (!handler) return;
    event.preventDefault();
    handler(target.dataset, target, event);
  });
}
