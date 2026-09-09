// Reserva pública. Usa EXCLUSIVAMENTE lo ya creado y verificado en la
// Etapa 1: las vistas public_business/public_services/public_barbers, la
// función public_available_slots y el RPC book_appointment. No inventa
// ningún horario: cada botón de hora viene tal cual de Supabase, y la hora
// exacta que se envía a book_appointment es la misma cadena que devolvió
// public_available_slots — nunca una reconstruida a mano.
import { mountUiRoots, toast, showLoading, escapeHtml } from "../../js/ui.js";
import { formatCents } from "../../js/money.js";

function sb() {
  return window.supabaseClient;
}

const root = document.getElementById("app");
mountUiRoots();

const state = {
  business: null,
  services: [],
  barbers: [],
  service: null,
  barber: null,
  dateISO: null,
  slots: [],
  slot: null,
  step: "servicio", // servicio -> barbero -> fecha -> horario -> datos -> listo
};

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeHHMM(iso) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function dateLong(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", { weekday: "long", day: "2-digit", month: "long" });
}

async function boot() {
  showLoading(true, "Cargando…");
  try {
    const [{ data: business, error: e1 }, { data: services, error: e2 }, { data: barbers, error: e3 }] = await Promise.all([
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
    showLoading(false);
    render();
  } catch (error) {
    showLoading(false);
    root.innerHTML = `
      <div class="booking-page">
        <div class="card text-center">
          <h3>No se pudo cargar la página</h3>
          <p class="text-muted mt-8">${escapeHtml(error?.message || "Inténtalo de nuevo en unos minutos.")}</p>
        </div>
      </div>
    `;
  }
}

function header() {
  const b = state.business;
  return `
    <div class="booking-header">
      <div class="logo-mark">GB</div>
      <h1>${escapeHtml(b?.business_name || "Good Barber")}</h1>
      <div class="tagline">${escapeHtml(b?.tagline || "")}</div>
      ${
        b?.promo_active && b?.promo_text
          ? `<div class="badge badge-info booking-promo">${escapeHtml(b.promo_text)}</div>`
          : ""
      }
    </div>
  `;
}

function render() {
  const b = state.business;

  if (!b?.booking_enabled) {
    root.innerHTML = `
      <div class="booking-page">
        ${header()}
        <div class="card text-center">
          <h3>Reservas no disponibles por el momento</h3>
          <p class="text-muted mt-8">Vuelve a intentarlo más tarde${b?.phone ? `, o llámanos al ${escapeHtml(b.phone)}` : ""}.</p>
        </div>
      </div>
    `;
    return;
  }

  if (state.step === "servicio") return renderServicio();
  if (state.step === "barbero") return renderBarbero();
  if (state.step === "fecha") return renderFecha();
  if (state.step === "horario") return renderHorario();
  if (state.step === "datos") return renderDatos();
  if (state.step === "listo") return renderListo();
}

function renderServicio() {
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <div class="booking-step-label">Paso 1 de 5 · Elige un servicio</div>
      <div class="service-picker">
        ${state.services
          .map(
            (s) => `
          <button type="button" class="service-pick" data-id="${s.id}">
            <div class="service-pick-name">${s.icon ? s.icon + " " : ""}${escapeHtml(s.name)}</div>
            <div class="service-pick-price">${formatCents(s.price_cents)} · ${s.duration_minutes} min</div>
          </button>
        `
          )
          .join("")}
      </div>
      ${state.services.length === 0 ? `<div class="card empty-state"><div class="icon">✂️</div>No hay servicios disponibles en este momento.</div>` : ""}
    </div>
  `;
  root.querySelectorAll(".service-pick").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.service = state.services.find((s) => s.id === btn.dataset.id);
      state.step = "barbero";
      render();
    })
  );
}

function renderBarbero() {
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <button type="button" class="btn btn-ghost btn-sm" id="rv-back">← ${escapeHtml(state.service.name)}</button>
      <div class="booking-step-label mt-16">Paso 2 de 5 · Elige un barbero</div>
      <div class="barber-picker">
        ${state.barbers
          .map(
            (bb) => `
          <button type="button" class="barber-pick" data-id="${bb.id}">
            <div class="barber-pick-avatar">${bb.photo_url ? `<img src="${escapeHtml(bb.photo_url)}" alt="">` : escapeHtml((bb.name || "?").slice(0, 1))}</div>
            <div class="barber-pick-name">${escapeHtml(bb.name)}</div>
            ${bb.bio ? `<div class="barber-pick-bio">${escapeHtml(bb.bio)}</div>` : ""}
          </button>
        `
          )
          .join("")}
      </div>
      ${state.barbers.length === 0 ? `<div class="card empty-state"><div class="icon">💈</div>No hay barberos disponibles en este momento.</div>` : ""}
    </div>
  `;
  root.querySelector("#rv-back").addEventListener("click", () => {
    state.step = "servicio";
    render();
  });
  root.querySelectorAll(".barber-pick").forEach((btn) =>
    btn.addEventListener("click", () => {
      state.barber = state.barbers.find((b) => b.id === btn.dataset.id);
      state.step = "fecha";
      render();
    })
  );
}

function renderFecha() {
  const min = todayLocalISO();
  const max = addDaysISO(min, state.business.max_days_ahead || 30);
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <button type="button" class="btn btn-ghost btn-sm" id="rv-back">← ${escapeHtml(state.barber.name)}</button>
      <div class="booking-step-label mt-16">Paso 3 de 5 · Elige una fecha</div>
      <div class="card">
        <div class="field" style="margin-bottom:0">
          <label for="rv-date">Fecha</label>
          <input type="date" id="rv-date" min="${min}" max="${max}" value="${state.dateISO || min}">
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block mt-16" id="rv-continue">Ver horarios disponibles</button>
    </div>
  `;
  root.querySelector("#rv-back").addEventListener("click", () => {
    state.step = "barbero";
    render();
  });
  root.querySelector("#rv-continue").addEventListener("click", () => {
    const value = root.querySelector("#rv-date").value;
    if (!value) {
      toast("Elige una fecha.", "error");
      return;
    }
    state.dateISO = value;
    state.step = "horario";
    render();
  });
}

async function renderHorario() {
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <button type="button" class="btn btn-ghost btn-sm" id="rv-back">← ${escapeHtml(dateLong(state.dateISO))}</button>
      <div class="booking-step-label mt-16">Paso 4 de 5 · Elige un horario</div>
      <div id="rv-slots"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    </div>
  `;
  root.querySelector("#rv-back").addEventListener("click", () => {
    state.step = "fecha";
    render();
  });

  const box = root.querySelector("#rv-slots");
  try {
    // La disponibilidad SIEMPRE viene de Supabase: nunca se calculan horas
    // en el frontend. public_available_slots ya descarta lo ocupado, lo
    // bloqueado y lo que no cumple la antelación mínima o el horario del
    // barbero ese día.
    const { data: slots, error } = await sb().rpc("public_available_slots", {
      p_barber_id: state.barber.id,
      p_date: state.dateISO,
      p_service_id: state.service.id,
    });
    if (error) throw error;
    state.slots = slots || [];

    if (state.slots.length === 0) {
      box.innerHTML = `<div class="card empty-state"><div class="icon">🗓️</div>No hay horarios disponibles ese día para ${escapeHtml(state.barber.name)}. Prueba con otra fecha.</div>`;
      return;
    }
    box.innerHTML = `<div class="slot-grid">${state.slots.map((s) => `<button type="button" class="slot-btn" data-start="${s.slot_start}">${timeHHMM(s.slot_start)}</button>`).join("")}</div>`;
    box.querySelectorAll(".slot-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        // Se guarda literal la cadena que devolvió Supabase: es la que se
        // reenvía a book_appointment, sin reconstruirla.
        state.slot = state.slots.find((s) => s.slot_start === btn.dataset.start);
        state.step = "datos";
        render();
      })
    );
  } catch (error) {
    box.innerHTML = `<div class="card text-danger">${escapeHtml(error?.message || "No se pudo consultar la disponibilidad.")}</div>`;
  }
}

function renderDatos() {
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <button type="button" class="btn btn-ghost btn-sm" id="rv-back">← Elegir otro horario</button>
      <div class="booking-step-label mt-16">Paso 5 de 5 · Tus datos</div>
      <div class="card">
        <div class="booking-summary-row"><span class="text-muted">Servicio</span><strong>${escapeHtml(state.service.name)}</strong></div>
        <div class="booking-summary-row"><span class="text-muted">Barbero</span><strong>${escapeHtml(state.barber.name)}</strong></div>
        <div class="booking-summary-row"><span class="text-muted">Fecha</span><strong>${escapeHtml(dateLong(state.dateISO))}</strong></div>
        <div class="booking-summary-row"><span class="text-muted">Hora</span><strong>${timeHHMM(state.slot.slot_start)}</strong></div>
        <div class="booking-summary-row"><span class="text-muted">Precio</span><strong>${formatCents(state.service.price_cents)}</strong></div>
      </div>
      <div class="card">
        <div class="field"><label for="rv-name">Nombre</label><input id="rv-name" autocomplete="name" required></div>
        <div class="field"><label for="rv-phone">Teléfono</label><input id="rv-phone" type="tel" autocomplete="tel" placeholder="10 dígitos" required></div>
        <div class="field"><label for="rv-email">Correo (opcional)</label><input id="rv-email" type="email" autocomplete="email"></div>
        <div class="field"><label for="rv-notes">Notas (opcional)</label><textarea id="rv-notes"></textarea></div>
        <div id="rv-error" class="text-danger mt-8 hidden"></div>
        <button type="button" class="btn btn-primary btn-block mt-16" id="rv-confirm">Confirmar reserva</button>
      </div>
    </div>
  `;
  root.querySelector("#rv-back").addEventListener("click", () => {
    state.step = "horario";
    render();
  });

  let submitting = false;
  root.querySelector("#rv-confirm").addEventListener("click", async () => {
    if (submitting) return;
    const errorBox = root.querySelector("#rv-error");
    errorBox.classList.add("hidden");
    const name = root.querySelector("#rv-name").value.trim();
    const phone = root.querySelector("#rv-phone").value.trim();
    const email = root.querySelector("#rv-email").value.trim();
    const notes = root.querySelector("#rv-notes").value.trim();

    if (!name) {
      errorBox.textContent = "Escribe tu nombre.";
      errorBox.classList.remove("hidden");
      return;
    }
    if (!phone) {
      errorBox.textContent = "Escribe tu teléfono.";
      errorBox.classList.remove("hidden");
      return;
    }

    submitting = true;
    const btn = root.querySelector("#rv-confirm");
    btn.disabled = true;
    btn.textContent = "Reservando…";
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
      state.result = appt;
      state.step = "listo";
      render();
    } catch (error) {
      errorBox.textContent = error?.message || "No se pudo completar la reserva. Inténtalo de nuevo.";
      errorBox.classList.remove("hidden");
      submitting = false;
      btn.disabled = false;
      btn.textContent = "Confirmar reserva";
    }
  });
}

function renderListo() {
  const appt = state.result;
  root.innerHTML = `
    <div class="booking-page">
      ${header()}
      <div class="card confirmation-box">
        <div style="font-size:40px">✓</div>
        <h3 class="mt-8">¡Reserva confirmada!</h3>
        <p class="text-muted mt-8">Guarda tu código de reserva:</p>
        <div class="confirmation-code">${escapeHtml(appt.booking_code)}</div>
        <p>${escapeHtml(state.service.name)} con ${escapeHtml(state.barber.name)}</p>
        <p class="text-muted">${escapeHtml(dateLong(state.dateISO))} · ${timeHHMM(appt.starts_at)}</p>
        <button type="button" class="btn btn-primary btn-block mt-16" id="rv-new">Hacer otra reserva</button>
      </div>
    </div>
  `;
  root.querySelector("#rv-new").addEventListener("click", () => {
    state.service = null;
    state.barber = null;
    state.dateISO = null;
    state.slots = [];
    state.slot = null;
    state.result = null;
    state.step = "servicio";
    render();
  });
}

boot();
