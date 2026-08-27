import * as data from "./data.js";
import { toast, friendlyError, showLoading, confirmDialog, openModal, escapeHtml } from "./ui.js";
import { formatCents, toCents } from "./money.js";
import { dayTotalCents, groupRecordsByDate, weekTotalCents, settlementBreakdown } from "./calc.js";
import { startOfWeek, endOfWeek, toISODate, todayISO, weekLabel, formatDateText, DIAS, dayNameFromDate, parseISODate } from "./dates.js";
import { updatePassword } from "./auth.js";

const NAV_ITEMS = [
  { id: "home", label: "Inicio", icon: "🏠" },
  { id: "services", label: "Servicios", icon: "✂️" },
  { id: "clients", label: "Clientes", icon: "👥" },
  { id: "history", label: "Historial", icon: "📅" },
  { id: "profile", label: "Perfil", icon: "👤" },
];

export function barberNavItems() {
  return NAV_ITEMS;
}

// ---------- Inicio ----------
export async function renderBarberHome(container, ctx) {
  container.innerHTML = `<div class="text-center mt-16"><div class="spinner" style="margin:40px auto"></div></div>`;

  const barberId = ctx.barber.id;
  const today = todayISO();
  const weekStart = toISODate(startOfWeek());
  const weekEnd = toISODate(endOfWeek());

  try {
    const [todayRecords, weekRecords, weekPromos, todayPromo] = await Promise.all([
      data.listRecordsForDay(barberId, today),
      data.listRecordsForRange(barberId, weekStart, weekEnd),
      data.listPromotionsForRange(barberId, weekStart, weekEnd),
      data.getDailyPromotion(barberId, today),
    ]);

    const promoMap = {};
    weekPromos.forEach((p) => (promoMap[p.record_date] = p.discount_cents));
    const byDate = groupRecordsByDate(weekRecords);
    const weekTotal = weekTotalCents(byDate, promoMap);
    const todayTotal = dayTotalCents(todayRecords, todayPromo?.discount_cents || 0);
    const completedToday = todayRecords.filter((r) => r.status === "completed");
    const clientsToday = new Set(completedToday.map((r) => r.client_id).filter(Boolean)).size;
    const { barberShare, businessShare } = settlementBreakdown({
      totalCents: weekTotal,
      barberPercentage: ctx.barber.default_percentage,
    });

    container.innerHTML = `
      <h2 class="view-title">Hola, ${escapeHtml(ctx.barber.name)}</h2>
      <p class="view-sub">${formatDateText(new Date())}</p>

      <div class="stat-grid">
        <div class="stat-box">
          <div class="stat-label">Hoy — ingresos</div>
          <div class="stat-value accent">${formatCents(todayTotal)}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Hoy — servicios</div>
          <div class="stat-value">${completedToday.length}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Hoy — clientes</div>
          <div class="stat-value">${clientsToday}</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Semana — total</div>
          <div class="stat-value">${formatCents(weekTotal)}</div>
        </div>
      </div>

      <div class="card mt-16">
        <h3>Resumen semanal (${weekLabel(weekStart)})</h3>
        <div class="stat-grid mt-8">
          <div class="stat-box">
            <div class="stat-label">Tu parte (${ctx.barber.default_percentage}%)</div>
            <div class="stat-value text-success">${formatCents(barberShare)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Good Barber</div>
            <div class="stat-value">${formatCents(businessShare)}</div>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-block mt-16" id="quick-register-home">+ Registrar servicio</button>
    `;

    container.querySelector("#quick-register-home").addEventListener("click", () => openQuickRegister(ctx, () => renderBarberHome(container, ctx)));
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

// ---------- Registro rápido ----------
async function openQuickRegister(ctx, onDone) {
  let services = [];
  let selectedService = null;
  let selectedClient = null;

  try {
    services = await data.listServices(true);
  } catch (error) {
    toast(friendlyError(error), "error");
    return;
  }

  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Registrar servicio</h3>

    <div class="field mt-16">
      <label>Cliente</label>
      <input id="qr-client-search" placeholder="Buscar cliente por nombre…" autocomplete="off">
      <div id="qr-client-results" class="mt-8"></div>
      <div id="qr-client-selected" class="badge badge-info mt-8 hidden"></div>
      <button type="button" class="btn btn-ghost btn-sm mt-8" id="qr-new-client">+ Nuevo cliente</button>
    </div>

    <div class="field">
      <label>Servicio</label>
      <div class="service-picker" id="qr-service-picker">
        ${services
          .map(
            (s) => `
          <button type="button" class="service-pick" data-service-id="${s.id}">
            <div class="service-pick-name">${escapeHtml(s.name)}</div>
            <div class="service-pick-price">${formatCents(s.price_cents)}</div>
          </button>
        `
          )
          .join("")}
      </div>
    </div>

    <div class="field">
      <label for="qr-discount">Descuento en este servicio (opcional)</label>
      <input id="qr-discount" type="number" min="0" step="0.01" value="0">
    </div>

    <div class="card">
      <div class="flex-between">
        <span class="text-muted">Precio a cobrar</span>
        <strong id="qr-price-preview" class="text-accent">$0.00</strong>
      </div>
    </div>

    <button type="button" class="btn btn-primary btn-block mt-16" id="qr-confirm" disabled>Confirmar y guardar</button>
  `);

  const priceEl = overlay.querySelector("#qr-price-preview");
  const discountEl = overlay.querySelector("#qr-discount");
  const confirmBtn = overlay.querySelector("#qr-confirm");

  function updatePreview() {
    if (!selectedService) {
      priceEl.textContent = "$0.00";
      confirmBtn.disabled = true;
      return;
    }
    const discountCents = Math.max(0, toCents(discountEl.value));
    const final = Math.max(0, selectedService.price_cents - discountCents);
    priceEl.textContent = formatCents(final);
    confirmBtn.disabled = false;
  }

  overlay.querySelectorAll(".service-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      overlay.querySelectorAll(".service-pick").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedService = services.find((s) => s.id === btn.dataset.serviceId);
      updatePreview();
    });
  });
  discountEl.addEventListener("input", updatePreview);

  const searchInput = overlay.querySelector("#qr-client-search");
  const resultsBox = overlay.querySelector("#qr-client-results");
  const selectedBox = overlay.querySelector("#qr-client-selected");
  let searchTimer;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const term = searchInput.value.trim();
    if (!term) {
      resultsBox.innerHTML = "";
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const results = await data.searchClients(ctx.barber.id, term);
        resultsBox.innerHTML = results
          .map((c) => `<div class="list-item" style="cursor:pointer" data-client-id="${c.id}" data-client-name="${escapeHtml(c.name)}">
            <div class="list-item-title">${escapeHtml(c.name)}</div>
          </div>`)
          .join("") || `<div class="text-muted" style="padding:8px 0">Sin resultados.</div>`;
        resultsBox.querySelectorAll("[data-client-id]").forEach((row) => {
          row.addEventListener("click", () => {
            selectedClient = { id: row.dataset.clientId, name: row.dataset.clientName };
            selectedBox.textContent = `Cliente: ${selectedClient.name}`;
            selectedBox.classList.remove("hidden");
            resultsBox.innerHTML = "";
            searchInput.value = "";
          });
        });
      } catch (error) {
        toast(friendlyError(error), "error");
      }
    }, 250);
  });

  overlay.querySelector("#qr-new-client").addEventListener("click", () => {
    const name = prompt("Nombre del nuevo cliente:");
    if (!name || !name.trim()) return;
    data
      .createClient({ barberId: ctx.barber.id, name: name.trim() })
      .then((client) => {
        selectedClient = client;
        selectedBox.textContent = `Cliente: ${client.name}`;
        selectedBox.classList.remove("hidden");
        toast("Cliente agregado.", "success");
      })
      .catch((error) => toast(friendlyError(error), "error"));
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedService) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Guardando…";
    try {
      const discountCents = Math.max(0, toCents(discountEl.value));
      await data.createServiceRecord({
        barberId: ctx.barber.id,
        clientId: selectedClient?.id || null,
        service: selectedService,
        discountCents,
        createdBy: ctx.profile.id,
      });
      toast("Servicio guardado correctamente.", "success");
      close();
      onDone();
    } catch (error) {
      toast(friendlyError(error), "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Confirmar y guardar";
    }
  });
}

// ---------- Servicios (registro rápido + lista del día) ----------
export async function renderBarberServices(container, ctx) {
  const state = { date: todayISO() };

  async function draw() {
    container.innerHTML = `
      <h2 class="view-title">Servicios</h2>
      <button class="btn btn-primary btn-block" id="new-service-btn">+ Registrar servicio</button>

      <div class="card mt-16">
        <div class="field">
          <label for="services-date">Ver día</label>
          <input type="date" id="services-date" value="${state.date}">
        </div>
        <div id="services-day-total" class="stat-box">
          <div class="stat-label">Total del día</div>
          <div class="stat-value accent" id="services-day-total-value">$0.00</div>
        </div>
      </div>

      <div class="card card-flush" id="services-list"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    `;

    container.querySelector("#new-service-btn").addEventListener("click", () => openQuickRegister(ctx, draw));
    container.querySelector("#services-date").addEventListener("change", (e) => {
      state.date = e.target.value;
      draw();
    });

    try {
      const [records, promo] = await Promise.all([
        data.listRecordsForDay(ctx.barber.id, state.date),
        data.getDailyPromotion(ctx.barber.id, state.date),
      ]);
      const total = dayTotalCents(records, promo?.discount_cents || 0);
      container.querySelector("#services-day-total-value").textContent = formatCents(total);

      const listBox = container.querySelector("#services-list");
      if (records.length === 0) {
        listBox.innerHTML = `<div class="empty-state"><div class="icon">✂️</div>No hay servicios registrados este día.</div>`;
      } else {
        listBox.innerHTML = records
          .map(
            (r) => `
          <div class="card-row">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(r.service_name)} ${r.status === "cancelled" ? '<span class="badge badge-danger">Cancelado</span>' : ""}</div>
              <div class="list-item-sub">${r.clients?.name ? escapeHtml(r.clients.name) : "Sin cliente"} · ${r.record_time?.slice(0, 5) || ""}</div>
            </div>
            <div class="flex gap-8" style="align-items:center">
              <strong>${formatCents(r.price_cents - (r.discount_cents || 0))}</strong>
              ${
                r.status === "completed"
                  ? `<button class="btn btn-ghost btn-sm" data-cancel="${r.id}">Cancelar</button>`
                  : `<button class="btn btn-ghost btn-sm" data-reopen="${r.id}">Reabrir</button>`
              }
            </div>
          </div>
        `
          )
          .join("");

        listBox.querySelectorAll("[data-cancel]").forEach((btn) =>
          btn.addEventListener("click", async () => {
            const ok = await confirmDialog({ title: "Cancelar servicio", message: "¿Cancelar este servicio? Se conservará en el historial como cancelado.", confirmLabel: "Cancelar servicio", danger: true });
            if (!ok) return;
            showLoading(true, "Cancelando…");
            try {
              await data.cancelServiceRecord(btn.dataset.cancel);
              toast("Servicio cancelado.", "success");
              draw();
            } catch (error) {
              toast(friendlyError(error), "error");
            } finally {
              showLoading(false);
            }
          })
        );
        listBox.querySelectorAll("[data-reopen]").forEach((btn) =>
          btn.addEventListener("click", async () => {
            showLoading(true, "Reabriendo…");
            try {
              await data.reopenServiceRecord(btn.dataset.reopen);
              toast("Servicio reactivado.", "success");
              draw();
            } catch (error) {
              toast(friendlyError(error), "error");
            } finally {
              showLoading(false);
            }
          })
        );
      }
    } catch (error) {
      container.querySelector("#services-list").innerHTML = `<div class="text-danger" style="padding:20px">${escapeHtml(friendlyError(error))}</div>`;
    }
  }

  draw();
}

// ---------- Clientes ----------
export async function renderBarberClients(container, ctx) {
  async function draw() {
    container.innerHTML = `
      <h2 class="view-title">Clientes</h2>
      <div class="flex gap-8">
        <input id="client-search" placeholder="Buscar cliente…" style="flex:1">
        <button class="btn btn-primary" id="add-client-btn">+ Agregar</button>
      </div>
      <div class="card card-flush mt-16" id="clients-list"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    `;

    async function loadList(term = "") {
      const listBox = container.querySelector("#clients-list");
      try {
        const clients = term ? await data.searchClients(ctx.barber.id, term) : await data.listClients(ctx.barber.id);
        if (clients.length === 0) {
          listBox.innerHTML = `<div class="empty-state"><div class="icon">👥</div>No hay clientes todavía.</div>`;
          return;
        }
        listBox.innerHTML = clients
          .map(
            (c) => `
          <div class="card-row">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(c.name)}</div>
              <div class="list-item-sub">${c.phone ? escapeHtml(c.phone) : "Sin teléfono"}</div>
            </div>
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Editar</button>
          </div>
        `
          )
          .join("");
        listBox.querySelectorAll("[data-edit]").forEach((btn) => {
          const client = clients.find((c) => c.id === btn.dataset.edit);
          btn.addEventListener("click", () => openClientForm(ctx, client, () => loadList(term)));
        });
      } catch (error) {
        listBox.innerHTML = `<div class="text-danger" style="padding:20px">${escapeHtml(friendlyError(error))}</div>`;
      }
    }

    let timer;
    container.querySelector("#client-search").addEventListener("input", (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => loadList(e.target.value.trim()), 250);
    });
    container.querySelector("#add-client-btn").addEventListener("click", () => openClientForm(ctx, null, () => loadList()));

    loadList();
  }
  draw();
}

function openClientForm(ctx, client, onDone) {
  const isEdit = !!client;
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar cliente" : "Nuevo cliente"}</h3>
    <div class="field mt-16">
      <label for="cf-name">Nombre</label>
      <input id="cf-name" value="${isEdit ? escapeHtml(client.name) : ""}" required>
    </div>
    <div class="field">
      <label for="cf-phone">Teléfono</label>
      <input id="cf-phone" value="${isEdit ? escapeHtml(client.phone || "") : ""}">
    </div>
    <div class="field">
      <label for="cf-notes">Notas</label>
      <textarea id="cf-notes">${isEdit ? escapeHtml(client.notes || "") : ""}</textarea>
    </div>
    <button type="button" class="btn btn-primary btn-block" id="cf-save">Guardar</button>
    ${isEdit ? `<button type="button" class="btn btn-ghost btn-block mt-8" id="cf-deactivate">Desactivar cliente</button>` : ""}
  `);

  overlay.querySelector("#cf-save").addEventListener("click", async () => {
    const name = overlay.querySelector("#cf-name").value.trim();
    if (!name) {
      toast("El nombre es obligatorio.", "error");
      return;
    }
    const payload = {
      name,
      phone: overlay.querySelector("#cf-phone").value.trim() || null,
      notes: overlay.querySelector("#cf-notes").value.trim() || null,
    };
    showLoading(true, "Guardando…");
    try {
      if (isEdit) {
        await data.updateClient(client.id, payload);
      } else {
        await data.createClient({ barberId: ctx.barber.id, ...payload });
      }
      toast("Cliente guardado.", "success");
      close();
      onDone();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });

  if (isEdit) {
    overlay.querySelector("#cf-deactivate").addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Desactivar cliente", message: `¿Desactivar a ${client.name}? Dejará de aparecer en tu lista.`, confirmLabel: "Desactivar", danger: true });
      if (!ok) return;
      showLoading(true, "Desactivando…");
      try {
        await data.deactivateClient(client.id);
        toast("Cliente desactivado.", "success");
        close();
        onDone();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    });
  }
}

// ---------- Historial ----------
export async function renderBarberHistory(container, ctx) {
  container.innerHTML = `<h2 class="view-title">Historial</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const [periods, settlements] = await Promise.all([
      data.listWeeklyPeriods(ctx.barber.id),
      data.listSettlements(ctx.barber.id),
    ]);

    const map = {};
    for (const p of periods) {
      map[p.week_start_date] = { weekStart: p.week_start_date, status: p.status, source: "period" };
    }

    for (const s of settlements) {
      map[s.week_start_date] = {
        weekStart: s.week_start_date,
        status: s.status === "cancelled" ? "cancelled" : "closed",
        total: s.total_cents,
        barberShare: s.barber_share_cents,
        businessShare: s.business_share_cents,
        source: "settlement",
      };
    }

    const rows = Object.values(map).sort((a, b) => b.weekStart.localeCompare(a.weekStart));

    if (rows.length === 0) {
      container.innerHTML = `<h2 class="view-title">Historial</h2><div class="card empty-state"><div class="icon">📅</div>No hay semanas registradas todavía.</div>`;
      return;
    }

    container.innerHTML = `
      <h2 class="view-title">Historial</h2>
      ${rows
        .map(
          (r) => `
        <div class="card">
          <div class="flex-between">
            <h3>Semana del ${weekLabel(r.weekStart)}</h3>
            <span class="badge ${r.status === "closed" ? "badge-success" : r.status === "cancelled" ? "badge-danger" : "badge-warning"}">${
            r.status === "closed" ? "Cerrada" : r.status === "cancelled" ? "Cancelada" : "Abierta"
          }</span>
          </div>
          ${
            r.source === "settlement"
              ? `<div class="stat-grid mt-8">
                  <div class="stat-box"><div class="stat-label">Total</div><div class="stat-value">${formatCents(r.total)}</div></div>
                  <div class="stat-box"><div class="stat-label">Tu parte</div><div class="stat-value text-success">${formatCents(r.barberShare)}</div></div>
                  <div class="stat-box"><div class="stat-label">Good Barber</div><div class="stat-value">${formatCents(r.businessShare)}</div></div>
                </div>`
              : `<p class="text-muted mt-8">Semana en curso, todavía sin cerrar.</p>`
          }
        </div>
      `
        )
        .join("")}
    `;
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

// ---------- Perfil ----------
export function renderBarberProfile(container, ctx) {
  container.innerHTML = `
    <h2 class="view-title">Perfil</h2>
    <div class="card">
      <div class="stat-label">Nombre</div>
      <p class="mt-8" style="font-weight:700">${escapeHtml(ctx.barber.name)}</p>
      <div class="stat-label mt-16">Correo</div>
      <p class="mt-8">${escapeHtml(ctx.profile.email)}</p>
      <div class="stat-label mt-16">Reparto</div>
      <p class="mt-8">${ctx.barber.default_percentage}% para ti / ${(100 - ctx.barber.default_percentage).toFixed(2)}% Good Barber</p>
    </div>

    <div class="card">
      <h3>Cambiar contraseña</h3>
      <div class="field mt-16">
        <label for="new-password">Nueva contraseña</label>
        <input id="new-password" type="password" minlength="8" autocomplete="new-password">
      </div>
      <button class="btn btn-primary btn-block" id="change-password-btn">Actualizar contraseña</button>
    </div>
  `;

  container.querySelector("#change-password-btn").addEventListener("click", async () => {
    const value = container.querySelector("#new-password").value;
    if (!value || value.length < 8) {
      toast("La contraseña debe tener al menos 8 caracteres.", "error");
      return;
    }
    showLoading(true, "Actualizando…");
    try {
      await updatePassword(value);
      toast("Contraseña actualizada.", "success");
      container.querySelector("#new-password").value = "";
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });
}
