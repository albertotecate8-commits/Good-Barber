// Agenda del administrador: citas de todos los barberos, horarios y
// bloqueos. Usa exclusivamente las tablas/RLS de la Etapa 1 — nada aquí
// crea estructura nueva en Supabase.

import * as agenda from "./agenda-data.js";
import * as data from "./data.js";
import { toast, friendlyError, showLoading, confirmDialog, openModal, escapeHtml } from "./ui.js";
import { toISODate, todayISO, parseISODate, startOfWeek } from "./dates.js";
import { WEEKDAY_NAMES, renderAppointmentCard, wireAppointmentActions, dayStripHTML, formatRangeLocal } from "./agenda-ui.js";

export async function renderAdminAgenda(container) {
  const state = { tab: "citas", date: todayISO(), barberId: "", hBarberId: "", barbers: [] };

  async function draw() {
    container.innerHTML = `
      <div class="agenda-view">
        <h2 class="view-title">Agenda</h2>
        <div class="agenda-tabs">
          <button type="button" class="agenda-tab ${state.tab === "citas" ? "active" : ""}" data-tab="citas">📅 Citas</button>
          <button type="button" class="agenda-tab ${state.tab === "horarios" ? "active" : ""}" data-tab="horarios">🗓️ Horarios</button>
          <button type="button" class="agenda-tab ${state.tab === "bloqueos" ? "active" : ""}" data-tab="bloqueos">🚫 Bloqueos</button>
        </div>
        <div id="agenda-body" class="mt-16"></div>
      </div>
    `;
    container.querySelectorAll("[data-tab]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.tab = btn.dataset.tab;
        draw();
      })
    );

    const body = container.querySelector("#agenda-body");
    try {
      if (!state.barbers.length) state.barbers = await data.listBarbers();
    } catch (error) {
      body.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
      return;
    }
    if (!state.hBarberId && state.barbers.length) state.hBarberId = state.barbers[0].id;

    if (state.tab === "citas") drawCitas(body);
    else if (state.tab === "horarios") drawHorarios(body);
    else drawBloqueos(body);
  }

  // ---------- Citas ----------
  async function drawCitas(body) {
    const weekStart = startOfWeek(parseISODate(state.date));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return toISODate(d);
    });

    body.innerHTML = `
      <div class="card agenda-filter-card">
        <div class="field" style="margin-bottom:12px">
          <label for="ag-c-barber">Barbero</label>
          <select id="ag-c-barber">
            <option value="">Todos</option>
            ${state.barbers.map((b) => `<option value="${b.id}" ${b.id === state.barberId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}
          </select>
        </div>
        <div class="day-strip" id="ag-day-strip">${dayStripHTML(days, state.date)}</div>
      </div>
      <div id="ag-c-list" class="mt-16 agenda-appt-list"><div class="text-center" style="padding:20px"><div class="spinner" style="margin:auto"></div></div></div>
    `;

    body.querySelector("#ag-c-barber").addEventListener("change", (e) => {
      state.barberId = e.target.value;
      drawCitas(body);
    });
    const strip = body.querySelector("#ag-day-strip");
    strip.querySelectorAll("[data-date]").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.date = btn.dataset.date;
        drawCitas(body);
      })
    );

    const list = body.querySelector("#ag-c-list");
    try {
      const [appointments, weekAppointments] = await Promise.all([
        agenda.listAppointmentsForDay(state.barberId || null, state.date),
        agenda.countAppointmentsForRange(state.barberId || null, days[0], days[6]),
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
        list.innerHTML = `<div class="card empty-state"><div class="icon">📅</div>No hay citas este día${state.barberId ? "" : " (todos los barberos)"}.</div>`;
        return;
      }
      list.innerHTML = appointments.map((a) => renderAppointmentCard(a, { showBarber: !state.barberId })).join("");
      wireAppointmentActions(list, appointments, () => drawCitas(body));
    } catch (error) {
      list.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  // ---------- Horarios ----------
  async function drawHorarios(body) {
    body.innerHTML = `
      <div class="card agenda-filter-card">
        <label for="ag-h-barber">Barbero</label>
        <select id="ag-h-barber">
          ${state.barbers.map((b) => `<option value="${b.id}" ${b.id === state.hBarberId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}
        </select>
      </div>
      <div id="ag-h-list" class="card card-flush mt-16 agenda-schedule-list"><div class="text-center" style="padding:20px"><div class="spinner" style="margin:auto"></div></div></div>
      <button class="dash-quick-action mt-16" id="ag-h-add" type="button">
        <span class="dash-quick-action-icon">➕</span>
        <span class="dash-quick-action-text">
          <span class="dash-quick-action-title">Agregar horario</span>
          <span class="dash-quick-action-sub">Nuevo bloque de disponibilidad</span>
        </span>
        <span class="dash-quick-action-arrow">→</span>
      </button>
    `;
    body.querySelector("#ag-h-barber").addEventListener("change", (e) => {
      state.hBarberId = e.target.value;
      drawHorarios(body);
    });
    body.querySelector("#ag-h-add").addEventListener("click", () => openScheduleForm(null, state.hBarberId, () => drawHorarios(body)));

    const list = body.querySelector("#ag-h-list");
    try {
      const schedules = await agenda.listBarberSchedules(state.hBarberId);
      if (schedules.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="icon">🗓️</div>Sin horarios configurados para este barbero.</div>`;
        return;
      }
      list.innerHTML = schedules
        .map(
          (s) => `
        <div class="card-row agenda-schedule-row">
          <div class="list-item-main">
            <div class="list-item-title">${WEEKDAY_NAMES[s.weekday]}${!s.active ? ' <span class="badge badge-neutral">Inactivo</span>' : ""}</div>
            <div class="list-item-sub">🕐 ${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}</div>
          </div>
          <div class="flex gap-8">
            <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Editar</button>
            <button class="btn btn-ghost btn-sm" data-del="${s.id}">Eliminar</button>
          </div>
        </div>
      `
        )
        .join("");
      list.querySelectorAll("[data-edit]").forEach((btn) => {
        const s = schedules.find((x) => x.id === btn.dataset.edit);
        btn.addEventListener("click", () => openScheduleForm(s, state.hBarberId, () => drawHorarios(body)));
      });
      list.querySelectorAll("[data-del]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const ok = await confirmDialog({
            title: "Eliminar horario",
            message: "¿Eliminar este horario? El barbero dejará de tener disponibilidad ese día y en ese rango.",
            confirmLabel: "Eliminar",
            danger: true,
          });
          if (!ok) return;
          showLoading(true, "Eliminando…");
          try {
            await agenda.deleteBarberSchedule(btn.dataset.del);
            toast("Horario eliminado.", "success");
            drawHorarios(body);
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        })
      );
    } catch (error) {
      list.innerHTML = `<div class="text-danger" style="padding:20px">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  function openScheduleForm(schedule, barberId, onDone) {
    const isEdit = !!schedule;
    const { overlay, close } = openModal(`
      <button type="button" class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
      <h3>${isEdit ? "Editar horario" : "Nuevo horario"}</h3>
      <div class="field mt-16">
        <label for="sf-weekday">Día</label>
        <select id="sf-weekday" ${isEdit ? "disabled" : ""}>
          ${WEEKDAY_NAMES.map((n, i) => `<option value="${i}" ${isEdit ? (schedule.weekday === i ? "selected" : "") : i === 1 ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="agenda-time-row">
        <div class="field"><label for="sf-start">Hora de inicio</label><input id="sf-start" type="time" value="${isEdit ? schedule.start_time.slice(0, 5) : "11:00"}"></div>
        <div class="field"><label for="sf-end">Hora de fin</label><input id="sf-end" type="time" value="${isEdit ? schedule.end_time.slice(0, 5) : "20:00"}"></div>
      </div>
      <div id="sf-error" class="text-danger mt-8 hidden"></div>
      <button type="button" class="btn btn-primary btn-block mt-16 qr-confirm-cta" id="sf-save">Guardar</button>
    `);

    overlay.querySelector("#sf-save").addEventListener("click", async () => {
      const errorBox = overlay.querySelector("#sf-error");
      errorBox.classList.add("hidden");
      const start = overlay.querySelector("#sf-start").value;
      const end = overlay.querySelector("#sf-end").value;
      if (!start || !end || start >= end) {
        errorBox.textContent = "La hora de fin debe ser posterior a la de inicio.";
        errorBox.classList.remove("hidden");
        return;
      }
      showLoading(true, "Guardando…");
      try {
        if (isEdit) {
          await agenda.updateBarberSchedule(schedule.id, { start_time: start, end_time: end });
        } else {
          await agenda.createBarberSchedule({ barberId, weekday: Number(overlay.querySelector("#sf-weekday").value), startTime: start, endTime: end });
        }
        toast("Horario guardado.", "success");
        close();
        onDone();
      } catch (error) {
        errorBox.textContent = friendlyError(error);
        errorBox.classList.remove("hidden");
      } finally {
        showLoading(false);
      }
    });
  }

  // ---------- Bloqueos ----------
  async function drawBloqueos(body) {
    body.innerHTML = `
      <button type="button" class="dash-quick-action" id="ag-b-add">
        <span class="dash-quick-action-icon">🚫</span>
        <span class="dash-quick-action-text">
          <span class="dash-quick-action-title">Bloquear horario</span>
          <span class="dash-quick-action-sub">Vacaciones, comida u otro motivo</span>
        </span>
        <span class="dash-quick-action-arrow">→</span>
      </button>
      <div id="ag-b-list" class="mt-16 agenda-block-list"><div class="text-center" style="padding:20px"><div class="spinner" style="margin:auto"></div></div></div>
    `;
    body.querySelector("#ag-b-add").addEventListener("click", () => openBlockForm(state.barbers, () => drawBloqueos(body)));

    const list = body.querySelector("#ag-b-list");
    try {
      const blocks = await agenda.listScheduleBlocks(null, new Date().toISOString());
      if (blocks.length === 0) {
        list.innerHTML = `<div class="card empty-state"><div class="icon">🚫</div>No hay bloqueos próximos.</div>`;
        return;
      }
      list.innerHTML = blocks
        .map(
          (b) => `
        <div class="card agenda-block-card">
          <div class="flex-between">
            <strong>${escapeHtml(b.barbers?.name || "Toda la barbería")}</strong>
            <button class="btn btn-ghost btn-sm" data-del="${b.id}">Eliminar</button>
          </div>
          <div class="text-muted mt-8">🕐 ${formatRangeLocal(b.starts_at, b.ends_at)}</div>
          ${b.reason ? `<div class="text-muted mt-8">📝 ${escapeHtml(b.reason)}</div>` : ""}
        </div>
      `
        )
        .join("");
      list.querySelectorAll("[data-del]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const ok = await confirmDialog({
            title: "Eliminar bloqueo",
            message: "¿Eliminar este bloqueo? Ese horario volverá a estar disponible para reservar.",
            confirmLabel: "Eliminar",
            danger: true,
          });
          if (!ok) return;
          showLoading(true, "Eliminando…");
          try {
            await agenda.deleteScheduleBlock(btn.dataset.del);
            toast("Bloqueo eliminado.", "success");
            drawBloqueos(body);
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        })
      );
    } catch (error) {
      list.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  function openBlockForm(barbers, onDone) {
    const { overlay, close } = openModal(`
      <button type="button" class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
      <h3>Bloquear horario</h3>
      <div class="field mt-16">
        <label for="bf-barber">Barbero</label>
        <select id="bf-barber">
          <option value="">Toda la barbería</option>
          ${barbers.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label for="bf-start">Desde</label><input id="bf-start" type="datetime-local"></div>
      <div class="field"><label for="bf-end">Hasta</label><input id="bf-end" type="datetime-local"></div>
      <div class="field"><label for="bf-reason">Motivo (opcional)</label><input id="bf-reason" placeholder="Vacaciones, comida, etc."></div>
      <div id="bf-error" class="text-danger mt-8 hidden"></div>
      <button type="button" class="btn btn-primary btn-block mt-16 qr-confirm-cta" id="bf-save">Guardar bloqueo</button>
    `);

    overlay.querySelector("#bf-save").addEventListener("click", async () => {
      const errorBox = overlay.querySelector("#bf-error");
      errorBox.classList.add("hidden");
      const startVal = overlay.querySelector("#bf-start").value;
      const endVal = overlay.querySelector("#bf-end").value;
      if (!startVal || !endVal) {
        errorBox.textContent = "Completa el inicio y el fin.";
        errorBox.classList.remove("hidden");
        return;
      }
      const startsAt = new Date(startVal).toISOString();
      const endsAt = new Date(endVal).toISOString();
      if (endsAt <= startsAt) {
        errorBox.textContent = "El fin debe ser posterior al inicio.";
        errorBox.classList.remove("hidden");
        return;
      }
      showLoading(true, "Guardando…");
      try {
        await agenda.createScheduleBlock({
          barberId: overlay.querySelector("#bf-barber").value || null,
          startsAt,
          endsAt,
          reason: overlay.querySelector("#bf-reason").value.trim(),
        });
        toast("Bloqueo creado.", "success");
        close();
        onDone();
      } catch (error) {
        errorBox.textContent = friendlyError(error);
        errorBox.classList.remove("hidden");
      } finally {
        showLoading(false);
      }
    });
  }

  draw();
}
