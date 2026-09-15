// Pantallas de la app pública. Cada sección solo se dibuja si tiene datos
// reales detrás; si no los tiene, desaparece entera (y con ella su pestaña de
// la barra inferior).
import { escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";
import { icon, iconForService } from "./icons.js";
import { hasText, serviceImage, galleryImages } from "./data.js";
import {
  BOOKING_URL, cssUrl, mediaFrame, PromoCard, ServiceCard, BarberCard,
  GalleryCard, CutCard, BarberAvatar, SectionHead,
} from "./components.js";

const LOGO = "img/good-barber-logo.png";
const LOGO_SM = "img/good-barber-logo-sm.png";

// El administrador puede subir su propio logotipo desde el panel
// (settings.logo_url). Si lo hay, manda; si no, se usa el archivo del
// repositorio. Mismo criterio para la portada con hero_image_url.
function logoDe(state, respaldo) {
  return hasText(state?.business?.logo_url) ? state.business.logo_url.trim() : respaldo;
}
// Recorte de la palabra principal del MISMO logotipo oficial: el bloque
// completo (marco y tres líneas) se vuelve ilegible en la barra superior.
const WORDMARK = "img/good-barber-wordmark.png";

// Las tres fotografías reales de Good Barber. No son datos de Supabase: son
// material de marca que vive en el repositorio, optimizado a 720×960 (3:4).
const BARAJA = [
  // `estable`: esta tarjeta es el logotipo oficial, no una fotografía de
  // ambiente. El Ken Burns le acercaría la imagen y recortaría el wordmark
  // por los lados, así que se queda quieta. La tarjeta sí sigue girando con
  // la baraja: lo que no se mueve es la imagen dentro de ella.
  { src: "img/galeria/g1-logo.jpg",      titulo: "Good Barber", clase: "gb-card-logo", estable: true },
  { src: "img/galeria/g2-high-fade.jpg", titulo: "High Fade",   clase: "" },
  { src: "img/galeria/g3-corte.jpg",     titulo: "Fresh Cut",   clase: "" },
];

// La tarjeta frontal es la que el administrador puede sustituir desde el
// panel (settings.hero_image_url). Si no ha subido ninguna, se queda la
// fotografía del repositorio. No cambia el número de tarjetas, ni el orden,
// ni las clases, ni el movimiento: solo de dónde sale ese archivo.
function barajaDe(state) {
  const portada = hasText(state?.business?.hero_image_url) ? state.business.hero_image_url.trim() : null;
  if (!portada) return BARAJA;
  return BARAJA.map((f, i) => (i === BARAJA.length - 1 ? { ...f, src: portada } : f));
}

// El logotipo oficial ya lleva impreso "MEJORA TU ESTILO". Si el tagline
// guardado en Supabase dice lo mismo, repetirlo debajo sobra; cualquier otro
// tagline sí se muestra.
const LOGO_TAGLINE = "mejora tu estilo";
function taglineIsInLogo(tagline) {
  return tagline.toLowerCase().replace(/[.!¡]/g, "").trim() === LOGO_TAGLINE;
}

export function businessName(state) {
  return state.business?.business_name || "Good Barber";
}

/* ===============================================================
   Barra superior
   =============================================================== */
export function AppBar(state) {
  return `
    <header class="gb-appbar">
      <a class="gb-appbar-brand" href="#top" aria-label="${escapeHtml(businessName(state))} — inicio">
        <img src="${escapeHtml(logoDe(state, WORDMARK))}" alt="${escapeHtml(businessName(state))}" width="520" height="84">
      </a>
      ${
        state.business?.booking_enabled
          ? `<a class="gb-appbar-cta" href="${BOOKING_URL}" id="gb-appbar-cta" tabindex="-1" aria-hidden="true">Reservar</a>`
          : ""
      }
    </header>
  `;
}

/* ===============================================================
   Portada
   =============================================================== */
// La ciudad SOLO puede salir de public_business.address. Si no se puede
// determinar con seguridad, se omite: nunca se rellena con un valor fijo.
// Exige al menos una coma (una dirección de un solo tramo no dice la ciudad),
// descarta códigos postales y tramos que sean solo números.
function ciudadDe(address) {
  if (!hasText(address)) return "";
  const partes = address.split(",").map((t) => t.trim()).filter(Boolean);
  if (partes.length < 2) return "";
  let ultimo = partes[partes.length - 1];
  ultimo = ultimo.replace(/\b(C\.?P\.?|CP)\s*\d{4,6}\b/gi, "").replace(/\b\d{4,6}\b/g, "").trim();
  if (!ultimo && partes.length >= 3) ultimo = partes[partes.length - 2].trim();
  if (!ultimo || !/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(ultimo)) return "";
  return ultimo;
}

export function Hero(state) {
  const b = state.business;
  const open = Boolean(b?.booking_enabled);
  const tagline = hasText(b?.tagline) ? b.tagline.trim() : "";

  const cejilla = [businessName(state), ciudadDe(b?.address)].filter(Boolean).join(" · ");

  // El orden de pintado ES el orden de profundidad: la frontal va al final y
  // queda encima sin necesidad de gestionar z-index desde JavaScript.
  const capas = ["is-back", "is-mid", "is-front"];

  return `
    <section class="gb-hero" id="top">
      <div class="gb-deck" role="img" aria-label="Fotografías de ${escapeHtml(businessName(state))}">
        ${barajaDe(state).map((f, i) => `
          <div class="gb-slot ${capas[i]}" data-slot="${i}">
            <article class="gb-card ${f.clase}">
              <img src="${escapeHtml(f.src)}" alt="" width="720" height="960" decoding="async"${f.estable ? ' data-estable="true"' : ""}${i === 2 ? ' fetchpriority="high"' : ""}>
              <div class="gb-card-meta">
                <strong>${escapeHtml(f.titulo)}</strong>
                <span>0${i + 1} / 0${BARAJA.length}</span>
              </div>
            </article>
          </div>`).join("")}
      </div>

      <div class="gb-hero-copy">
        <p class="gb-eyebrow">${escapeHtml(cejilla)}</p>
        <h1 class="gb-title">${escapeHtml(tagline || "Mejora tu estilo")}<span class="gb-title-dot">.</span></h1>
        <p class="gb-sub">Cortes precisos. Barba impecable. Tu estilo, como debe ser.</p>
        ${
          open
            ? `<a class="gb-cta" href="${BOOKING_URL}" id="gb-cta-hero">
                 <span class="gb-cta-label">Reservar cita</span>
                 <span class="gb-cta-ico" aria-hidden="true">${icon("arrow")}</span>
               </a>`
            : `<div class="gb-closed" role="status">
                 <strong>Reservas en línea no disponibles por ahora</strong>
                 <span>${hasText(b?.phone) ? `Llámanos al ${escapeHtml(b.phone)} para agendar.` : "Vuelve a intentarlo más tarde."}</span>
               </div>`
        }
      </div>
    </section>
  `;
}

/* ===============================================================
   Servicios
   =============================================================== */
export function Services(state) {
  if (!state.services.length) return "";
  return `
    <section class="gb-section" id="servicios" aria-label="Servicios">
      ${SectionHead("Servicios", state.services.length, "La carta")}
      <div class="gb-svc-grid">
        ${state.services.map((s, i) => ServiceCard(s, i)).join("")}
      </div>
    </section>
  `;
}

/* ===============================================================
   Cortes destacados — contenido de INICIO administrado desde el panel

   Sección opcional: si el administrador no ha publicado ningún corte, no
   se dibuja nada y INICIO queda exactamente como estaba. No aparece en la
   barra inferior ni cambia la navegación.

   Es contenido editorial, NO catálogo: aquí no hay precio, ni duración, ni
   botón de reservar. Los servicios reservables siguen viviendo solo en la
   sección Servicios.
   =============================================================== */
export function FeaturedCuts(state) {
  const cuts = state.cuts || [];
  if (!cuts.length) return "";
  return `
    <section class="gb-section" id="cortes" aria-label="Cortes destacados">
      ${SectionHead("Cortes destacados", cuts.length, "Elige tu estilo")}
      <div class="gb-cut-rail" data-rail>
        ${cuts.map((c, i) => CutCard(c, i)).join("")}
      </div>
    </section>
  `;
}

/* ===============================================================
   Nuestros trabajos — solo si existen fotografías reales
   =============================================================== */
export function Gallery(state) {
  const shots = galleryImages(state.business);
  if (!shots.length) return "";
  return `
    <section class="gb-section" id="trabajos" aria-label="Nuestros trabajos">
      ${SectionHead("Nuestros trabajos", shots.length, "Inspírate")}
      <div class="gb-gal-grid">${shots.map((u, i) => GalleryCard(u, i)).join("")}</div>
    </section>
  `;
}

/* ===============================================================
   Barberos
   =============================================================== */
export function Barbers(state) {
  if (!state.barbers.length) return "";
  return `
    <section class="gb-section" id="barberos" aria-label="Barberos">
      ${SectionHead("Nuestros barberos", state.barbers.length, "El equipo")}
      <div class="gb-brb-rail" data-rail>
        ${state.barbers.map((b, i) => BarberCard(b, i)).join("")}
      </div>
    </section>
  `;
}

/* ===============================================================
   Cómo reservar (describe el flujo real de /reservar/)
   =============================================================== */
export function Steps(state) {
  if (!state.business?.booking_enabled) return "";
  const steps = [
    ["01", "Elige servicio y barbero"],
    ["02", "Escoge fecha y hora"],
    ["03", "Confirma tu cita"],
  ];
  return `
    <section class="gb-section" id="pasos" aria-label="Cómo reservar">
      ${SectionHead("Cómo reservar", null, "Así de fácil")}
      <ol class="gb-steps">
        ${steps.map(([n, t], i) => `
          <li class="gb-step" data-reveal style="--i:${i}">
            <span class="gb-step-num" aria-hidden="true">${n}</span>
            <span class="gb-step-text">${t}</span>
          </li>`).join("")}
      </ol>
    </section>
  `;
}

/* ===============================================================
   Ubicación y contacto
   =============================================================== */
function contactCard(iconName, label, value, href, external, i) {
  const target = external ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `
    <a class="gb-contact" href="${escapeHtml(href)}"${target} data-reveal style="--i:${i}">
      <span class="gb-contact-ico">${icon(iconName)}</span>
      <span class="gb-contact-text">
        <span class="gb-label">${label}</span>
        <span class="gb-contact-value">${escapeHtml(value)}</span>
      </span>
      <span class="gb-contact-go" aria-hidden="true">${icon("arrow")}</span>
    </a>
  `;
}

function digitsOf(value) {
  return String(value || "").replace(/\D/g, "");
}

function instagramUrl(value) {
  const raw = String(value).trim();
  return /^https?:\/\//i.test(raw) ? raw : `https://instagram.com/${raw.replace(/^@/, "")}`;
}

function instagramLabel(value) {
  const raw = String(value).trim();
  if (/^https?:\/\//i.test(raw)) {
    const handle = raw.replace(/\/+$/, "").split("/").pop();
    return handle ? `@${handle}` : "Instagram";
  }
  return raw.startsWith("@") ? raw : `@${raw}`;
}

export function Contact(state) {
  const b = state.business || {};
  const cards = [];
  let i = 0;
  if (hasText(b.phone) && digitsOf(b.phone)) {
    cards.push(contactCard("phone", "Teléfono", b.phone, `tel:${digitsOf(b.phone)}`, false, i++));
  }
  if (hasText(b.whatsapp) && digitsOf(b.whatsapp)) {
    cards.push(contactCard("chat", "WhatsApp", b.whatsapp, `https://wa.me/${digitsOf(b.whatsapp)}`, true, i++));
  }
  if (hasText(b.instagram)) {
    cards.push(contactCard("instagram", "Instagram", instagramLabel(b.instagram), instagramUrl(b.instagram), true, i++));
  }
  const hasAddress = hasText(b.address);
  if (!hasAddress && !cards.length) return "";

  return `
    <section class="gb-section" id="contacto" aria-label="Ubicación y contacto">
      ${SectionHead("Ubicación y contacto", null, "Visítanos")}
      ${
        hasAddress
          ? `<a class="gb-address" data-reveal target="_blank" rel="noopener noreferrer"
                href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}">
               <span class="gb-contact-ico">${icon("pin")}</span>
               <span class="gb-address-body">
                 <span class="gb-label">Ubicación</span>
                 <span class="gb-address-text">${escapeHtml(b.address)}</span>
                 <span class="gb-address-link">Ver en el mapa${icon("arrow")}</span>
               </span>
             </a>`
          : ""
      }
      ${cards.length ? `<div class="gb-contact-grid">${cards.join("")}</div>` : ""}
    </section>
  `;
}

export function Footer(state) {
  const name = escapeHtml(businessName(state));
  return `
    <footer class="gb-footer" data-reveal>
      <img class="gb-footer-logo" src="${escapeHtml(logoDe(state, LOGO_SM))}" alt="${name}" width="300" height="198" loading="lazy">
      <p class="gb-footer-note">© ${new Date().getFullYear()} ${name}</p>
    </footer>
  `;
}

/* ===============================================================
   Barra inferior. Solo pestañas de secciones que existen de verdad, y
   la acción central va al motor de reservas real.
   =============================================================== */
export function TabBar(state, present) {
  // Solo se dibujan pestañas de secciones que existen de verdad en la página.
  const tabs = [{ id: "top", icon: "home", label: "Inicio" }];
  if (present.servicios) tabs.push({ id: "servicios", icon: "scissors", label: "Servicios" });
  if (present.barberos) tabs.push({ id: "barberos", icon: "user", label: "Barberos" });
  if (present.contacto) tabs.push({ id: "contacto", icon: "pin", label: "Contacto" });

  const items = tabs.map(
    (t) => `<a class="gb-tab" href="#${t.id}" data-tab="${t.id}">
      <span class="gb-tab-ico">${icon(t.icon)}</span>
      <span class="gb-tab-label">${t.label}</span>
    </a>`
  );

  // RESERVAR va al centro y es el único elemento elevado de la barra.
  if (state.business?.booking_enabled) {
    items.splice(
      Math.ceil(items.length / 2),
      0,
      `<a class="gb-fab" href="${BOOKING_URL}" id="gb-fab" aria-label="Reservar cita">
         <span class="gb-fab-ico">${icon("cal")}</span>
         <span class="gb-fab-label">Reservar</span>
       </a>`
    );
  }
  return `<nav class="gb-tabbar" aria-label="Secciones">
    <span class="gb-tab-marker" aria-hidden="true"></span>
    ${items.join("")}
  </nav>`;
}

/* ===============================================================
   Detalle de servicio (hoja inferior)
   =============================================================== */
export function ServiceSheet(service, state) {
  const img = serviceImage(service);
  const marca = icon(iconForService(service.icon));
  const abierto = Boolean(state.business?.booking_enabled);
  // El servicio viaja al motor de reservas YA EXISTENTE como parámetro; allí
  // se valida contra la lista real antes de preseleccionarlo.
  const href = `${BOOKING_URL}?servicio=${encodeURIComponent(service.id)}`;

  return `
    <div class="gb-sheet-backdrop" data-close-sheet></div>
    <div class="gb-sheet" role="dialog" aria-modal="true" aria-labelledby="gb-sheet-title">
      <div class="gb-sheet-inner">
        <span class="gb-sheet-handle" aria-hidden="true"></span>
        <button type="button" class="gb-sheet-close" data-close-sheet aria-label="Cerrar">${icon("close")}</button>

        ${
          img
            ? `<div class="gb-sheet-shot">${mediaFrame({ url: img, alt: service.name, eager: true })}</div>`
            : `<div class="gb-sheet-mark" aria-hidden="true">${marca}</div>`
        }

        <div class="gb-sheet-body">
          <p class="gb-sheet-kicker">Servicio</p>
          <h2 class="gb-sheet-title" id="gb-sheet-title">${escapeHtml(service.name)}</h2>
          ${hasText(service.description) ? `<p class="gb-sheet-desc">${escapeHtml(service.description)}</p>` : ""}

          <dl class="gb-sheet-datos">
            <div>
              <dt>Precio</dt>
              <dd class="gb-sheet-precio">${formatCents(service.price_cents)}</dd>
            </div>
            ${
              service.duration_minutes
                ? `<div>
                     <dt>Duración</dt>
                     <dd>${service.duration_minutes} min</dd>
                   </div>`
                : ""
            }
          </dl>
        </div>

        <div class="gb-sheet-foot">
          ${
            abierto
              ? `<a class="gb-cta gb-cta-block" href="${href}" id="gb-sheet-cta">
                   <span class="gb-cta-label">Reservar</span>
                   <span class="gb-cta-ico" aria-hidden="true">${icon("arrow")}</span>
                 </a>`
              : `<p class="gb-sheet-cerrado">Reservas en línea no disponibles por ahora.</p>`
          }
        </div>
      </div>
    </div>
  `;
}

/* ===============================================================
   Visor de galería
   =============================================================== */
// `etiqueta` es opcional: si no se pasa, se mantiene exactamente el texto de
// siempre para la galería de trabajos. Los cortes destacados pasan su nombre,
// que es información real y no un número de orden.
export function Lightbox(url, index, total, etiqueta = null) {
  const nombre = etiqueta || `Trabajo ${index + 1}`;
  return `
    <div class="gb-lb" role="dialog" aria-modal="true" aria-label="${escapeHtml(nombre)} — ${index + 1} de ${total}">
      <button type="button" class="gb-lb-close" data-close-lb aria-label="Cerrar">${icon("close")}</button>
      <img src="${escapeHtml(url)}" alt="${escapeHtml(nombre)}">
    </div>
  `;
}
