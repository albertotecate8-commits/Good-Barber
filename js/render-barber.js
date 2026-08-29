import * as data from "./data.js";
import { toast, friendlyError, showLoading, confirmDialog, openModal, escapeHtml, animateNumberText } from "./ui.js";
import { formatCents, toCents, fromCents } from "./money.js";
import { dayTotalCents, groupRecordsByDate, weekTotalCents, settlementBreakdown, recordLineTotalCents } from "./calc.js";
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

// ---------- Registro rápido (uno o varios servicios en una sola operación) ----------
async function openQuickRegister(ctx, onDone) {
  let services = [];
  let selectedClient = null;
  const cart = []; // { service, quantity, discountCents }

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
      <label>Servicios (toca para agregar; puedes elegir varios)</label>
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
      <label>Servicios seleccionados</label>
      <div id="qr-cart" class="card card-flush"></div>
    </div>

    <div class="card">
      <div class="flex-between">
        <span class="text-muted">Total</span>
        <strong id="qr-total" class="text-accent">$0.00</strong>
      </div>
    </div>

    <button type="button" class="btn btn-primary btn-block mt-16" id="qr-confirm" disabled>Guardar servicio(s)</button>
  `);

  const cartBox = overlay.querySelector("#qr-cart");
  const totalEl = overlay.querySelector("#qr-total");
  const confirmBtn = overlay.querySelector("#qr-confirm");
  let lastTotalCents = 0;

  function lineTotal(item) {
    return Math.max(0, item.service.price_cents * item.quantity - item.discountCents);
  }

  function renderCart() {
    if (cart.length === 0) {
      cartBox.innerHTML = `<div class="text-muted" style="padding:12px">Todavía no agregas ningún servicio.</div>`;
    } else {
      cartBox.innerHTML = cart
        .map(
          (item, idx) => `
        <div class="card-row">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(item.service.name)}</div>
            <div class="list-item-sub flex gap-8" style="align-items:center;flex-wrap:wrap">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-qty-minus="${idx}" aria-label="Menos">−</button>
              <span>${item.quantity}</span>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-qty-plus="${idx}" aria-label="Más">+</button>
              <input type="number" min="0" step="0.01" placeholder="Descuento" value="${item.discountCents ? fromCents(item.discountCents) : ""}" data-discount="${idx}" style="width:100px">
            </div>
          </div>
          <div class="flex gap-8" style="align-items:center">
            <strong>${formatCents(lineTotal(item))}</strong>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" data-remove="${idx}" aria-label="Quitar">✕</button>
          </div>
        </div>
      `
        )
        .join("");

      cartBox.querySelectorAll("[data-qty-minus]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const i = Number(btn.dataset.qtyMinus);
          if (cart[i].quantity > 1) cart[i].quantity--;
          renderCart();
        })
      );
      cartBox.querySelectorAll("[data-qty-plus]").forEach((btn) =>
        btn.addEventListener("click", () => {
          cart[Number(btn.dataset.qtyPlus)].quantity++;
          renderCart();
        })
      );
      cartBox.querySelectorAll("[data-remove]").forEach((btn) =>
        btn.addEventListener("click", () => {
          const item = cart[Number(btn.dataset.remove)];
          const row = btn.closest(".card-row");
          let removed = false;
          const removeNow = () => {
            if (removed) return;
            removed = true;
            const i = cart.indexOf(item); // por identidad: sigue siendo correcto aunque el carrito haya cambiado mientras animaba
            if (i !== -1) cart.splice(i, 1);
            renderCart();
          };
          if (row && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
            row.classList.add("cart-row-leaving");
            row.addEventListener("animationend", removeNow, { once: true });
            setTimeout(removeNow, 250); // respaldo
          } else {
            removeNow();
          }
        })
      );
      cartBox.querySelectorAll("[data-discount]").forEach((inp) =>
        inp.addEventListener("input", () => {
          cart[Number(inp.dataset.discount)].discountCents = Math.max(0, toCents(inp.value));
          updateTotal();
        })
      );
    }
    updateTotal();
  }

  function updateTotal() {
    const total = cart.reduce((sum, item) => sum + lineTotal(item), 0);
    animateNumberText(totalEl, lastTotalCents, total, formatCents);
    lastTotalCents = total;
    confirmBtn.disabled = cart.length === 0;
  }

  overlay.querySelectorAll(".service-pick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const service = services.find((s) => s.id === btn.dataset.serviceId);
      const existing = cart.find((item) => item.service.id === service.id && item.discountCents === 0);
      if (existing) {
        existing.quantity++;
      } else {
        cart.push({ service, quantity: 1, discountCents: 0 });
      }
      btn.classList.remove("just-added");
      // eslint-disable-next-line no-unused-expressions
      void btn.offsetWidth; // reinicia la animación si se toca el mismo servicio dos veces seguidas
      btn.classList.add("just-added");
      renderCart();
    });
  });

  renderCart();

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
    const { overlay: nc, close: closeNc } = openModal(`
      <button type="button" class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
      <h3>Nuevo cliente</h3>
      <div class="field mt-16">
        <label for="nc-name">Nombre</label>
        <input id="nc-name" autocomplete="off">
      </div>
      <div id="nc-error" class="text-danger mt-8 hidden"></div>
      <button type="button" class="btn btn-primary btn-block mt-16" id="nc-save">Agregar cliente</button>
    `);
    const input = nc.querySelector("#nc-name");
    input.focus();
    nc.querySelector("#nc-save").addEventListener("click", async () => {
      const name = input.value.trim();
      const errorBox = nc.querySelector("#nc-error");
      if (!name) {
        errorBox.textContent = "El nombre es obligatorio.";
        errorBox.classList.remove("hidden");
        return;
      }
      try {
        const client = await data.createClient({ barberId: ctx.barber.id, name });
        selectedClient = client;
        selectedBox.textContent = `Cliente: ${client.name}`;
        selectedBox.classList.remove("hidden");
        toast("Cliente agregado.", "success");
        closeNc();
      } catch (error) {
        errorBox.textContent = friendlyError(error);
        errorBox.classList.remove("hidden");
      }
    });
  });

  confirmBtn.addEventListener("click", async () => {
    if (cart.length === 0) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Guardando…";
    try {
      await data.createServiceRecordsBatch({
        barberId: ctx.barber.id,
        clientId: selectedClient?.id || null,
        items: cart.map((item) => ({ service: item.service, quantity: item.quantity, discountCents: item.discountCents })),
        createdBy: ctx.profile.id,
      });
      toast(cart.length > 1 ? "Servicios guardados correctamente." : "Servicio guardado correctamente.", "success");
      confirmBtn.textContent = "✓ Guardado";
      confirmBtn.classList.add("btn-success-state", "pulse-success");
      setTimeout(() => {
        close();
        onDone();
      }, 480);
    } catch (error) {
      toast(friendlyError(error), "error");
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Guardar servicio(s)";
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
              <div class="list-item-title">${escapeHtml(r.service_name)}${r.quantity > 1 ? ` ×${r.quantity}` : ""} ${r.status === "cancelled" ? '<span class="badge badge-danger">Cancelado</span>' : ""}</div>
              <div class="list-item-sub">${r.clients?.name ? escapeHtml(r.clients.name) : "Sin cliente"} · ${r.record_time?.slice(0, 5) || ""}</div>
            </div>
            <div class="flex gap-8" style="align-items:center;flex-wrap:wrap">
              <strong>${formatCents(recordLineTotalCents(r))}</strong>
              <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Editar</button>
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

        listBox.querySelectorAll("[data-edit]").forEach((btn) => {
          const record = records.find((r) => r.id === btn.dataset.edit);
          btn.addEventListener("click", () => openEditRecordForm(record, draw));
        });
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

// Edición de un servicio ya registrado (propio del barbero, cualquier fecha
// pasada). El servidor (RLS + trigger) es quien realmente decide si se puede:
// esta pantalla solo intenta la operación y muestra el error si el backend
// la rechaza (p. ej. semana ya cerrada).
async function openEditRecordForm(record, onDone) {
  let services = [];
  try {
    services = await data.listServices(true);
    if (!services.some((s) => s.id === record.service_id)) {
      services = [...services, { id: record.service_id, name: record.service_name, price_cents: record.price_cents }];
    }
  } catch (error) {
    toast(friendlyError(error), "error");
    return;
  }

  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Editar servicio</h3>
    <div class="field mt-16">
      <label for="er-date">Fecha</label>
      <input id="er-date" type="date" value="${record.record_date}">
    </div>
    <div class="field">
      <label for="er-service">Servicio</label>
      <select id="er-service">
        ${services
          .map((s) => `<option value="${s.id}" data-price="${s.price_cents}" ${s.id === record.service_id ? "selected" : ""}>${escapeHtml(s.name)} — ${formatCents(s.price_cents)}</option>`)
          .join("")}
      </select>
    </div>
    <div class="field">
      <label for="er-qty">Cantidad</label>
      <input id="er-qty" type="number" min="1" step="1" value="${record.quantity || 1}">
    </div>
    <div class="field">
      <label for="er-discount">Descuento</label>
      <input id="er-discount" type="number" min="0" step="0.01" value="${fromCents(record.discount_cents || 0)}">
    </div>
    <div class="field">
      <label for="er-notes">Nota (opcional)</label>
      <input id="er-notes" value="${escapeHtml(record.notes || "")}">
    </div>
    <div class="card">
      <div class="flex-between">
        <span class="text-muted">Total</span>
        <strong id="er-total" class="text-accent">$0.00</strong>
      </div>
    </div>
    <div id="er-error" class="text-danger mt-8 hidden"></div>
    <button type="button" class="btn btn-primary btn-block mt-16" id="er-save">Guardar cambios</button>
  `);

  const serviceSelect = overlay.querySelector("#er-service");
  const qtyInput = overlay.querySelector("#er-qty");
  const discountInput = overlay.querySelector("#er-discount");
  const totalEl = overlay.querySelector("#er-total");
  const errorBox = overlay.querySelector("#er-error");
  let lastTotalCents = record.price_cents * (record.quantity || 1) - (record.discount_cents || 0);
  totalEl.textContent = formatCents(lastTotalCents);

  function updateTotal() {
    const price = Number(serviceSelect.selectedOptions[0]?.dataset.price || 0);
    const qty = Math.max(1, Number(qtyInput.value || 1));
    const discountCents = Math.max(0, toCents(discountInput.value));
    const total = Math.max(0, price * qty - discountCents);
    animateNumberText(totalEl, lastTotalCents, total, formatCents);
    lastTotalCents = total;
  }
  serviceSelect.addEventListener("change", updateTotal);
  qtyInput.addEventListener("input", updateTotal);
  discountInput.addEventListener("input", updateTotal);
  updateTotal();

  overlay.querySelector("#er-save").addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    const service = services.find((s) => s.id === serviceSelect.value);
    const quantity = Math.max(1, Number(qtyInput.value || 1));
    const discountCents = Math.max(0, toCents(discountInput.value));
    const recordDate = overlay.querySelector("#er-date").value;
    const notes = overlay.querySelector("#er-notes").value.trim() || null;

    if (!recordDate || !service) {
      errorBox.textContent = "Completa la fecha y el servicio.";
      errorBox.classList.remove("hidden");
      return;
    }

    const btn = overlay.querySelector("#er-save");
    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      await data.updateServiceRecord(record.id, {
        record_date: recordDate,
        service_id: service.id,
        service_name: service.name,
        price_cents: service.price_cents,
        quantity,
        discount_cents: discountCents,
        notes,
      });
      toast("Servicio actualizado.", "success");
      btn.textContent = "✓ Guardado";
      btn.classList.add("btn-success-state", "pulse-success");
      setTimeout(() => {
        close();
        onDone();
      }, 480);
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Guardar cambios";
    }
  });
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
