// Componentes de la app pública. Todos están preparados para fotografía:
// reciben una URL opcional y, cuando no existe, dibujan un respaldo visual
// propio en vez de un hueco vacío o una imagen inventada. Cuando más adelante
// existan fotos reales de servicios o de trabajos, basta con que la URL llegue
// -- ninguna tarjeta necesita rediseñarse.
import { escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";
import { icon, iconForService } from "./icons.js";
import { hasText, serviceImage, barberImage, cutImage } from "./data.js";

export const BOOKING_URL = "../reservar/";

// Una URL dentro de url('…') necesita codificados los caracteres que cerrarían
// la comilla o el paréntesis, y hay que hacerlo ANTES de escapar el HTML: si se
// escapa primero, el navegador devuelve la comilla al parsear el atributo style
// y la declaración CSS queda inválida, sin ningún error visible.
export function cssUrl(value) {
  return encodeURI(String(value))
    .replace(/'/g, "%27")
    .replace(/"/g, "%22")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------------------------------------------------------------
   Marco de imagen. Es la pieza que hace que todo esté "listo para
   fotos": si hay URL pinta la fotografía (lazy, object-fit cover, sin
   deformar); si no, pinta el respaldo que se le pase.
   --------------------------------------------------------------- */
export function mediaFrame({ url, alt = "", fallback = "", cls = "", eager = false }) {
  if (hasText(url)) {
    return `<div class="gb-media ${cls}">
      <img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" ${eager ? "" : 'loading="lazy" decoding="async"'}>
    </div>`;
  }
  return `<div class="gb-media gb-media-empty ${cls}" aria-hidden="true">${fallback}</div>`;
}

/* ---------------------------------------------------------------
   PromoCard — solo con promo_active y promo_text reales.
   --------------------------------------------------------------- */
export function PromoCard(business) {
  if (!business?.promo_active || !hasText(business?.promo_text)) return "";
  const canBook = Boolean(business?.booking_enabled);
  return `
    <article class="gb-promo" data-reveal>
      <div class="gb-promo-glow" aria-hidden="true"></div>
      <div class="gb-promo-body">
        <span class="gb-promo-eyebrow">${icon("spark")}Oferta especial</span>
        <p class="gb-promo-text">${escapeHtml(business.promo_text)}</p>
        ${canBook ? `<a class="gb-btn gb-btn-sm" href="${BOOKING_URL}">Agendar${icon("arrow")}</a>` : ""}
      </div>
      <div class="gb-promo-art" aria-hidden="true">${icon("scissors")}</div>
    </article>
  `;
}

/* ---------------------------------------------------------------
   ServiceCard — pieza seleccionable, no tarjeta de cuadrícula.

   Todo sale de public_services: name, description, icon, price_cents,
   duration_minutes. Nada más. Si el backend no da fotografía del servicio
   —hoy no la da—, NO se inventa ninguna: la pieza se resuelve con el
   lenguaje editorial de Good Barber (placa dorada, filete, tipografía).
   --------------------------------------------------------------- */
export function ServiceCard(service, index = 0) {
  const img = serviceImage(service);
  const marca = icon(iconForService(service.icon));

  return `
    <article class="gb-svc" data-reveal style="--i:${index}">
      <button type="button" class="gb-svc-hit" data-service="${escapeHtml(service.id)}"
              aria-label="Ver ${escapeHtml(service.name)} — ${formatCents(service.price_cents)}">
        ${img ? `<span class="gb-svc-shot">${mediaFrame({ url: img, alt: service.name })}</span>` : ""}
        <span class="gb-svc-mark" aria-hidden="true">${marca}</span>
        <span class="gb-svc-body">
          <span class="gb-svc-name">${escapeHtml(service.name)}</span>
          ${hasText(service.description) ? `<span class="gb-svc-desc">${escapeHtml(service.description)}</span>` : ""}
        </span>
        <span class="gb-svc-side">
          <span class="gb-svc-price">${formatCents(service.price_cents)}</span>
          ${service.duration_minutes ? `<span class="gb-svc-time">${service.duration_minutes} min</span>` : ""}
        </span>
      </button>
    </article>
  `;
}

/* ---------------------------------------------------------------
   BarberCard — la fotografía manda; sin ella, respaldo con textura y
   el monograma como detalle, no como protagonista.
   --------------------------------------------------------------- */
export function BarberCard(barber, index = 0) {
  const img = barberImage(barber);
  const fallback = `
    <span class="gb-brb-pole"></span>
    <span class="gb-media-grain"></span>
    <span class="gb-brb-mono">${escapeHtml(initials(barber.name))}</span>`;
  return `
    <article class="gb-brb" data-reveal style="--i:${index}">
      ${mediaFrame({ url: img, alt: barber.name, fallback, cls: "gb-brb-media" })}
      <div class="gb-brb-info">
        <h3 class="gb-brb-name">${escapeHtml(barber.name)}</h3>
        ${hasText(barber.bio) ? `<p class="gb-brb-bio">${escapeHtml(barber.bio)}</p>` : ""}
      </div>
    </article>
  `;
}

/* ---------------------------------------------------------------
   GalleryCard — para las fotos de trabajos. Hoy no hay ninguna en
   Supabase, así que la sección entera no se dibuja (nunca un hueco).
   --------------------------------------------------------------- */
/* ---------------------------------------------------------------
   CutCard — una lámina de corte destacado.

   La lámina ya trae dentro su propia rotulación (GOOD BARBER, el nombre
   del corte, FRENTE / PERFIL / DETRÁS), así que el marco NO la recorta: el
   hueco tiene la proporción 2:3 de la imagen original y la imagen se
   encaja completa. El nombre se repite bajo la tarjeta como texto real,
   para quien navegue con lector de pantalla o no pueda ver la imagen.
   --------------------------------------------------------------- */
export function CutCard(cut, index = 0) {
  const url = cutImage(cut);
  return `
    <button type="button" class="gb-cut" data-cut="${index}" style="--i:${index}"
            aria-label="Ampliar ${escapeHtml(cut.name)}">
      ${mediaFrame({
        url,
        alt: cut.name,
        cls: "gb-cut-media",
        fallback: `<span class="gb-cut-mono" aria-hidden="true">${escapeHtml(initials(cut.name))}</span>`,
      })}
      <span class="gb-cut-body">
        <span class="gb-cut-name">${escapeHtml(cut.name)}</span>
        ${hasText(cut.description) ? `<span class="gb-cut-desc">${escapeHtml(cut.description)}</span>` : ""}
      </span>
    </button>
  `;
}

export function GalleryCard(url, index) {
  return `
    <button type="button" class="gb-gal" data-gallery="${index}" style="--i:${index}"
            aria-label="Ampliar fotografía ${index + 1}">
      ${mediaFrame({ url, alt: `Trabajo ${index + 1}`, cls: "gb-gal-media" })}
    </button>
  `;
}

/* ---------------------------------------------------------------
   Avatar pequeño (fila de barberos del detalle de servicio)
   --------------------------------------------------------------- */
export function BarberAvatar(barber) {
  const img = barberImage(barber);
  return `
    <span class="gb-avatar" title="${escapeHtml(barber.name)}">
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(barber.name)}" loading="lazy" decoding="async">`
            : `<span aria-hidden="true">${escapeHtml(initials(barber.name))}</span>`}
    </span>
  `;
}

export function SectionHead(title, count, eyebrow) {
  return `
    <header class="gb-sechead" data-reveal>
      ${eyebrow ? `<span class="gb-eyebrow">${escapeHtml(eyebrow)}</span>` : ""}
      <div class="gb-sechead-row">
        <h2>${escapeHtml(title)}</h2>
        ${count != null ? `<span class="gb-count">${count}</span>` : ""}
      </div>
    </header>
  `;
}
