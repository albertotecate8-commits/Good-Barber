// Página pública de cliente (escaparate). SOLO LECTURA y SOLO de las vistas
// públicas ya existentes: public_business, public_services y public_barbers.
// No toca autenticación, ni ventas, ni reparto, ni agenda administrativa, ni
// clientes administrativos. Tampoco implementa reserva alguna: el único
// camino para agendar es el motor ya existente en /reservar/, al que esta
// página simplemente enlaza.
//
// Regla que se respeta en todo el archivo: nada se inventa. Cada bloque
// (promoción, dirección, teléfono, WhatsApp, Instagram, servicios, barberos)
// se dibuja únicamente si el dato real existe en Supabase; si no existe, la
// sección entera no aparece.
import { mountUiRoots, escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";

function sb() {
  return window.supabaseClient;
}

const BOOKING_URL = "../reservar/";
const root = document.getElementById("app");
mountUiRoots();

const state = { business: null, services: [], barbers: [] };

/* ---------------------------------------------------------------
   Utilidades de presentación
   --------------------------------------------------------------- */

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
// inválida y la foto del hero desaparece sin dar ningún error.
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

function brandMark(size) {
  const b = state.business;
  if (hasText(b?.logo_url)) {
    return `<img class="cl-brand-logo cl-brand-logo-${size}" src="${escapeHtml(b.logo_url)}" alt="${escapeHtml(b.business_name || "Good Barber")}">`;
  }
  return `<div class="logo-mark cl-brand-mark cl-brand-mark-${size}" aria-hidden="true">GB</div>`;
}

/* ---------------------------------------------------------------
   Secciones
   --------------------------------------------------------------- */

function heroHTML() {
  const b = state.business;
  const name = escapeHtml(b?.business_name || "Good Barber");
  const open = b?.booking_enabled;
  const heroImage = hasText(b?.hero_image_url)
    ? `<div class="cl-hero-photo" style="background-image:url('${escapeHtml(cssUrl(b.hero_image_url))}')" role="img" aria-label="${name}"></div>`
    : "";

  return `
    <header class="cl-hero ${heroImage ? "has-photo" : ""}">
      ${heroImage}
      <div class="cl-hero-inner">
        ${brandMark("lg")}
        <h1 class="cl-hero-title">${name}</h1>
        ${hasText(b?.tagline) ? `<p class="cl-hero-tagline">${escapeHtml(b.tagline)}</p>` : ""}
        <p class="cl-hero-lead">Elige tu servicio, tu barbero y tu horario. Agenda en línea en menos de un minuto, sin llamadas y sin crear ninguna cuenta.</p>
        ${
          b?.promo_active && hasText(b?.promo_text)
            ? `<div class="cl-promo"><span class="cl-promo-dot" aria-hidden="true"></span>${escapeHtml(b.promo_text)}</div>`
            : ""
        }
        ${
          open
            ? `<a class="btn btn-primary cl-cta" href="${BOOKING_URL}" id="cl-cta-hero">Agendar mi cita</a>`
            : `<div class="cl-closed" role="status">
                 <strong>Reservas en línea no disponibles por el momento.</strong>
                 <span>${hasText(b?.phone) ? `Llámanos al ${escapeHtml(b.phone)} para agendar.` : "Vuelve a intentarlo más tarde."}</span>
               </div>`
        }
        ${
          open
            ? `<ul class="cl-trust">
                 <li><span aria-hidden="true">⚡</span>Sin registro</li>
                 <li><span aria-hidden="true">🗓️</span>Horarios reales</li>
                 <li><span aria-hidden="true">🎟️</span>Código de reserva</li>
               </ul>`
            : ""
        }
      </div>
    </header>
  `;
}

function servicesHTML() {
  if (state.services.length === 0) return "";
  return `
    <section class="cl-section" aria-labelledby="cl-services-title">
      <div class="cl-section-head">
        <span class="cl-eyebrow">Carta</span>
        <h2 id="cl-services-title">Nuestros servicios</h2>
      </div>
      <div class="cl-service-list">
        ${state.services
          .map(
            (s) => `
          <article class="cl-service">
            <div class="cl-service-icon" aria-hidden="true">${hasText(s.icon) ? escapeHtml(s.icon) : "✂️"}</div>
            <div class="cl-service-body">
              <h3 class="cl-service-name">${escapeHtml(s.name)}</h3>
              ${hasText(s.description) ? `<p class="cl-service-desc">${escapeHtml(s.description)}</p>` : ""}
              ${s.duration_minutes ? `<p class="cl-service-time">${s.duration_minutes} min</p>` : ""}
            </div>
            <div class="cl-service-price">${formatCents(s.price_cents)}</div>
          </article>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function barbersHTML() {
  if (state.barbers.length === 0) return "";
  return `
    <section class="cl-section" aria-labelledby="cl-barbers-title">
      <div class="cl-section-head">
        <span class="cl-eyebrow">El equipo</span>
        <h2 id="cl-barbers-title">Nuestros barberos</h2>
      </div>
      <div class="cl-barber-list">
        ${state.barbers
          .map(
            (b) => `
          <article class="cl-barber">
            <div class="cl-barber-avatar">${
              hasText(b.photo_url)
                ? `<img src="${escapeHtml(b.photo_url)}" alt="${escapeHtml(b.name)}" loading="lazy">`
                : `<span aria-hidden="true">${escapeHtml(initials(b.name))}</span>`
            }</div>
            <h3 class="cl-barber-name">${escapeHtml(b.name)}</h3>
            ${hasText(b.bio) ? `<p class="cl-barber-bio">${escapeHtml(b.bio)}</p>` : ""}
          </article>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function stepsHTML() {
  if (!state.business?.booking_enabled) return "";
  // Describe el flujo real de /reservar/ (servicio → barbero → fecha y hora →
  // datos → confirmación). No añade pasos que no existan.
  const steps = [
    ["1", "Elige servicio y barbero", "Precios y tiempos reales, los mismos de la barbería."],
    ["2", "Escoge fecha y hora", "Solo se muestran los horarios que están realmente libres."],
    ["3", "Confirma tus datos", "Recibes un código de reserva al instante."],
  ];
  return `
    <section class="cl-section" aria-labelledby="cl-steps-title">
      <div class="cl-section-head">
        <span class="cl-eyebrow">Así de fácil</span>
        <h2 id="cl-steps-title">Cómo reservar</h2>
      </div>
      <ol class="cl-steps">
        ${steps
          .map(
            ([n, title, desc]) => `
          <li class="cl-step">
            <span class="cl-step-num" aria-hidden="true">${n}</span>
            <div>
              <h3 class="cl-step-title">${title}</h3>
              <p class="cl-step-desc">${desc}</p>
            </div>
          </li>
        `
          )
          .join("")}
      </ol>
    </section>
  `;
}

function contactHTML() {
  const b = state.business || {};
  const links = [];

  if (hasText(b.phone) && digitsOf(b.phone)) {
    links.push(
      `<a class="cl-contact" href="tel:${escapeHtml(digitsOf(b.phone))}"><span class="cl-contact-icon" aria-hidden="true">📞</span><span class="cl-contact-text"><span class="cl-contact-label">Teléfono</span><span class="cl-contact-value">${escapeHtml(b.phone)}</span></span></a>`
    );
  }
  if (hasText(b.whatsapp) && digitsOf(b.whatsapp)) {
    links.push(
      `<a class="cl-contact" href="https://wa.me/${escapeHtml(digitsOf(b.whatsapp))}" target="_blank" rel="noopener noreferrer"><span class="cl-contact-icon" aria-hidden="true">💬</span><span class="cl-contact-text"><span class="cl-contact-label">WhatsApp</span><span class="cl-contact-value">${escapeHtml(b.whatsapp)}</span></span></a>`
    );
  }
  if (hasText(b.instagram)) {
    links.push(
      `<a class="cl-contact" href="${escapeHtml(instagramUrl(b.instagram))}" target="_blank" rel="noopener noreferrer"><span class="cl-contact-icon" aria-hidden="true">📸</span><span class="cl-contact-text"><span class="cl-contact-label">Instagram</span><span class="cl-contact-value">${escapeHtml(instagramLabel(b.instagram))}</span></span></a>`
    );
  }

  const hasAddress = hasText(b.address);
  if (!hasAddress && links.length === 0) return "";

  return `
    <section class="cl-section" aria-labelledby="cl-contact-title">
      <div class="cl-section-head">
        <span class="cl-eyebrow">Visítanos</span>
        <h2 id="cl-contact-title">Dónde y cómo encontrarnos</h2>
      </div>
      ${
        hasAddress
          ? `<div class="cl-address">
               <span class="cl-contact-icon" aria-hidden="true">📍</span>
               <div>
                 <p class="cl-address-text">${escapeHtml(b.address)}</p>
                 <a class="cl-address-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank" rel="noopener noreferrer">Ver en el mapa</a>
               </div>
             </div>`
          : ""
      }
      ${links.length ? `<div class="cl-contact-list">${links.join("")}</div>` : ""}
    </section>
  `;
}

function footerHTML() {
  const b = state.business;
  const name = escapeHtml(b?.business_name || "Good Barber");
  return `
    <footer class="cl-footer">
      ${brandMark("sm")}
      <p class="cl-footer-name">${name}</p>
      <p class="cl-footer-note">© ${new Date().getFullYear()} ${name}</p>
    </footer>
  `;
}

function stickyCtaHTML() {
  if (!state.business?.booking_enabled) return "";
  return `
    <div class="cl-sticky" id="cl-sticky" aria-hidden="true">
      <a class="btn btn-primary cl-cta cl-cta-sticky" href="${BOOKING_URL}" id="cl-cta-sticky" tabindex="-1">Agendar mi cita</a>
    </div>
  `;
}

/* ---------------------------------------------------------------
   Render y arranque
   --------------------------------------------------------------- */

function render() {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="cl-page">
      ${heroHTML()}
      ${servicesHTML()}
      ${barbersHTML()}
      ${stepsHTML()}
      ${contactHTML()}
      ${footerHTML()}
    </div>
    ${stickyCtaHTML()}
  `;
  wireSticky();
}

// La barra inferior con el CTA solo aparece cuando el botón principal del
// hero ya salió de la pantalla, para no duplicar la misma acción visible dos
// veces. Es puramente visual; el enlace es el mismo.
function wireSticky() {
  const sticky = document.getElementById("cl-sticky");
  const heroCta = document.getElementById("cl-cta-hero");
  const stickyLink = document.getElementById("cl-cta-sticky");
  if (!sticky || !heroCta) return;

  const setVisible = (visible) => {
    sticky.classList.toggle("visible", visible);
    sticky.setAttribute("aria-hidden", visible ? "false" : "true");
    if (stickyLink) stickyLink.tabIndex = visible ? 0 : -1;
  };

  if (!("IntersectionObserver" in window)) {
    setVisible(true);
    return;
  }
  const observer = new IntersectionObserver(
    ([entry]) => setVisible(!entry.isIntersecting),
    { rootMargin: "-8px 0px 0px 0px", threshold: 0 }
  );
  observer.observe(heroCta);
}

function renderError(message) {
  root.setAttribute("aria-busy", "false");
  root.innerHTML = `
    <div class="cl-page cl-state-page">
      <div class="card text-center cl-state">
        <div class="cl-state-icon" aria-hidden="true">📡</div>
        <h2>No pudimos cargar la página</h2>
        <p class="text-muted mt-8">${escapeHtml(message || "Revisa tu conexión e inténtalo de nuevo.")}</p>
        <button type="button" class="btn btn-primary btn-block mt-16" id="cl-retry">Reintentar</button>
      </div>
    </div>
  `;
  root.querySelector("#cl-retry").addEventListener("click", boot);
}

function renderSkeleton() {
  root.setAttribute("aria-busy", "true");
  root.innerHTML = `
    <div class="cl-page" role="status" aria-live="polite">
      <span class="sr-only">Cargando la información de la barbería…</span>
      <div class="cl-skel cl-skel-mark"></div>
      <div class="cl-skel cl-skel-title"></div>
      <div class="cl-skel cl-skel-line"></div>
      <div class="cl-skel cl-skel-cta"></div>
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
