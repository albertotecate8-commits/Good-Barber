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

export function toast(message, type = "info") {
  if (!toastContainer) return;
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
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
    const close = (result) => {
      overlay.remove();
      resolve(result);
    };
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
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", close));
  if (onMount) onMount(overlay, close);
  return { overlay, close };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function friendlyError(error) {
  const msg = String(error?.message || error || "");
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
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
