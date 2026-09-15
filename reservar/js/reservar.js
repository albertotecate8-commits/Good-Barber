// Reserva pública. Usa EXCLUSIVAMENTE lo ya creado y verificado en la
// Etapa 1: las vistas public_business/public_services/public_barbers, la
// función public_available_slots y el RPC book_appointment. No inventa
// ningún horario: cada botón de hora viene tal cual de Supabase, y la hora
// exacta que se envía a book_appointment es la misma cadena que devolvió
// public_available_slots — nunca una reconstruida a mano.
//
// PASO 6 cambió SOLO la presentación: el mismo estado, los mismos pasos, las
// mismas dos llamadas con los mismos parámetros. La piel y el movimiento se
// heredan de /cliente/ (tokens.css + motion.js), sin duplicar ninguno.
import { escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";
import { icon, iconForService } from "../../cliente/js/icons.js";
import { initials } from "../../cliente/js/components.js";
import {
  hasText,
  barberImage,
  cargarServiciosPublicos,
  cargarBarberosPublicos,
} from "../../cliente/js/data.js";
import { stepIn, press, railTo, confirmPop } from "../../cliente/js/motion.js";

function sb() {
  return window.supabaseClient;
}

const root = document.getElementById("app");

const state = {
  business: null,
  services: [],
  barbers: [],
  service: null,
  barber: null,
  dateISO: null,
  slots: [],
  slot: null,
  result: null,
  // Lo que el cliente ya escribió, para no perderlo al ir y volver.
  datos: { name: "", phone: "", email: "", notes: "" },
  error: null,
  step: "servicio", // servicio -> barbero -> fecha -> horario -> datos -> listo
  dir: 1, // +1 avanzando, -1 retrocediendo: solo decide por qué lado entra
};

/* ===============================================================
   Utilidades de fecha y hora (idénticas a las que ya había)
   =============================================================== */
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function timeHHMM(iso) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dateLong(iso) {
  return dateFromISO(iso).toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" });
}

function dateShort(iso) {
  return dateFromISO(iso).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/* ===============================================================
   Errores: se muestran los que el propio RPC escribió en español
   ("Ese horario ya no está disponible.", "El teléfono no es válido.")
   y se traduce lo que sería jerga técnica. Nunca se oculta un fallo.
   =============================================================== */
const JERGA = [
  "PGRST", "pgrst", "relation ", "column ", "violates", "duplicate key",
  "syntax", "constraint", "null value in", "JWT", "permission denied for",
  "function ", "operator", "invalid input", "stack",
];

function mensajeDeError(error) {
  const msg = String(error?.message || error || "").trim();
  if (!msg) return "No se pudo completar la reserva. Inténtalo de nuevo.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.";
  }
  if (JERGA.some((t) => msg.includes(t))) {
    return "No se pudo completar la reserva. Inténtalo de nuevo en unos momentos.";
  }
  return msg;
}

/* ===============================================================
   Carga inicial — mismas tres consultas de siempre
   =============================================================== */
async function boot() {
  try {
    const [{ data: business, error: e1 }, { data: services, error: e2 }, { data: barbers, error: e3 }] = await Promise.all([
      sb().from("public_business").select("*").single(),
      // Las mismas dos consultas que /cliente/, desde el mismo sitio: manda
      // sort_order del panel y, si la base de datos todavía no tiene esa
      // columna, se cae al orden por nombre en lugar de tumbar la página.
      cargarServiciosPublicos(),
      cargarBarberosPublicos(),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    state.business = business;
    state.services = services || [];
    state.barbers = barbers || [];

    // El servicio puede llegar ya elegido desde la página pública (/cliente/).
    // Se valida SIEMPRE contra la lista real de servicios publicados: si el id
    // no corresponde a ninguno, se ignora y el flujo empieza como siempre en
    // el paso 1. No cambia ninguna consulta ni ninguna validación de Supabase.
    const wanted = new URLSearchParams(window.location.search).get("servicio");
    if (wanted) {
      const match = state.services.find((s) => s.id === wanted);
      if (match) {
        state.service = match;
        state.step = "barbero";
      }
    }

    montarCascaron();
    pintar();
  } catch (error) {
    root.innerHTML = `
      <div class="rv-app">
        <main class="rv-main">
          <div class="rv-state">
            <span class="rv-state-ico">${icon("alert")}</span>
            <h2>No pudimos cargar la página</h2>
            <p>${escapeHtml(mensajeDeError(error))}</p>
            <button type="button" class="gb-cta" id="rv-retry">Reintentar ${ctaIco("arrow")}</button>
          </div>
        </main>
      </div>`;
    root.querySelector("#rv-retry").addEventListener("click", () => {
      root.innerHTML = '<div class="rv-boot"><div class="spinner"></div></div>';
      boot();
    });
  }
}

/* ===============================================================
   Cascarón: barra, progreso, zona de paso y muelle inferior.
   Se monta UNA vez; después solo se repintan main y dock, que es lo
   que permite que la transición entre pasos sea corta y limpia.
   =============================================================== */
const PASOS = [
  { key: "servicio", titulo: "Servicio" },
  { key: "barbero", titulo: "Barbero" },
  { key: "fecha", titulo: "Fecha" },
  { key: "horario", titulo: "Horario" },
  { key: "datos", titulo: "Tus datos" },
];

function indicePaso(key) {
  return PASOS.findIndex((p) => p.key === key);
}

function ctaIco(nombre) {
  return `<span class="gb-cta-ico" aria-hidden="true">${icon(nombre)}</span>`;
}

function montarCascaron() {
  root.innerHTML = `
    <div class="gb-ambient" aria-hidden="true"></div>
    <div class="gb-noise" aria-hidden="true"></div>
    <div class="rv-app">
      <header class="rv-bar">
        <a class="rv-back" id="rv-back" href="../cliente/" aria-label="Volver">${icon("arrow")}</a>
        <a class="rv-brand" href="../cliente/" aria-label="Good Barber — inicio">
          <img src="../cliente/img/good-barber-wordmark.png" alt="Good Barber" width="560" height="96">
        </a>
        <span class="rv-count" id="rv-count" aria-hidden="true"></span>
      </header>
      <div class="rv-rail" role="progressbar" id="rv-rail" aria-valuemin="1" aria-valuemax="${PASOS.length}">
        <span class="rv-rail-fill" id="rv-rail-fill"></span>
      </div>
      <main class="rv-main" id="rv-main" tabindex="-1"></main>
      <footer class="rv-dock" id="rv-dock"></footer>
    </div>`;
  vigilarTeclado();
}

// El teclado virtual no encoge la ventana en iOS: el muelle quedaría debajo.
// visualViewport dice cuánto se comió, y el CSS sube el muelle justo eso.
function vigilarTeclado() {
  const vv = window.visualViewport;
  if (!vv) return;
  const ajustar = () => {
    const oculto = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    document.documentElement.style.setProperty("--rv-kb", `${Math.round(oculto)}px`);
  };
  vv.addEventListener("resize", ajustar);
  vv.addEventListener("scroll", ajustar);
  ajustar();
}

let soltarPress = null;

function pintar() {
  const b = state.business;
  const main = document.getElementById("rv-main");
  const dock = document.getElementById("rv-dock");
  if (soltarPress) {
    soltarPress.destruir();
    soltarPress = null;
  }

  if (!b?.booking_enabled) {
    document.getElementById("rv-rail").hidden = true;
    document.getElementById("rv-count").textContent = "";
    main.innerHTML = `
      <div class="rv-state">
        <span class="rv-state-ico">${icon("calendar")}</span>
        <h2>Reservas no disponibles por ahora</h2>
        <p>Vuelve a intentarlo más tarde${b?.phone ? `, o llámanos al ${escapeHtml(b.phone)}` : ""}.</p>
      </div>`;
    dock.classList.add("is-solo");
    dock.innerHTML = `<a class="gb-cta" href="../cliente/">Volver al inicio ${ctaIco("arrow")}</a>`;
    return;
  }

  // La confirmación no es un paso del progreso: tiene su propia barra.
  if (state.step === "listo") {
    pintarListo(main, dock);
    return;
  }

  actualizarBarra();

  const pintores = {
    servicio: pintarServicio,
    barbero: pintarBarbero,
    fecha: pintarFecha,
    horario: pintarHorario,
    datos: pintarDatos,
  };
  pintores[state.step](main);
  pintarDock(dock, configDock());

  soltarPress = press(main, "[data-press]");
  stepIn(main, state.dir);
  window.scrollTo({ top: 0, behavior: "auto" });
}

function actualizarBarra() {
  const i = indicePaso(state.step);
  const rail = document.getElementById("rv-rail");
  const back = document.getElementById("rv-back");
  rail.hidden = false;
  rail.setAttribute("aria-valuenow", String(i + 1));
  rail.setAttribute("aria-valuetext", `Paso ${i + 1} de ${PASOS.length}: ${PASOS[i].titulo}`);
  railTo(document.getElementById("rv-rail-fill"), ((i + 1) / PASOS.length) * 100);
  document.getElementById("rv-count").textContent = `${i + 1}/${PASOS.length}`;

  // En el primer paso el botón de volver sale de la reserva; en los demás
  // retrocede un paso. Es un <a> real cuando navega y un botón cuando no.
  const anterior = i > 0 ? PASOS[i - 1] : null;
  const nuevo = document.createElement(anterior ? "button" : "a");
  nuevo.className = "rv-back";
  nuevo.id = "rv-back";
  nuevo.innerHTML = icon("arrow");
  if (anterior) {
    nuevo.type = "button";
    nuevo.setAttribute("aria-label", `Volver a ${anterior.titulo}`);
    nuevo.addEventListener("click", () => irA(anterior.key, -1));
  } else {
    nuevo.href = "../cliente/";
    nuevo.setAttribute("aria-label", "Volver al inicio");
  }
  back.replaceWith(nuevo);
}

function irA(step, dir = 1) {
  state.dir = dir;
  state.step = step;
  state.error = null;
  pintar();
}

/* ---------------------------------------------------------------
   Muelle inferior
   --------------------------------------------------------------- */
// Qué muestra y qué hace el muelle en cada paso. Una sola fuente de verdad:
// así repintar solo el muelle (al elegir una opción) no toca el cuerpo.
function configDock() {
  if (state.step === "servicio") {
    return {
      info: state.service ? { k: "Servicio", v: `${state.service.name} · ${formatCents(state.service.price_cents)}` } : null,
      etiqueta: "Continuar",
      activo: Boolean(state.service),
      alPulsar: () => state.service && irA("barbero", 1),
    };
  }
  if (state.step === "barbero") {
    return {
      info: state.barber ? { k: "Barbero", v: state.barber.name } : null,
      etiqueta: "Continuar",
      activo: Boolean(state.barber),
      alPulsar: () => state.barber && irA("fecha", 1),
    };
  }
  if (state.step === "fecha") {
    const iso = state.dateISO || todayLocalISO();
    return {
      info: { k: "Fecha", v: capitalizar(dateShort(iso)) },
      etiqueta: "Ver horarios",
      activo: true,
      alPulsar: () => {
        state.dateISO = iso;
        irA("horario", 1);
      },
    };
  }
  if (state.step === "horario") {
    return {
      info: { k: "Horario", v: state.slot ? timeHHMM(state.slot.slot_start) : "Sin elegir" },
      etiqueta: "Continuar",
      activo: Boolean(state.slot),
      alPulsar: () => state.slot && irA("datos", 1),
    };
  }
  return {
    info: { k: "Total", v: formatCents(state.service.price_cents) },
    etiqueta: "Confirmar reserva",
    activo: true,
    alPulsar: confirmar,
  };
}

function refrescarDock() {
  pintarDock(document.getElementById("rv-dock"), configDock());
}

function pintarDock(dock, { info, etiqueta, activo, alPulsar }) {
  dock.classList.toggle("is-solo", !info);
  dock.innerHTML = `
    ${info ? `<div class="rv-dock-info"><span class="rv-dock-k">${escapeHtml(info.k)}</span><span class="rv-dock-v">${escapeHtml(info.v)}</span></div>` : ""}
    <button type="button" class="gb-cta" id="rv-go" ${activo ? "" : "disabled"}>${escapeHtml(etiqueta)} ${ctaIco("arrow")}</button>`;
  dock.querySelector("#rv-go").addEventListener("click", alPulsar);
}

/* ===============================================================
   PASO 1 — Servicio (solo public_services)
   =============================================================== */
function pintarServicio(main) {
  main.innerHTML = `
    <div class="rv-step">
      <p class="rv-kicker" data-rv-in>Paso 1 de 5</p>
      <h1 class="rv-title" data-rv-in>Elige tu servicio</h1>
      <p class="rv-sub" data-rv-in>El precio y la duración son los que tenemos publicados hoy.</p>
      ${
        state.services.length
          ? `<div class="rv-list" role="radiogroup" aria-label="Servicios">
              ${state.services.map((s) => opcionServicio(s)).join("")}
            </div>`
          : `<div class="rv-state" data-rv-in>
              <span class="rv-state-ico">${icon("scissors")}</span>
              <h2>Sin servicios publicados</h2>
              <p>En este momento no hay servicios disponibles para reservar.</p>
            </div>`
      }
    </div>`;

  main.querySelectorAll("[data-service]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.service = state.services.find((s) => s.id === btn.dataset.service);
      // El horario dependía del servicio anterior: deja de ser válido.
      state.slot = null;
      state.slots = [];
      marcarElegido(main, "[data-service]", btn);
      refrescarDock();
    })
  );
}

function opcionServicio(s) {
  const elegido = state.service?.id === s.id;
  return `
    <button type="button" class="rv-opt ${elegido ? "is-on" : ""}" data-press data-service="${escapeHtml(s.id)}"
            role="radio" aria-checked="${elegido}">
      <span class="rv-opt-mark" aria-hidden="true">${icon(iconForService(s.icon))}</span>
      <span class="rv-opt-body">
        <span class="rv-opt-name">${escapeHtml(s.name)}</span>
        ${hasText(s.description) ? `<span class="rv-opt-desc">${escapeHtml(s.description)}</span>` : ""}
      </span>
      <span class="rv-opt-side">
        <span class="rv-opt-price">${formatCents(s.price_cents)}</span>
        ${s.duration_minutes ? `<span class="rv-opt-time">${s.duration_minutes} min</span>` : ""}
      </span>
      <span class="rv-opt-check" aria-hidden="true">${icon("check")}</span>
    </button>`;
}

/* ===============================================================
   PASO 2 — Barbero (solo public_barbers)
   =============================================================== */
function pintarBarbero(main) {
  main.innerHTML = `
    <div class="rv-step">
      <p class="rv-kicker" data-rv-in>Paso 2 de 5</p>
      <h1 class="rv-title" data-rv-in>¿Con quién te atiendes?</h1>
      <p class="rv-sub" data-rv-in>${escapeHtml(state.service.name)} · ${formatCents(state.service.price_cents)}</p>
      ${
        state.barbers.length
          ? `<div class="rv-list" role="radiogroup" aria-label="Barberos">
              ${state.barbers.map((b) => opcionBarbero(b)).join("")}
            </div>`
          : `<div class="rv-state" data-rv-in>
              <span class="rv-state-ico">${icon("user")}</span>
              <h2>Sin barberos disponibles</h2>
              <p>En este momento no hay barberos publicados para reservar.</p>
            </div>`
      }
    </div>`;

  main.querySelectorAll("[data-barber]").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.barber = state.barbers.find((b) => b.id === btn.dataset.barber);
      state.slot = null;
      state.slots = [];
      marcarElegido(main, "[data-barber]", btn);
      refrescarDock();
    })
  );
}

function opcionBarbero(b) {
  const elegido = state.barber?.id === b.id;
  const foto = barberImage(b);
  return `
    <button type="button" class="rv-opt ${elegido ? "is-on" : ""}" data-press data-barber="${escapeHtml(b.id)}"
            role="radio" aria-checked="${elegido}">
      <span class="rv-opt-mark" aria-hidden="true">
        ${foto ? `<img src="${escapeHtml(foto)}" alt="" loading="lazy" decoding="async">` : `<span class="rv-opt-ini">${escapeHtml(initials(b.name))}</span>`}
      </span>
      <span class="rv-opt-body">
        <span class="rv-opt-name">${escapeHtml(b.name)}</span>
        ${hasText(b.bio) ? `<span class="rv-opt-desc">${escapeHtml(b.bio)}</span>` : ""}
      </span>
      <span class="rv-opt-check" aria-hidden="true">${icon("check")}</span>
    </button>`;
}

// Marca visual inmediata sin repintar el paso entero: el toque se siente
// al instante y no se pierde la posición del scroll.
function marcarElegido(main, selector, elegido) {
  main.querySelectorAll(selector).forEach((el) => {
    const on = el === elegido;
    el.classList.toggle("is-on", on);
    if (el.hasAttribute("role")) el.setAttribute("aria-checked", String(on));
  });
}

/* ===============================================================
   PASO 3 — Fecha
   Las fechas NO son disponibilidad: solo delimitan el rango que el
   negocio permite (max_days_ahead). Qué horas hay libres lo sigue
   diciendo public_available_slots en el paso siguiente.
   =============================================================== */
function pintarFecha(main) {
  const min = todayLocalISO();
  const max = addDaysISO(min, state.business.max_days_ahead || 30);
  const dias = [];
  for (let i = 0; dias.length === 0 || addDaysISO(min, i) <= max; i++) {
    const iso = addDaysISO(min, i);
    if (iso > max) break;
    dias.push({ iso, i });
  }
  const elegido = state.dateISO || min;
  const mes = capitalizar(dateFromISO(elegido).toLocaleDateString("es-MX", { month: "long", year: "numeric" }));

  main.innerHTML = `
    <div class="rv-step">
      <p class="rv-kicker" data-rv-in>Paso 3 de 5</p>
      <h1 class="rv-title" data-rv-in>¿Qué día te queda bien?</h1>
      <p class="rv-sub" data-rv-in>${escapeHtml(state.barber.name)} · ${escapeHtml(state.service.name)}</p>
      <p class="rv-month" id="rv-month" data-rv-in>${escapeHtml(mes)}</p>
      <div class="rv-days" role="radiogroup" aria-label="Día de la cita">
        ${dias.map((d) => chipDia(d, elegido)).join("")}
      </div>
      <div class="rv-exact" data-rv-in>
        <label for="rv-date">Otra fecha</label>
        <input type="date" id="rv-date" min="${min}" max="${max}" value="${elegido}">
      </div>
    </div>`;

  const marcarFecha = (iso) => {
    state.dateISO = iso;
    state.slot = null;
    state.slots = [];
    main.querySelectorAll("[data-day]").forEach((el) => {
      const on = el.dataset.day === iso;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-checked", String(on));
    });
    const campo = main.querySelector("#rv-date");
    if (campo && campo.value !== iso) campo.value = iso;
    main.querySelector("#rv-month").textContent = capitalizar(
      dateFromISO(iso).toLocaleDateString("es-MX", { month: "long", year: "numeric" })
    );
    refrescarDock();
  };

  main.querySelectorAll("[data-day]").forEach((btn) =>
    btn.addEventListener("click", () => marcarFecha(btn.dataset.day))
  );
  main.querySelector("#rv-date").addEventListener("change", (ev) => {
    const v = ev.target.value;
    if (!v || v < min || v > max) {
      ev.target.value = state.dateISO || min;
      return;
    }
    marcarFecha(v);
    const chip = main.querySelector(`[data-day="${v}"]`);
    if (chip) chip.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  });

  if (!state.dateISO) state.dateISO = elegido;
  const activo = main.querySelector(".rv-day.is-on");
  if (activo) activo.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
}

function chipDia({ iso, i }, elegido) {
  const d = dateFromISO(iso);
  const dow = d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", "");
  const etiqueta = i === 0 ? "hoy" : i === 1 ? "mañana" : "";
  const on = iso === elegido;
  return `
    <button type="button" class="rv-day ${on ? "is-on" : ""}" data-press data-day="${iso}"
            role="radio" aria-checked="${on}" aria-label="${escapeHtml(capitalizar(dateLong(iso)))}">
      <span class="rv-day-dow" aria-hidden="true">${escapeHtml(dow)}</span>
      <span class="rv-day-num" aria-hidden="true">${d.getDate()}</span>
      ${etiqueta ? `<span class="rv-day-tag" aria-hidden="true">${etiqueta}</span>` : ""}
    </button>`;
}

/* ===============================================================
   PASO 4 — Horario
   La disponibilidad SIEMPRE viene de Supabase: nunca se calculan horas
   en el frontend. public_available_slots ya descarta lo ocupado, lo
   bloqueado y lo que no cumple la antelación mínima o el horario del
   barbero ese día.
   =============================================================== */
const FRANJAS = [
  { key: "manana", titulo: "Mañana", ico: "sun" },
  { key: "tarde", titulo: "Tarde", ico: "clock" },
  { key: "noche", titulo: "Noche", ico: "moon" },
];

function franjaDe(iso) {
  const h = new Date(iso).getHours();
  return h < 12 ? "manana" : h < 18 ? "tarde" : "noche";
}

async function pintarHorario(main) {
  main.innerHTML = `
    <div class="rv-step">
      <p class="rv-kicker" data-rv-in>Paso 4 de 5</p>
      <h1 class="rv-title" data-rv-in>Elige tu horario</h1>
      <p class="rv-sub" data-rv-in>${escapeHtml(capitalizar(dateLong(state.dateISO)))} · ${escapeHtml(state.barber.name)}</p>
      <div id="rv-slots">
        <div class="rv-skel" aria-hidden="true">${"<span></span>".repeat(8)}</div>
        <p class="sr-only" role="status">Buscando horarios disponibles…</p>
      </div>
    </div>`;

  const caja = main.querySelector("#rv-slots");
  try {
    const { data: slots, error } = await sb().rpc("public_available_slots", {
      p_barber_id: state.barber.id,
      p_date: state.dateISO,
      p_service_id: state.service.id,
    });
    if (error) throw error;
    state.slots = slots || [];

    // El paso pudo cambiar mientras la consulta viajaba.
    if (state.step !== "horario") return;

    if (state.slots.length === 0) {
      caja.innerHTML = `
        <div class="rv-state">
          <span class="rv-state-ico">${icon("calendar")}</span>
          <h2>Sin horarios ese día</h2>
          <p>No hay horarios disponibles el ${escapeHtml(dateLong(state.dateISO))} con ${escapeHtml(state.barber.name)}. Prueba con otra fecha.</p>
          <button type="button" class="gb-cta" id="rv-otra">Elegir otra fecha ${ctaIco("arrow")}</button>
        </div>`;
      caja.querySelector("#rv-otra").addEventListener("click", () => irA("fecha", -1));
      return;
    }

    caja.innerHTML = FRANJAS.map((f) => {
      const dentro = state.slots.filter((s) => franjaDe(s.slot_start) === f.key);
      if (!dentro.length) return "";
      return `
        <section class="rv-group">
          <h2 class="rv-group-head">${icon(f.ico)}${f.titulo}</h2>
          <div class="rv-times" role="radiogroup" aria-label="Horarios de la ${f.titulo.toLowerCase()}">
            ${dentro.map((s) => botonHora(s)).join("")}
          </div>
        </section>`;
    }).join("");

    caja.querySelectorAll("[data-start]").forEach((btn) =>
      btn.addEventListener("click", () => {
        // Se guarda literal la cadena que devolvió Supabase: es la que se
        // reenvía a book_appointment, sin reconstruirla.
        state.slot = state.slots.find((s) => s.slot_start === btn.dataset.start);
        caja.querySelectorAll("[data-start]").forEach((el) => {
          const on = el === btn;
          el.classList.toggle("is-on", on);
          el.setAttribute("aria-checked", String(on));
        });
        refrescarDock();
      })
    );
    if (soltarPress) soltarPress.destruir();
    soltarPress = press(main, "[data-press]");
  } catch (error) {
    if (state.step !== "horario") return;
    caja.innerHTML = `
      <div class="rv-state">
        <span class="rv-state-ico">${icon("alert")}</span>
        <h2>No pudimos consultar la disponibilidad</h2>
        <p>${escapeHtml(mensajeDeError(error))}</p>
        <button type="button" class="gb-cta" id="rv-reintentar">Reintentar ${ctaIco("arrow")}</button>
      </div>`;
    caja.querySelector("#rv-reintentar").addEventListener("click", () => pintar());
  }
}

function botonHora(s) {
  const on = state.slot?.slot_start === s.slot_start;
  return `<button type="button" class="rv-time ${on ? "is-on" : ""}" data-press data-start="${escapeHtml(s.slot_start)}"
           role="radio" aria-checked="${on}">${timeHHMM(s.slot_start)}</button>`;
}

/* ===============================================================
   PASO 5 — Datos
   Exactamente los campos que book_appointment acepta: nombre y
   teléfono obligatorios, correo y notas opcionales. Ni uno más.
   =============================================================== */
function pintarDatos(main) {
  const d = state.datos;
  main.innerHTML = `
    <div class="rv-step">
      <p class="rv-kicker" data-rv-in>Paso 5 de 5</p>
      <h1 class="rv-title" data-rv-in>Últimos datos</h1>
      <p class="rv-sub" data-rv-in>Revisa tu cita y déjanos cómo localizarte.</p>

      <div class="rv-card" data-rv-in>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("scissors")}Servicio</span><span class="rv-sum-v">${escapeHtml(state.service.name)}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("user")}Barbero</span><span class="rv-sum-v">${escapeHtml(state.barber.name)}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("calendar")}Fecha</span><span class="rv-sum-v">${escapeHtml(capitalizar(dateLong(state.dateISO)))}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("clock")}Hora</span><span class="rv-sum-v">${timeHHMM(state.slot.slot_start)} · ${state.service.duration_minutes} min</span></div>
        <div class="rv-sum-row is-total"><span class="rv-sum-k">${icon("ticket")}Total</span><span class="rv-sum-v">${formatCents(state.service.price_cents)}</span></div>
      </div>

      <div class="rv-card" data-rv-in>
        <div class="rv-field">
          <label for="rv-name">Nombre</label>
          <input id="rv-name" autocomplete="name" enterkeyhint="next" value="${escapeHtml(d.name)}" required>
        </div>
        <div class="rv-field">
          <label for="rv-phone">Celular</label>
          <input id="rv-phone" type="tel" inputmode="numeric" autocomplete="tel" enterkeyhint="next"
                 placeholder="10 dígitos" value="${escapeHtml(d.phone)}" required>
        </div>
        <div class="rv-field">
          <label for="rv-email">Correo <span style="text-transform:none;letter-spacing:0">(opcional)</span></label>
          <input id="rv-email" type="email" autocomplete="email" enterkeyhint="next" value="${escapeHtml(d.email)}">
        </div>
        <div class="rv-field">
          <label for="rv-notes">Notas <span style="text-transform:none;letter-spacing:0">(opcional)</span></label>
          <textarea id="rv-notes" enterkeyhint="done" placeholder="Algo que tu barbero deba saber">${escapeHtml(d.notes)}</textarea>
        </div>
      </div>

      <p class="rv-note" data-rv-in>
        ${icon("info")}
        <span>Usamos tu <strong>celular</strong> para identificarte en tus próximas visitas y promociones. No creamos ninguna cuenta ni contraseña.</span>
      </p>

      <div id="rv-error" role="alert"></div>
    </div>`;

  ["name", "phone", "email", "notes"].forEach((campo) => {
    const el = main.querySelector(`#rv-${campo}`);
    el.addEventListener("input", () => {
      state.datos[campo] = el.value;
      el.closest(".rv-field").classList.remove("is-bad");
      const err = el.closest(".rv-field").querySelector(".rv-field-err");
      if (err) err.remove();
    });
    // Con el teclado abierto el campo puede quedar debajo del muelle.
    el.addEventListener("focus", () => {
      setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 260);
    });
  });
}

function marcarCampoMal(id, mensaje) {
  const campo = document.querySelector(`#rv-${id}`).closest(".rv-field");
  campo.classList.add("is-bad");
  if (!campo.querySelector(".rv-field-err")) {
    campo.insertAdjacentHTML("beforeend", `<span class="rv-field-err">${escapeHtml(mensaje)}</span>`);
  }
  document.querySelector(`#rv-${id}`).focus();
}

let enviando = false;

async function confirmar() {
  if (enviando) return;
  const main = document.getElementById("rv-main");
  const cajaError = main.querySelector("#rv-error");
  cajaError.innerHTML = "";

  const name = main.querySelector("#rv-name").value.trim();
  const phone = main.querySelector("#rv-phone").value.trim();
  const email = main.querySelector("#rv-email").value.trim();
  const notes = main.querySelector("#rv-notes").value.trim();
  state.datos = { name, phone, email, notes };

  if (!name) return marcarCampoMal("name", "Escribe tu nombre.");
  if (!phone) return marcarCampoMal("phone", "Escribe tu celular.");

  enviando = true;
  const btn = document.querySelector("#rv-go");
  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.innerHTML = `Reservando… ${ctaIco("clock")}`;
  try {
    // starts_at se manda EXACTAMENTE como lo devolvió public_available_slots
    // (state.slot.slot_start), nunca reconstruido — book_appointment
    // rechaza cualquier hora que no coincida con un hueco real.
    const { data: appt, error } = await sb().rpc("book_appointment", {
      p_barber_id: state.barber.id,
      p_service_id: state.service.id,
      p_starts_at: state.slot.slot_start,
      p_client_name: name,
      p_client_phone: phone,
      p_client_email: email || null,
      p_notes: notes || null,
    });
    if (error) throw error;
    // Solo se pasa a la confirmación si el RPC devolvió una cita real.
    if (!appt || !appt.booking_code) throw new Error("No se pudo completar la reserva. Inténtalo de nuevo.");
    state.result = appt;
    enviando = false;
    irA("listo", 1);
  } catch (error) {
    enviando = false;
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.innerHTML = `Confirmar reserva ${ctaIco("arrow")}`;
    cajaError.innerHTML = `<div class="rv-alert">${icon("alert")}<span>${escapeHtml(mensajeDeError(error))}</span></div>`;
    cajaError.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

/* ===============================================================
   CONFIRMACIÓN — con lo que el RPC guardó de verdad
   =============================================================== */
function pintarListo(main, dock) {
  const appt = state.result;
  const rail = document.getElementById("rv-rail");
  rail.hidden = true;
  document.getElementById("rv-count").textContent = "";
  document.getElementById("rv-back").replaceWith(crearVolverInicio());

  main.innerHTML = `
    <div class="rv-done">
      <span class="rv-seal" data-rv-seal aria-hidden="true">${icon("check")}</span>
      <h1 class="rv-done-title" data-rv-in>Cita confirmada</h1>
      <p class="rv-done-sub" data-rv-in>Te esperamos${appt.client_name ? `, ${escapeHtml(String(appt.client_name).split(" ")[0])}` : ""}. Guarda tu código por si necesitas mencionarlo.</p>

      <div class="rv-code" data-rv-in>
        <span class="rv-code-k">Código de reserva</span>
        <span class="rv-code-v">${escapeHtml(appt.booking_code)}</span>
      </div>

      <div class="rv-card" data-rv-in>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("scissors")}Servicio</span><span class="rv-sum-v">${escapeHtml(appt.service_name || state.service.name)}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("user")}Barbero</span><span class="rv-sum-v">${escapeHtml(state.barber.name)}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("calendar")}Fecha</span><span class="rv-sum-v">${escapeHtml(capitalizar(dateLong(state.dateISO)))}</span></div>
        <div class="rv-sum-row"><span class="rv-sum-k">${icon("clock")}Hora</span><span class="rv-sum-v">${timeHHMM(appt.starts_at)}</span></div>
        ${appt.client_name ? `<div class="rv-sum-row"><span class="rv-sum-k">${icon("user")}A nombre de</span><span class="rv-sum-v">${escapeHtml(appt.client_name)}</span></div>` : ""}
        ${appt.client_phone ? `<div class="rv-sum-row"><span class="rv-sum-k">${icon("phone")}Celular</span><span class="rv-sum-v">${escapeHtml(appt.client_phone)}</span></div>` : ""}
        ${appt.price_cents != null ? `<div class="rv-sum-row is-total"><span class="rv-sum-k">${icon("ticket")}Total</span><span class="rv-sum-v">${formatCents(appt.price_cents)}</span></div>` : ""}
      </div>

      <div class="rv-done-acts" data-rv-in>
        <a class="rv-ghost" href="../cliente/">Volver al inicio</a>
        <button type="button" class="rv-ghost" id="rv-new">Hacer otra reserva</button>
      </div>
    </div>`;

  dock.innerHTML = "";
  main.querySelector("#rv-new").addEventListener("click", () => {
    state.service = null;
    state.barber = null;
    state.dateISO = null;
    state.slots = [];
    state.slot = null;
    state.result = null;
    state.datos = { name: "", phone: "", email: "", notes: "" };
    irA("servicio", -1);
  });
  confirmPop(main);
}

function crearVolverInicio() {
  const a = document.createElement("a");
  a.className = "rv-back";
  a.id = "rv-back";
  a.href = "../cliente/";
  a.setAttribute("aria-label", "Volver al inicio");
  a.innerHTML = icon("arrow");
  return a;
}


boot();
