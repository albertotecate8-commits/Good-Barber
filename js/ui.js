// Componentes de interfaz compartidos: toasts, modales de confirmación, overlay de carga.

let toastContainer;
let modalRoot;
let loadingOverlay;
let connectionBanner;

export function mountUiRoots() {
  toastContainer = document.getElementById("toast-container");
  modalRoot = document.getElementById("modal-root");
  loadingOverlay = document.getElementById("loading-overlay");
  connectionBanner = document.getElementById("connection-banner");
  window.addEventListener("online", updateConnectionBanner);
  window.addEventListener("offline", updateConnectionBanner);
  updateConnectionBanner();
}

function updateConnectionBanner() {
  if (!connectionBanner) return;
  if (navigator.onLine) {
    connectionBanner.classList.add("hidden");
  } else {
    connectionBanner.classList.remove("hidden");
    connectionBanner.textContent = "Sin conexión a internet — los cambios no se están guardando.";
  }
}

const TOAST_ICONS = { success: "✓", error: "✕", info: "i" };

export function toast(message, type = "info") {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.info}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast-in"));
  setTimeout(() => {
    el.classList.remove("toast-in");
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

export function showLoading(show = true, label = "Cargando…") {
  if (!loadingOverlay) return;
  loadingOverlay.querySelector(".loading-label").textContent = label;
  loadingOverlay.classList.toggle("hidden", !show);
}

// Cierra un overlay reproduciendo su animación de salida (definida en CSS)
// antes de quitarlo del DOM, en vez de desaparecer de golpe. Con
// prefers-reduced-motion la duración de esa animación baja a ~0, así que
// esto se resuelve casi al instante sin necesidad de una rama aparte.
function closeOverlayAnimated(overlay, after) {
  overlay.classList.add("closing");
  const box = overlay.querySelector(".modal-box");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    overlay.remove();
    if (after) after();
  };
  if (box) box.addEventListener("animationend", finish, { once: true });
  else overlay.addEventListener("animationend", finish, { once: true });
  setTimeout(finish, 400); // respaldo por si el evento no llega a disparar
}

export function confirmDialog({ title = "Confirmar", message = "", confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${escapeHtml(title)}</h3>
        <p class="modal-message">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    modalRoot.appendChild(overlay);
    const close = (result) => closeOverlayAnimated(overlay, () => resolve(result));
    overlay.querySelector('[data-action="cancel"]').addEventListener("click", () => close(false));
    overlay.querySelector('[data-action="confirm"]').addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });
    overlay.querySelector('[data-action="confirm"]').focus();
  });
}

export function openModal(innerHtml, { onMount } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal-box modal-box-lg" role="dialog" aria-modal="true">${innerHtml}</div>`;
  modalRoot.appendChild(overlay);
  const close = () => closeOverlayAnimated(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", close));
  if (onMount) onMount(overlay, close);
  return { overlay, close };
}

// Anima el texto de un elemento de $0.00 (o su valor actual) hasta el nuevo
// total, puramente visual — nunca recalcula ni toca datos, solo interpola el
// número que ya se calculó en JS de negocio y lo formatea con formatCents.
export function animateNumberText(el, fromCents, toCents, formatCents, duration = 320) {
  if (!el) return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || fromCents === toCents) {
    el.textContent = formatCents(toCents);
    return;
  }
  const start = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const value = Math.round(fromCents + (toCents - fromCents) * ease(t));
    el.textContent = formatCents(value);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =========================================================
// DIAGNÓSTICO TEMPORAL — quitar una vez resuelto el problema de conexión
// con Supabase. Extrae el detalle técnico real de un error (sin mostrar
// nunca contraseñas ni claves) para saber si es un fallo de red/CORS antes
// de llegar a Supabase, o una respuesta real de Supabase con otro problema.
// =========================================================
export function diagnoseSupabaseError(context, error) {
  const isNetworkLevel =
    error?.name === "AuthRetryableFetchError" || error?.status === 0 || error?.status === undefined;
  return {
    context,
    name: error?.name || error?.constructor?.name || null,
    message: String(error?.message || error || ""),
    status: error?.status ?? null,
    code: error?.code ?? null,
    isNetworkLevel,
    supabaseUrl: window.__SUPABASE_URL_FOR_DIAGNOSTICS__ || null,
  };
}

export function formatDiagnostics(details) {
  return [
    `Contexto: ${details.context}`,
    `Nombre del error: ${details.name || "—"}`,
    `Status HTTP: ${details.status ?? "— (sin respuesta HTTP)"}`,
    `Código: ${details.code || "—"}`,
    `Mensaje: ${details.message}`,
    `¿Bloqueado antes de llegar a Supabase (red/CORS)?: ${details.isNetworkLevel ? "Sí" : "No — Supabase respondió"}`,
    `URL de Supabase: ${details.supabaseUrl || "—"}`,
  ].join("\n");
}

export function friendlyError(error) {
  const msg = String(error?.message || error || "");
  // "Failed to fetch" es el mensaje de Chrome/V8 para un fetch() que no pudo
  // completarse a nivel de red; "Load failed" es el equivalente exacto en
  // Safari/WebKit (iOS incluido) para el mismo tipo de fallo.
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
    return "No hay conexión con el servidor. Verifica tu internet e inténtalo de nuevo.";
  }
  if (msg.includes("Invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("JWT") || msg.includes("session") || msg.includes("refresh_token")) {
    return "Tu sesión expiró. Inicia sesión de nuevo.";
  }
  if (msg.toLowerCase().includes("permission") || msg.includes("row-level security") || msg.includes("policy")) {
    return "No tienes permiso para realizar esta acción.";
  }
  if (!msg) return "Ocurrió un error inesperado. Inténtalo de nuevo.";
  return msg;
}
