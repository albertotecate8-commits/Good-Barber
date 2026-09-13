// Agenda del barbero: solo sus propias citas. El filtro explícito por
// barber_id de aquí es defensa en profundidad — la barrera real es RLS
// (appointments_select: is_admin() o barber_id = current_barber_id()), que
// ya impide ver o tocar las citas de otro barbero aunque este filtro no
// existiera o se manipulara el frontend.

import * as agenda from "./agenda-data.js";
import { friendlyError, escapeHtml } from "./ui.js";
import { toISODate, todayISO } from "./dates.js";
import {
  renderAppointmentCard, wireAppointmentActions, dayStripHTML,
  weekNavHTML, wireWeekNav, diasDeSemana, diaInicialDeSemana, semanaDeHoyISO,
} from "./agenda-ui.js";

export async function renderBarberAgenda(container, ctx) {
  // weekStart manda sobre la semana mostrada; date, sobre el día consultado.
  // Antes la semana se derivaba del día, y como todos los chips caían dentro
  // de esa misma semana no había forma de salir de ella.
  const state = { weekStart: semanaDeHoyISO(), date: null };
  state.date = diaInicialDeSemana(state.weekStart, todayISO());

  async function draw() {
    const days = diasDeSemana(state.weekStart);

    container.innerHTML = `
      <div class="agenda-view">
        <h2 class="view-title">Agenda</h2>
        <div class="card agenda-filter-card">
          ${weekNavHTML(state.weekStart)}
          <div class="day-strip" id="ag-day-strip">${dayStripHTML(days, state.date)}</div>
        </div>
        <div id="ag-c-list" class="mt-16 agenda-appt-list"><div class="text-center" style="padding:20px"><div class="spinner" style="margin:auto"></div></div></div>
      </div>
    `;

    container.querySelectorAll("[data-date]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.date = btn.dataset.date;
        draw();
      })
    );
    wireWeekNav(container, state, draw);

    const list = container.querySelector("#ag-c-list");
    const strip = container.querySelector("#ag-day-strip");
    try {
      const [appointments, weekAppointments] = await Promise.all([
        agenda.listAppointmentsForDay(ctx.barber.id, state.date),
        agenda.countAppointmentsForRange(ctx.barber.id, days[0], days[6]),
      ]);

      const countByDate = {};
      weekAppointments.forEach((a) => {
        const d = toISODate(new Date(a.starts_at));
        countByDate[d] = (countByDate[d] || 0) + 1;
      });
      days.forEach((d) => {
        const el = strip.querySelector(`[data-count="${d}"]`);
        if (el && countByDate[d]) el.textContent = countByDate[d];
      });

      if (appointments.length === 0) {
        list.innerHTML = `<div class="card empty-state"><div class="icon">📅</div>No tienes citas este día.</div>`;
        return;
      }
      list.innerHTML = appointments.map((a) => renderAppointmentCard(a)).join("");
      wireAppointmentActions(list, appointments, draw);
    } catch (error) {
      list.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  draw();
}
