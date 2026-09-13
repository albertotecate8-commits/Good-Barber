// Piezas de interfaz compartidas entre la agenda del administrador y la del
// barbero: tarjeta de cita, botones de acción según el estado, formato de
// hora/fecha. Nada aquí decide permisos — eso lo sigue haciendo RLS en el
// servidor; esto solo evita que un barbero VEA botones para acciones que de
// todas formas el servidor le rechazaría.

import * as agenda from "./agenda-data.js";
import { toast, friendlyError, showLoading, confirmDialog, escapeHtml } from "./ui.js";
import { formatCents } from "./money.js";
import { toISODate, todayISO, parseISODate, startOfAgendaWeek, shiftISODate } from "./dates.js";

export const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const STATUS_LABEL = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No se presentó",
};
const STATUS_BADGE = {
  pending: "badge-warning",
  confirmed: "badge-info",
  completed: "badge-success",
  cancelled: "badge-danger",
  no_show: "badge-neutral",
};
// Cada estado también se distingue por icono (no solo por color) y por el
// borde de acento de la tarjeta — ver .appointment-card[data-status] en
// css/styles.css. Puramente visual, no participa en ninguna decisión de
// permisos ni de qué botones mostrar (eso lo sigue decidiendo
// wireAppointmentActions exactamente igual que antes).
const STATUS_ICON = {
  pending: "⏳",
  confirmed: "✓",
  completed: "✔",
  cancelled: "✕",
  no_show: "⦸",
};

function timeHHMM(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatRangeLocal(startsAtISO, endsAtISO) {
  const start = new Date(startsAtISO);
  const end = new Date(endsAtISO);
  const dateText = start.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${dateText} · ${timeHHMM(startsAtISO)} – ${timeHHMM(endsAtISO)}`;
}

export function renderAppointmentCard(a, { showBarber = false } = {}) {
  const status = a.status || "pending";
  return `
    <div class="card appointment-card" data-appt="${a.id}" data-status="${status}">
      <div class="appt-top">
        <div class="appt-time">
          <span class="appt-time-start">${timeHHMM(a.starts_at)}</span>
          ${a.ends_at ? `<span class="appt-time-end">– ${timeHHMM(a.ends_at)}</span>` : ""}
        </div>
        <span class="badge ${STATUS_BADGE[status] || "badge-neutral"} appt-status-badge">
          <span class="appt-status-icon">${STATUS_ICON[status] || "•"}</span>${STATUS_LABEL[status] || status}
        </span>
      </div>
      ${showBarber ? `<div class="appt-barber">💈 ${escapeHtml(a.barbers?.name || "—")}</div>` : ""}
      <div class="appt-client">
        <div class="appt-client-name">${escapeHtml(a.client_name)}</div>
        <div class="appt-client-phone">${a.client_phone ? escapeHtml(a.client_phone) : "Sin teléfono"}</div>
      </div>
      <div class="appt-service">
        <span class="appt-service-name">${escapeHtml(a.service_name)}</span>
        <span class="appt-service-meta">${a.duration_minutes} min · ${formatCents(a.price_cents)}</span>
      </div>
      <div class="appt-code">Código: ${escapeHtml(a.booking_code)}</div>
      ${a.notes ? `<div class="appt-notes">Nota: ${escapeHtml(a.notes)}</div>` : ""}
      <div class="flex gap-8 mt-16" data-actions></div>
    </div>
  `;
}

// Pinta los botones que corresponden al ESTADO de cada cita y conecta sus
// acciones. Un estado sin botones (completada/cancelada/no-show) se queda
// solo con la insignia — no hay nada más que hacer ahí.
export function wireAppointmentActions(list, appointments, onDone) {
  appointments.forEach((a) => {
    const slot = list.querySelector(`[data-appt="${a.id}"] [data-actions]`);
    if (!slot) return;
    const buttons = [];
    if (a.status === "pending") buttons.push(`<button class="btn btn-ghost btn-sm appt-action appt-action-confirm" data-confirm="${a.id}">✓ Confirmar</button>`);
    if (a.status === "pending" || a.status === "confirmed") buttons.push(`<button class="btn btn-ghost btn-sm appt-action appt-action-cancel" data-cancel="${a.id}">✕ Cancelar</button>`);
    if (a.status === "confirmed") buttons.push(`<button class="btn btn-primary btn-sm appt-action appt-action-complete" data-complete="${a.id}">✔ Completar</button>`);
    slot.innerHTML = buttons.join("");
  });

  list.querySelectorAll("[data-confirm]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      showLoading(true, "Confirmando…");
      try {
        await agenda.confirmAppointment(btn.dataset.confirm);
        toast("Cita confirmada.", "success");
        onDone();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    })
  );

  list.querySelectorAll("[data-cancel]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Cancelar cita",
        message: "¿Cancelar esta cita? El horario quedará libre de nuevo para que alguien más pueda reservarlo.",
        confirmLabel: "Cancelar cita",
        danger: true,
      });
      if (!ok) return;
      showLoading(true, "Cancelando…");
      try {
        await agenda.cancelAppointment(btn.dataset.cancel);
        toast("Cita cancelada.", "success");
        onDone();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    })
  );

  list.querySelectorAll("[data-complete]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Completar cita",
        message: "¿Marcar esta cita como completada? Se generará automáticamente el registro de venta correspondiente.",
        confirmLabel: "Completar",
      });
      if (!ok) return;
      showLoading(true, "Completando…");
      try {
        await agenda.completeAppointment(btn.dataset.complete);
        toast("Cita completada. Se registró la venta.", "success");
        onDone();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    })
  );
}

// Tira de 7 días (lunes a domingo) para cambiar de día y ver la semana de un
// vistazo. weekStartDate: objeto Date del lunes de la semana a mostrar.
export function dayStripHTML(days, activeDateISO) {
  return days
    .map(
      (d) => `
    <button type="button" class="day-chip ${d === activeDateISO ? "active" : ""}" data-date="${d}">
      <span class="day-chip-name">${WEEKDAY_NAMES[new Date(d + "T00:00:00").getDay()].slice(0, 3)}</span>
      <span class="day-chip-num">${Number(d.slice(8, 10))}</span>
      <span class="day-chip-count" data-count="${d}"></span>
    </button>
  `
    )
    .join("");
}

/* ===============================================================
   Navegación de semanas — compartida por las dos agendas.
   Solo cambia QUÉ semana se pinta: no toca la consulta de citas, ni el
   filtro por barber_id, ni la zona horaria.
   =============================================================== */

// Tope de recorrido: un año hacia cada lado. Evita que la navegación se
// vuelva infinita y que alguien acabe en el año 3000 a base de pulsar.
const LIMITE_SEMANAS = 52;

// Los 7 días (lunes a domingo) de la semana que empieza en weekStartISO.
export function diasDeSemana(weekStartISO) {
  const start = parseISODate(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return toISODate(d);
  });
}

// Día que debe quedar seleccionado al mostrar una semana: hoy si cae dentro
// de ella, y si no el lunes. Así al abrir en domingo se entra directo al
// lunes siguiente, que es el primer día con trabajo.
export function diaInicialDeSemana(weekStartISO, preferidoISO = todayISO()) {
  const dias = diasDeSemana(weekStartISO);
  return dias.includes(preferidoISO) ? preferidoISO : dias[0];
}

export function semanaDeHoyISO() {
  return toISODate(startOfAgendaWeek(new Date()));
}

function semanasDesdeHoy(weekStartISO) {
  const a = parseISODate(semanaDeHoyISO());
  const b = parseISODate(weekStartISO);
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

// "7 – 13 de septiembre de 2026" · "28 de septiembre – 4 de octubre de 2026"
function rangoTexto(weekStartISO) {
  const dias = diasDeSemana(weekStartISO);
  const ini = parseISODate(dias[0]);
  const fin = parseISODate(dias[6]);
  const mismoMes = ini.getMonth() === fin.getMonth() && ini.getFullYear() === fin.getFullYear();
  const mesFin = fin.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
  return mismoMes
    ? `${ini.getDate()} – ${fin.getDate()} de ${mesFin}`
    : `${ini.getDate()} de ${ini.toLocaleDateString("es-MX", { month: "long" })} – ${fin.getDate()} de ${mesFin}`;
}

export function weekNavHTML(weekStartISO) {
  const off = semanasDesdeHoy(weekStartISO);
  const finPrev = off <= -LIMITE_SEMANAS;
  const finNext = off >= LIMITE_SEMANAS;
  const esActual = off === 0;
  return `
    <div class="week-nav">
      <button type="button" class="week-nav-btn" data-week="prev"
              aria-label="Ver la semana anterior" ${finPrev ? "disabled" : ""}>
        <span aria-hidden="true">←</span>
      </button>
      <button type="button" class="week-nav-btn week-nav-now" data-week="now"
              aria-label="Volver a la semana actual" ${esActual ? "disabled" : ""}>
        Semana actual
      </button>
      <button type="button" class="week-nav-btn" data-week="next"
              aria-label="Ver la semana siguiente" ${finNext ? "disabled" : ""}>
        <span aria-hidden="true">→</span>
      </button>
    </div>
    <p class="week-nav-range" role="status">${rangoTexto(weekStartISO)}${esActual ? " · esta semana" : ""}</p>
  `;
}

// Conecta los tres botones. `state` necesita weekStart y date; onChange
// vuelve a pintar la vista con el estado ya actualizado.
export function wireWeekNav(root, state, onChange) {
  root.querySelectorAll("[data-week]").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      const accion = btn.dataset.week;
      if (accion === "now") state.weekStart = semanaDeHoyISO();
      else state.weekStart = shiftISODate(state.weekStart, accion === "prev" ? -7 : 7);
      state.date = diaInicialDeSemana(state.weekStart);
      onChange();
    })
  );
}
