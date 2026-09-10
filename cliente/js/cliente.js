// Experiencia pública del cliente. SOLO LECTURA y SOLO de las vistas públicas
// ya existentes: public_business, public_services y public_barbers.
// No toca autenticación, ventas, reparto, agenda administrativa ni clientes
// administrativos, y no implementa ninguna reserva: el único camino para
// agendar es el motor ya existente en /reservar/, al que esta pantalla enlaza.
//
// Regla que se respeta en todo el archivo: nada se inventa. Cada bloque
// (portada, promoción, servicios, barberos, dirección, teléfono, WhatsApp,
// Instagram) se dibuja únicamente si el dato real existe en Supabase; si no
// existe, la sección entera no aparece — ni siquiera la pestaña que la
// apunta en la barra inferior.
import { escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";

function sb() {
  return window.supabaseClient;
}

const BOOKING_URL = "../reservar/";
const root = document.getElementById("app");

const state = { business: null, services: [], barbers: [] };

/* ===============================================================
   Utilidades de presentación
   =============================================================== */

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// El teléfono/WhatsApp se guarda tal cual lo escribió la barbería; para el
// enlace se usan solo sus dígitos, sin alterar el dato mostrado en pantalla.
function digitsOf(value) {
  return String(value || "").replace(/\D/g, "");
}

// Una URL que se inserta dentro de url('…') tiene que llevar codificados los
// caracteres que cerrarían la comilla o el paréntesis del CSS, y hay que
// hacerlo ANTES de escapar el HTML: si se escapa primero, el navegador
// devuelve la comilla al parsear el atributo style, la declaración CSS queda
// inválida y la foto desaparece sin dar ningún error.
function cssUrl(value) {
  return encodeURI(String(value))
    .replace(/'/g, "%27")
    .replace(/"/g, "%22")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function instagramUrl(value) {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://instagram.com/${raw.replace(/^@/, "")}`;
}

function instagramLabel(value) {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) {
    const handle = raw.replace(/\/+$/, "").split("/").pop();
    return handle ? `@${handle}` : "Instagram";
  }
  return raw.startsWith("@") ? raw : `@${raw}`;
}

/* ===============================================================
   Iconografía de la app. Se dibuja en SVG con currentColor en vez de
   usar emoji: los emoji los pinta el sistema a todo color y rompían la
   paleta oscuro/dorado en la barra inferior y en la portada.
   =============================================================== */
const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.4V20h13V9.4"/>',
  scissors: '<circle cx="6" cy="6" r="2.8"/><circle cx="6" cy="18" r="2.8"/><path d="M20 4 8.4 15.6"/><path d="M14.6 14.6 20 20"/><path d="M8.4 8.4 12 12"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
  pin: '<path d="M12 21s6.8-5.6 6.8-11a6.8 6.8 0 1 0-13.6 0C5.2 15.4 12 21 12 21Z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 1.8"/>',
  phone: '<path d="M6.3 3.6h3l1.5 3.8-2 1.3a11.4 11.4 0 0 0 5.5 5.5l1.3-2 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8A15.8 15.8 0 0 1 4.5 5.6a1.8 1.8 0 0 1 1.8-2Z"/>',
  chat: '<path d="M20.4 12.2c0 3.9-3.8 7-8.4 7a9.6 9.6 0 0 1-2.6-.35L4.6 20.4l1.35-4.1a6.6 6.6 0 0 1-2.35-4.9c0-3.9 3.8-7 8.4-7s8.4 3.1 8.4 7Z"/>',
  instagram: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle cx="12" cy="12" r="3.7"/><circle cx="17" cy="7" r="1"/>',
};

function icon(name) {
  return `<svg class="cl-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;
}

function businessName() {
  return state.business?.business_name || "Good Barber";
}

// Marca: el logo real si la barbería subió uno, y si no el emblema tipográfico.
function markHTML(size) {
  const b = state.business;
  if (hasText(b?.logo_url)) {
    return `<img class="cl-mark cl-mark-img cl-mark-${size}" src="${escapeHtml(b.logo_url)}" alt="${escapeHtml(businessName())}">`;
  }
  return `<span class="cl-mark cl-mark-${size}" aria-hidden="true">GB</span>`;
}

/* ===============================================================
   Barra superior de la app
   =============================================================== */

function appBarHTML() {
  return `
    <header class="cl-appbar">
      <div class="cl-appbar-brand">
        ${markHTML("xs")}
        <span class="cl-appbar-name">${escapeHtml(businessName())}</span>
      </div>
      ${
        state.business?.booking_enabled
          ? `<a class="cl-appbar-cta" href="${BOOKING_URL}" id="cl-appbar-cta" tabindex="-1" aria-hidden="true">Agendar</a>`
          : ""
      }
    </header>
  `;
}

/* ===============================================================
   Portada
   =============================================================== */

function heroHTML() {
  const b = state.business;
  const name = escapeHtml(businessName());
  const open = b?.booking_enabled;
  const photo = hasText(b?.hero_image_url);

  // La etiqueta superior usa el tagline real. Si es largo no se convierte en
  // versalitas (quedaría en tres renglones diminutos): baja a la línea de
  // descripción, en caja normal.
  const tagline = hasText(b?.tagline) ? b.tagline.trim() : "";
  const taglineIsShort = tagline.length > 0 && tagline.length <= 28;

  return `
    <section class="cl-hero" id="top">
      <div class="cl-hero-card">
        ${
          photo
            ? `<div class="cl-hero-media" style="background-image:url('${escapeHtml(cssUrl(b.hero_image_url))}')" role="img" aria-label="${name}"></div>`
            : `<div class="cl-hero-media cl-hero-media-blank" aria-hidden="true"><span class="cl-hero-ghost">GB</span></div>`
        }
        <div class="cl-hero-scrim" aria-hidden="true"></div>
        <span class="cl-hero-badge" aria-hidden="true">${icon("scissors")}</span>

        <div class="cl-hero-body">
          ${taglineIsShort ? `<span class="cl-hero-eyebrow">${escapeHtml(tagline)}</span>` : ""}
          <h1 class="cl-hero-title">${name}</h1>
          ${!taglineIsShort && tagline ? `<p class="cl-hero-lead">${escapeHtml(tagline)}</p>` : ""}
          <p class="cl-hero-lead">Reserva en línea en menos de un minuto. Sin llamadas y sin crear cuenta.</p>
          ${
            b?.promo_active && hasText(b?.promo_text)
              ? `<div class="cl-promo"><span class="cl-promo-dot" aria-hidden="true"></span>${escapeHtml(b.promo_text)}</div>`
              : ""
          }
          ${
            open
              ? `<a class="cl-cta" href="${BOOKING_URL}" id="cl-cta-hero">
                   <span class="cl-cta-label">Agendar mi cita</span>
                   <span class="cl-cta-go" aria-hidden="true">→</span>
                 </a>`
              : `<div class="cl-closed" role="status">
                   <strong>Reservas en línea no disponibles por ahora</strong>
                   <span>${hasText(b?.phone) ? `Llámanos al ${escapeHtml(b.phone)} para agendar.` : "Vuelve a intentarlo más tarde."}</span>
                 </div>`
          }
        </div>
      </div>
      ${
        open
          ? `<ul class="cl-chiprow">
               ${["Sin registro", "Horarios reales", "Código al instante"]
                 .map((t) => `<li class="cl-chip"><span class="cl-chip-dot" aria-hidden="true"></span>${t}</li>`)
                 .join("")}
             </ul>`
          : ""
      }
    </section>
  `;
}

function sectionHead(title, count) {
  return `
    <div class="cl-sechead">
      <h2>${title}</h2>
      ${count != null ? `<span class="cl-count">${count}</span>` : ""}
    </div>
  `;
}

/* ===============================================================
   Servicios
   =============================================================== */

function servicesHTML() {
  if (state.services.length === 0) return "";
  return `
    <section class="cl-section" id="servicios" aria-label="Servicios">
      ${sectionHead("Servicios", state.services.length)}
      <div class="cl-service-list">
        ${state.services
          .map(
            (s) => `
          <article class="cl-svc">
            <span class="cl-svc-icon${hasText(s.icon) ? "" : " cl-svc-icon-svg"}" aria-hidden="true">${hasText(s.icon) ? escapeHtml(s.icon) : icon("scissors")}</span>
            <div class="cl-svc-main">
              <h3 class="cl-svc-name">${escapeHtml(s.name)}</h3>
              ${hasText(s.description) ? `<p class="cl-svc-desc">${escapeHtml(s.description)}</p>` : ""}
              ${s.duration_minutes ? `<span class="cl-svc-time">${icon("clock")}${s.duration_minutes} min</span>` : ""}
            </div>
            <span class="cl-svc-price">${formatCents(s.price_cents)}</span>
          </article>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

/* ===============================================================
   Barberos
   =============================================================== */

function barbersHTML() {
  if (state.barbers.length === 0) return "";
  return `
    <section class="cl-section" id="barberos" aria-label="Barberos">
      ${sectionHead("Nuestros barberos", state.barbers.length)}
      <div class="cl-barber-list" data-rail>
        ${state.barbers
          .map(
            (b) => `
          <article class="cl-brb">
            <div class="cl-brb-photo${hasText(b.photo_url) ? "" : " cl-brb-photo-blank"}">
              ${
                hasText(b.photo_url)
                  ? `<img src="${escapeHtml(b.photo_url)}" alt="${escapeHtml(b.name)}" loading="lazy">`
                  : `<span class="cl-brb-monogram" aria-hidden="true">${escapeHtml(initials(b.name))}</span>`
              }
              <span class="cl-brb-shade" aria-hidden="true"></span>
            </div>
            <div class="cl-brb-info">
              <h3 class="cl-brb-name">${escapeHtml(b.name)}</h3>
              ${hasText(b.bio) ? `<p class="cl-brb-bio">${escapeHtml(b.bio)}</p>` : ""}
            </div>
          </article>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

/* ===============================================================
   Cómo reservar (describe el flujo real de /reservar/)
   =============================================================== */

function stepsHTML() {
  if (!state.business?.booking_enabled) return "";
  const steps = [["01", "Elige servicio y barbero"], ["02", "Escoge fecha y hora"], ["03", "Confirma tu cita"]];
  return `
    <section class="cl-section" id="pasos" aria-label="Cómo reservar">
      ${sectionHead("Cómo reservar")}
      <ol class="cl-steps">
        ${steps.map(([n, t]) => `<li class="cl-step"><span class="cl-step-num" aria-hidden="true">${n}</span><span class="cl-step-text">${t}</span></li>`).join("")}
      </ol>
    </section>
  `;
}

/* ===============================================================
   Ubicación y contacto
   =============================================================== */

function contactHTML() {
  const b = state.business || {};
  const cards = [];

  if (hasText(b.phone) && digitsOf(b.phone)) {
    cards.push(contactCard("phone", "Teléfono", b.phone, `tel:${digitsOf(b.phone)}`, false));
  }
  if (hasText(b.whatsapp) && digitsOf(b.whatsapp)) {
    cards.push(contactCard("chat", "WhatsApp", b.whatsapp, `https://wa.me/${digitsOf(b.whatsapp)}`, true));
  }
  if (hasText(b.instagram)) {
    cards.push(contactCard("instagram", "Instagram", instagramLabel(b.instagram), instagramUrl(b.instagram), true));
  }

  const hasAddress = hasText(b.address);
  if (!hasAddress && cards.length === 0) return "";

  return `
    <section class="cl-section" id="contacto" aria-label="Ubicación y contacto">
      ${sectionHead("Ubicación y contacto")}
      ${
        hasAddress
          ? `<div class="cl-address">
               <span class="cl-ico" aria-hidden="true">${icon("pin")}</span>
               <div class="cl-address-body">
                 <span class="cl-label">Ubicación</span>
                 <p class="cl-address-text">${escapeHtml(b.address)}</p>
                 <a class="cl-address-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank" rel="noopener noreferrer">Ver en el mapa<span aria-hidden="true">→</span></a>
               </div>
             </div>`
          : ""
      }
      ${cards.length ? `<div class="cl-contact-list">${cards.join("")}</div>` : ""}
    </section>
  `;
}

function contactCard(iconName, label, value, href, external) {
  const target = external ? ` target="_blank" rel="noopener noreferrer"` : "";
  return `
    <a class="cl-contact" href="${escapeHtml(href)}"${target}>
      <span class="cl-ico" aria-hidden="true">${icon(iconName)}</span>
      <span class="cl-contact-text">
        <span class="cl-label">${label}</span>
        <span class="cl-contact-value">${escapeHtml(value)}</span>
      </span>
      <span class="cl-contact-go" aria-hidden="true">→</span>
    </a>
  `;
}

function footerHTML() {
  const name = escapeHtml(businessName());
  return `
    <footer class="cl-footer">
      ${markHTML("sm")}
      <p class="cl-footer-name">${name}</p>
      <p class="cl-footer-note">© ${new Date().getFullYear()} ${name}</p>
    </footer>
  `;
}

/* ===============================================================
   Barra inferior. Solo lleva pestañas de secciones que existen de
   verdad en la página, y el botón central va al motor de reservas
   real: no hay navegación decorativa.
   =============================================================== */

function tabBarHTML(hasContact) {
  const tabs = [{ href: "#top", icon: "home", label: "Inicio" }];
  if (state.services.length) tabs.push({ href: "#servicios", icon: "scissors", label: "Servicios" });
  if (state.barbers.length) tabs.push({ href: "#barberos", icon: "user", label: "Barberos" });
  if (hasContact) tabs.push({ href: "#contacto", icon: "pin", label: "Contacto" });

  const items = tabs.map(
    (t) => `
    <a class="cl-tab" href="${t.href}" data-tab="${t.href.slice(1)}">
      <span class="cl-tab-icon" aria-hidden="true">${icon(t.icon)}</span>
      <span class="cl-tab-label">${t.label}</span>
    </a>`
  );

  if (state.business?.booking_enabled) {
    const fab = `
      <a class="cl-fab" href="${BOOKING_URL}" id="cl-fab" aria-label="Agendar mi cita">
        <span class="cl-fab-icon" aria-hidden="true">${icon("scissors")}</span>
        <span class="cl-fab-label">Agendar</span>
      </a>`;
    items.splice(Math.ceil(items.length / 2), 0, fab);
  }

  return `<nav class="cl-tabbar" aria-label="Secciones">${items.join("")}</nav>`;
}

/* ===============================================================
   Render
   =============================================================== */

function render() {
  const contact = contactHTML();
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="cl-page">
      ${appBarHTML()}
      <div class="cl-main">
        ${heroHTML()}
        ${servicesHTML()}
        ${barbersHTML()}
        ${stepsHTML()}
        ${contact}
        ${footerHTML()}
      </div>
      ${tabBarHTML(Boolean(contact))}
    </div>
  `;
  wireAppBarCta();
  wireTabs();
}

// La píldora "Agendar" de la barra superior aparece cuando el CTA grande de
// la portada ya salió de pantalla, para que la acción principal esté siempre
// a un toque sin duplicarse visualmente. Es el mismo enlace.
function wireAppBarCta() {
  const pill = document.getElementById("cl-appbar-cta");
  const heroCta = document.getElementById("cl-cta-hero");
  if (!pill || !heroCta) return;

  const setVisible = (visible) => {
    pill.classList.toggle("visible", visible);
    pill.setAttribute("aria-hidden", visible ? "false" : "true");
    pill.tabIndex = visible ? 0 : -1;
  };

  if (!("IntersectionObserver" in window)) {
    setVisible(true);
    return;
  }
  new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), { threshold: 0 }).observe(heroCta);
}

// Marca en la barra inferior la sección que se está viendo.
function wireTabs() {
  const tabs = [...document.querySelectorAll(".cl-tab")];
  if (tabs.length === 0) return;

  const mark = (id) => {
    tabs.forEach((t) => {
      const on = t.dataset.tab === id;
      t.classList.toggle("active", on);
      if (on) t.setAttribute("aria-current", "true");
      else t.removeAttribute("aria-current");
    });
  };
  mark("top");

  if (!("IntersectionObserver" in window)) return;
  const sections = tabs.map((t) => document.getElementById(t.dataset.tab)).filter(Boolean);
  const visible = new Map();
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
      let best = null;
      visible.forEach((ratio, id) => {
        if (ratio > 0 && (!best || ratio > visible.get(best))) best = id;
      });
      if (best) mark(best);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.01, 0.5, 1] }
  );
  sections.forEach((s) => observer.observe(s));
}

function renderError(message) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="cl-page cl-page-state">
      <div class="cl-state">
        <span class="cl-state-icon" aria-hidden="true">📡</span>
        <h2>No pudimos cargar la página</h2>
        <p>${escapeHtml(message || "Revisa tu conexión e inténtalo de nuevo.")}</p>
        <button type="button" class="cl-cta" id="cl-retry">
          <span class="cl-cta-label">Reintentar</span>
          <span class="cl-cta-go" aria-hidden="true">↻</span>
        </button>
      </div>
    </div>
  `;
  root.querySelector("#cl-retry").addEventListener("click", boot);
}

function renderSkeleton() {
  root.setAttribute("aria-busy", "true");
  root.innerHTML = `
    <div class="cl-page cl-page-state" role="status" aria-live="polite">
      <span class="sr-only">Cargando la información de la barbería…</span>
      <div class="cl-skel cl-skel-hero"></div>
      <div class="cl-skel cl-skel-row"></div>
      <div class="cl-skel cl-skel-card"></div>
      <div class="cl-skel cl-skel-card"></div>
    </div>
  `;
}

async function boot() {
  renderSkeleton();
  try {
    const [{ data: business, error: e1 }, { data: services, error: e2 }, { data: barbers, error: e3 }] =
      await Promise.all([
        sb().from("public_business").select("*").single(),
        sb().from("public_services").select("*").order("sort_order"),
        sb().from("public_barbers").select("*").order("name"),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    state.business = business;
    state.services = services || [];
    state.barbers = barbers || [];
    render();
  } catch (error) {
    renderError(error?.message);
  }
}

boot();
