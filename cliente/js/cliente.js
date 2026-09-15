// Experiencia pública de Good Barber: arranque, estado e interacción.
//
// Alcance deliberado: SOLO LECTURA de las vistas públicas ya existentes. No
// hay autenticación, no se llama a ningún RPC y no existe aquí ninguna lógica
// de reserva — agendar siempre significa ir al motor ya existente /reservar/.
import { escapeHtml } from "../../js/ui.js";
import { loadPublicData, galleryImages } from "./data.js";
import { icon } from "./icons.js";
import { PromoCard } from "./components.js";
import { initDeck, initNav, initServices, sheetIn, sheetOut } from "./motion.js";
import {
  AppBar, Hero, Services, FeaturedCuts, Gallery, Barbers, Steps, Contact,
  Footer, TabBar, ServiceSheet, Lightbox,
} from "./screens.js";

const root = document.getElementById("app");
const state = { business: null, services: [], barbers: [], cuts: [], slides: [] };
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ===============================================================
   Render
   =============================================================== */

function render() {
  const contact = Contact(state);
  const present = {
    servicios: state.services.length > 0,
    barberos: state.barbers.length > 0,
    contacto: Boolean(contact),
  };

  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="gb-ambient" aria-hidden="true"></div>
    <div class="gb-noise" aria-hidden="true"></div>
    <div class="gb-app">
      ${AppBar(state)}
      <main class="gb-main">
        ${Hero(state)}
        ${PromoCard(state.business)}
        ${Services(state)}
        ${FeaturedCuts(state)}
        ${Gallery(state)}
        ${Barbers(state)}
        ${Steps(state)}
        ${contact}
        ${Footer(state)}
      </main>
      ${TabBar(state, present)}
    </div>
    <div id="gb-overlay"></div>
  `;
  wireAppBarCta();
  wireTabs();
  wireDeck();
  wireNav();
  wireServices();
  wireServiceSheet();
  wireGallery();
  wireCuts();
  wireReveal();
}

/* ===============================================================
   Barra superior: la píldora aparece cuando el CTA de la portada sale
   de pantalla, para que la acción principal esté siempre a un toque.
   =============================================================== */
// La baraja de la portada. El motor de animación vive en motion.js y es
// opcional por diseño: si GSAP no cargara, esto no hace nada y las tarjetas
// se quedan en las posiciones que ya define el CSS.
let deckHandle = null;
// Barra inferior: marcador deslizante y respuesta del botón central.
let navHandle = null;
function wireNav() {
  if (navHandle) { navHandle.destruir(); navHandle = null; }
  const nav = document.querySelector(".gb-tabbar");
  if (nav) navHandle = initNav(nav);
}

// Servicios: respuesta física al tocar. Igual que la baraja y la barra, el
// movimiento vive en motion.js y es opcional.
let svcHandle = null;
function wireServices() {
  if (svcHandle) { svcHandle.destruir(); svcHandle = null; }
  svcHandle = initServices(document);
}

function wireDeck() {
  if (deckHandle) { deckHandle.destruir(); deckHandle = null; }
  const deck = document.querySelector(".gb-deck");
  if (deck) deckHandle = initDeck(deck);
}

function wireAppBarCta() {
  const pill = document.getElementById("gb-appbar-cta");
  const heroCta = document.getElementById("gb-cta-hero");
  if (!pill || !heroCta) return;

  const setVisible = (visible) => {
    pill.classList.toggle("visible", visible);
    pill.setAttribute("aria-hidden", visible ? "false" : "true");
    pill.tabIndex = visible ? 0 : -1;
  };
  if (!("IntersectionObserver" in window)) return setVisible(true);
  new IntersectionObserver(([e]) => setVisible(!e.isIntersecting), { threshold: 0 }).observe(heroCta);
}

/* ===============================================================
   Barra inferior: marca la sección que se está viendo.
   =============================================================== */
function wireTabs() {
  const tabs = [...document.querySelectorAll(".gb-tab")];
  if (!tabs.length) return;

  const mark = (id) =>
    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.classList.toggle("active", on);
      if (on) t.setAttribute("aria-current", "true");
      else t.removeAttribute("aria-current");
    });
  mark("top");

  if (!("IntersectionObserver" in window)) return;
  const seen = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null;
      seen.forEach((ratio, id) => {
        if (ratio > 0 && (!best || ratio > seen.get(best))) best = id;
      });
      if (best) mark(best);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.01, 0.5, 1] }
  );
  tabs.forEach((t) => {
    const section = document.getElementById(t.dataset.tab);
    if (section) observer.observe(section);
  });
}

/* ===============================================================
   Aparición de tarjetas al entrar en pantalla. Es puro adorno: si el
   navegador no soporta IntersectionObserver o el usuario pidió menos
   movimiento, todo queda visible de inmediato.
   =============================================================== */
function wireReveal() {
  const targets = [...document.querySelectorAll("[data-reveal]")];
  if (!targets.length) return;
  if (reduceMotion.matches || !("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("in"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          observer.unobserve(e.target);
        }
      }),
    { rootMargin: "0px 0px -8% 0px", threshold: 0.06 }
  );
  targets.forEach((el) => observer.observe(el));
}

/* ===============================================================
   Detalle de servicio
   =============================================================== */
const overlayState = { lastFocus: null, onKey: null };

function openOverlay(html, { onMount } = {}) {
  const host = document.getElementById("gb-overlay");
  overlayState.lastFocus = document.activeElement;
  host.innerHTML = html;
  host.classList.add("open");
  document.body.classList.add("gb-locked");

  overlayState.onKey = (e) => {
    if (e.key === "Escape") closeOverlay();
    if (e.key !== "Tab") return;
    // El foco se queda dentro de la hoja mientras está abierta.
    const focusables = host.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener("keydown", overlayState.onKey);
  host.querySelectorAll("[data-close-sheet], [data-close-lb]").forEach((el) =>
    el.addEventListener("click", closeOverlay)
  );
  sheetIn(host);
  if (onMount) onMount(host);
  const target = host.querySelector("[data-autofocus]") || host.querySelector("button, a[href]");
  if (target) target.focus({ preventScroll: true });
}

function closeOverlay() {
  const host = document.getElementById("gb-overlay");
  if (!host || !host.classList.contains("open")) return;
  document.removeEventListener("keydown", overlayState.onKey);

  const finish = () => {
    host.classList.remove("open", "closing");
    host.innerHTML = "";
    document.body.classList.remove("gb-locked");
    if (overlayState.lastFocus && document.contains(overlayState.lastFocus)) {
      overlayState.lastFocus.focus({ preventScroll: true });
    }
  };
  host.classList.add("closing");
  // sheetOut resuelve al terminar; sin GSAP o con movimiento reducido
  // devuelve una promesa ya resuelta y el cierre es inmediato.
  Promise.resolve(sheetOut(host)).then(finish);
}

function wireServiceSheet() {
  document.querySelectorAll("[data-service]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const service = state.services.find((s) => s.id === btn.dataset.service);
      if (!service) return;
      openOverlay(ServiceSheet(service, state));
    })
  );
}

/* ===============================================================
   Galería
   =============================================================== */
function wireGallery() {
  const shots = galleryImages(state.business);
  if (!shots.length) return;
  document.querySelectorAll("[data-gallery]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.gallery);
      if (!shots[i]) return;
      openOverlay(Lightbox(shots[i], i, shots.length));
    })
  );
}

// Cortes destacados: al tocar una lámina se abre a tamaño completo en el
// mismo visor que ya usa la galería. El visor encaja la imagen entera
// (object-fit: contain), así que la lámina se ve tal cual fue creada.
function wireCuts() {
  const cuts = state.cuts || [];
  if (!cuts.length) return;
  document.querySelectorAll("[data-cut]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.cut);
      const corte = cuts[i];
      if (!corte?.image_url) return;
      openOverlay(Lightbox(corte.image_url, i, cuts.length, corte.name));
    })
  );
}

/* ===============================================================
   Estados
   =============================================================== */
function renderSkeleton() {
  root.setAttribute("aria-busy", "true");
  root.innerHTML = `
    <div class="gb-app gb-app-state" role="status" aria-live="polite">
      <span class="sr-only">Cargando la información de la barbería…</span>
      <div class="gb-skel gb-skel-hero"></div>
      <div class="gb-skel gb-skel-row"></div>
      <div class="gb-skel gb-skel-card"></div>
      <div class="gb-skel gb-skel-card"></div>
    </div>
  `;
}

function renderError(message) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="gb-app gb-app-state">
      <div class="gb-state">
        <span class="gb-state-ico" aria-hidden="true">${icon("spark")}</span>
        <h2>No pudimos cargar la página</h2>
        <p>${escapeHtml(message || "Revisa tu conexión e inténtalo de nuevo.")}</p>
        <button type="button" class="gb-btn gb-btn-hero" id="gb-retry">
          <span class="gb-btn-label">Reintentar</span>
          <span class="gb-btn-go">${icon("arrow")}</span>
        </button>
      </div>
    </div>
  `;
  root.querySelector("#gb-retry").addEventListener("click", boot);
}

/* ===============================================================
   Arranque
   =============================================================== */
async function boot() {
  renderSkeleton();
  try {
    const data = await loadPublicData();
    state.business = data.business;
    state.services = data.services;
    state.barbers = data.barbers;
    state.cuts = data.cuts || [];
    state.slides = data.slides || [];
    render();
  } catch (error) {
    renderError(error?.message);
  }
}

boot();
