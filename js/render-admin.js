import * as data from "./data.js";
import { toast, friendlyError, showLoading, confirmDialog, openModal, escapeHtml } from "./ui.js";
import { formatCents, toCents } from "./money.js";
import { dayTotalCents, groupRecordsByDate, weekTotalCents, settlementBreakdown, recordsTotalCents } from "./calc.js";
import { startOfWeek, endOfWeek, toISODate, todayISO, weekLabel, formatDateText } from "./dates.js";
import { readLegacyData, summarizeLegacyData, migrateLegacyData } from "./migration.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "barbers", label: "Barberos", icon: "💈" },
  { id: "clients", label: "Clientes", icon: "👥" },
  { id: "services", label: "Servicios", icon: "✂️" },
  { id: "sales", label: "Ventas", icon: "💵" },
  { id: "weeks", label: "Semanas", icon: "📅" },
  { id: "history", label: "Historial", icon: "🗂️" },
  { id: "settings", label: "Configuración", icon: "⚙️" },
];

export function adminNavItems() {
  return NAV_ITEMS;
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toISODate(start), end: toISODate(end) };
}

// ---------- Dashboard ----------
export async function renderAdminDashboard(container) {
  container.innerHTML = `<h2 class="view-title">Dashboard</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const barbers = await data.listBarbers();
    const today = todayISO();
    const weekStart = toISODate(startOfWeek());
    const weekEnd = toISODate(endOfWeek());
    const { start: monthStart, end: monthEnd } = monthRange();

    const [todayRecords, weekRecords, monthRecords] = await Promise.all([
      data.listAllRecordsForRange(today, today),
      data.listAllRecordsForRange(weekStart, weekEnd),
      data.listAllRecordsForRange(monthStart, monthEnd),
    ]);

    const todayTotal = recordsTotalCents(todayRecords);
    const weekTotal = recordsTotalCents(weekRecords);
    const monthTotal = recordsTotalCents(monthRecords);
    const completedWeek = weekRecords.filter((r) => r.status === "completed");

    const perBarber = barbers.map((b) => {
      const records = completedWeek.filter((r) => r.barber_id === b.id);
      const total = records.reduce((s, r) => s + (r.price_cents - (r.discount_cents || 0)), 0);
      const { barberShare, businessShare } = settlementBreakdown({ totalCents: total, barberPercentage: b.default_percentage });
      return { barber: b, count: records.length, total, barberShare, businessShare };
    });

    container.innerHTML = `
      <h2 class="view-title">Dashboard</h2>
      <p class="view-sub">${formatDateText(new Date())}</p>

      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Ventas de hoy</div><div class="stat-value accent">${formatCents(todayTotal)}</div></div>
        <div class="stat-box"><div class="stat-label">Ventas de la semana</div><div class="stat-value">${formatCents(weekTotal)}</div></div>
        <div class="stat-box"><div class="stat-label">Ventas del mes</div><div class="stat-value">${formatCents(monthTotal)}</div></div>
        <div class="stat-box"><div class="stat-label">Servicios (semana)</div><div class="stat-value">${completedWeek.length}</div></div>
      </div>

      <h3 class="mt-16">Comparativa de barberos (semana actual)</h3>
      <div class="table-wrap card card-flush">
        <table>
          <thead><tr><th>Barbero</th><th>Servicios</th><th>Ventas</th><th>Su parte</th><th>Good Barber</th></tr></thead>
          <tbody>
            ${perBarber
              .map(
                (p) => `
              <tr>
                <td>${escapeHtml(p.barber.name)}</td>
                <td>${p.count}</td>
                <td>${formatCents(p.total)}</td>
                <td>${formatCents(p.barberShare)}</td>
                <td>${formatCents(p.businessShare)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

// ---------- Barberos ----------
export async function renderAdminBarbers(container) {
  async function draw() {
    container.innerHTML = `
      <div class="flex-between">
        <h2 class="view-title">Barberos</h2>
        <button class="btn btn-primary btn-sm" id="add-barber-btn">+ Nuevo barbero</button>
      </div>
      <div id="barbers-list"><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div></div>
    `;
    container.querySelector("#add-barber-btn").addEventListener("click", () => openBarberCreateForm(draw));

    try {
      const barbers = await data.listBarbers();
      const weekStart = toISODate(startOfWeek());
      const weekEnd = toISODate(endOfWeek());
      const weekRecords = await data.listAllRecordsForRange(weekStart, weekEnd);

      container.querySelector("#barbers-list").innerHTML = barbers
        .map((b) => {
          const records = weekRecords.filter((r) => r.barber_id === b.id && r.status === "completed");
          const total = records.reduce((s, r) => s + (r.price_cents - (r.discount_cents || 0)), 0);
          const avg = records.length ? total / records.length : 0;
          const last = records[0];
          return `
          <div class="card">
            <div class="flex-between">
              <h3>${escapeHtml(b.name)}</h3>
              <span class="badge ${b.active ? "badge-success" : "badge-danger"}">${b.active ? "Activo" : "Inactivo"}</span>
            </div>
            <p class="text-muted mt-8">${escapeHtml(b.profiles?.email || "")}</p>
            <div class="stat-grid mt-16">
              <div class="stat-box"><div class="stat-label">Servicios (semana)</div><div class="stat-value">${records.length}</div></div>
              <div class="stat-box"><div class="stat-label">Ventas (semana)</div><div class="stat-value">${formatCents(total)}</div></div>
              <div class="stat-box"><div class="stat-label">Promedio/servicio</div><div class="stat-value">${formatCents(avg)}</div></div>
              <div class="stat-box"><div class="stat-label">Reparto</div><div class="stat-value">${b.default_percentage}%</div></div>
            </div>
            <p class="text-muted mt-8">Último servicio: ${last ? `${last.service_name} — ${last.record_date}` : "Sin registros esta semana"}</p>
            <div class="flex gap-8 mt-16">
              <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Editar reparto</button>
              <button class="btn btn-ghost btn-sm" data-toggle="${b.id}" data-active="${b.active}" data-profile="${b.profile_id}">${b.active ? "Desactivar" : "Activar"}</button>
            </div>
          </div>
        `;
        })
        .join("");

      container.querySelectorAll("[data-edit]").forEach((btn) => {
        const barber = barbers.find((b) => b.id === btn.dataset.edit);
        btn.addEventListener("click", () => openBarberEditForm(barber, draw));
      });

      container.querySelectorAll("[data-toggle]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const willActivate = btn.dataset.active !== "true";
          const ok = await confirmDialog({
            title: willActivate ? "Activar barbero" : "Desactivar barbero",
            message: willActivate ? "El barbero podrá volver a iniciar sesión." : "El barbero no podrá iniciar sesión mientras esté desactivado.",
            confirmLabel: willActivate ? "Activar" : "Desactivar",
            danger: !willActivate,
          });
          if (!ok) return;
          showLoading(true, "Actualizando…");
          try {
            await data.setBarberActive(btn.dataset.toggle, willActivate);
            await data.setProfileActive(btn.dataset.profile, willActivate);
            toast("Barbero actualizado.", "success");
            draw();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        });
      });
    } catch (error) {
      container.querySelector("#barbers-list").innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

function openBarberCreateForm(onDone) {
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Nuevo barbero</h3>
    <p class="text-muted mt-8">Se creará su cuenta con Supabase Auth. El barbero podrá cambiar su contraseña después desde su perfil.</p>
    <div class="field mt-16"><label for="nb-name">Nombre</label><input id="nb-name" required></div>
    <div class="field"><label for="nb-email">Correo</label><input id="nb-email" type="email" required></div>
    <div class="field"><label for="nb-password">Contraseña temporal</label><input id="nb-password" type="password" minlength="8" required></div>
    <div id="nb-error" class="text-danger mt-8 hidden"></div>
    <button type="button" class="btn btn-primary btn-block mt-16" id="nb-save">Crear barbero</button>
  `);

  overlay.querySelector("#nb-save").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const errorBox = overlay.querySelector("#nb-error");
    errorBox.classList.add("hidden");
    const name = overlay.querySelector("#nb-name").value.trim();
    const email = overlay.querySelector("#nb-email").value.trim();
    const password = overlay.querySelector("#nb-password").value;
    if (!name || !email || password.length < 8) {
      errorBox.textContent = "Completa todos los campos (contraseña mínimo 8 caracteres).";
      errorBox.classList.remove("hidden");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Creando…";
    try {
      await data.createBarberViaFunction({ name, email, password });
      toast("Barbero creado correctamente.", "success");
      close();
      onDone();
    } catch (error) {
      errorBox.textContent = friendlyError(error) + " Si la función admin-create-barber no está desplegada, crea el usuario manualmente desde el Dashboard de Supabase (ver README).";
      errorBox.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Crear barbero";
    }
  });
}

function openBarberEditForm(barber, onDone) {
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Editar reparto — ${escapeHtml(barber.name)}</h3>
    <div class="field mt-16">
      <label for="be-name">Nombre</label>
      <input id="be-name" value="${escapeHtml(barber.name)}">
    </div>
    <div class="field">
      <label for="be-pct">Porcentaje del barbero (%)</label>
      <input id="be-pct" type="number" min="0" max="100" step="0.01" value="${barber.default_percentage}">
      <div class="field-hint">El resto corresponde a Good Barber.</div>
    </div>
    <button type="button" class="btn btn-primary btn-block" id="be-save">Guardar</button>
  `);
  overlay.querySelector("#be-save").addEventListener("click", async () => {
    showLoading(true, "Guardando…");
    try {
      await data.updateBarber(barber.id, {
        name: overlay.querySelector("#be-name").value.trim(),
        default_percentage: Number(overlay.querySelector("#be-pct").value || 60),
      });
      toast("Barbero actualizado.", "success");
      close();
      onDone();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });
}

// ---------- Clientes (todos) ----------
export async function renderAdminClients(container) {
  container.innerHTML = `<h2 class="view-title">Clientes</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const [barbers, clients] = await Promise.all([data.listBarbers(), data.listClients()]);
    const barberName = (id) => barbers.find((b) => b.id === id)?.name || "—";

    container.innerHTML = `
      <h2 class="view-title">Clientes</h2>
      <div class="table-wrap card card-flush">
        <table>
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Barbero</th></tr></thead>
          <tbody>
            ${clients
              .map((c) => `<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || "—")}</td><td>${escapeHtml(barberName(c.barber_id))}</td></tr>`)
              .join("") || `<tr><td colspan="3" class="text-muted">No hay clientes registrados.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

// ---------- Servicios (catálogo) ----------
export async function renderAdminServices(container) {
  async function draw() {
    container.innerHTML = `
      <div class="flex-between">
        <h2 class="view-title">Servicios</h2>
        <button class="btn btn-primary btn-sm" id="add-service-btn">+ Nuevo</button>
      </div>
      <div id="services-list" class="card card-flush"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    `;
    container.querySelector("#add-service-btn").addEventListener("click", () => openServiceForm(null, draw));
    try {
      const services = await data.listServices(false);
      container.querySelector("#services-list").innerHTML = services
        .map(
          (s) => `
        <div class="card-row">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(s.name)} ${!s.active ? '<span class="badge badge-neutral">Inactivo</span>' : ""}</div>
            <div class="list-item-sub">${formatCents(s.price_cents)}${s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}</div>
          </div>
          <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Editar</button>
        </div>
      `
        )
        .join("");
      container.querySelectorAll("[data-edit]").forEach((btn) => {
        const service = services.find((s) => s.id === btn.dataset.edit);
        btn.addEventListener("click", () => openServiceForm(service, draw));
      });
    } catch (error) {
      container.querySelector("#services-list").innerHTML = `<div class="text-danger" style="padding:20px">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

function openServiceForm(service, onDone) {
  const isEdit = !!service;
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar servicio" : "Nuevo servicio"}</h3>
    <div class="field mt-16"><label for="sf-name">Nombre</label><input id="sf-name" value="${isEdit ? escapeHtml(service.name) : ""}"></div>
    <div class="field"><label for="sf-price">Precio</label><input id="sf-price" type="number" min="0" step="0.01" value="${isEdit ? (service.price_cents / 100).toFixed(2) : ""}"></div>
    <div class="field"><label for="sf-duration">Duración (minutos, opcional)</label><input id="sf-duration" type="number" min="0" value="${isEdit && service.duration_minutes ? service.duration_minutes : ""}"></div>
    ${isEdit ? `<div class="field"><label for="sf-active">Estado</label><select id="sf-active"><option value="true" ${service.active ? "selected" : ""}>Activo</option><option value="false" ${!service.active ? "selected" : ""}>Inactivo</option></select></div>` : ""}
    <button type="button" class="btn btn-primary btn-block mt-16" id="sf-save">Guardar</button>
  `);

  overlay.querySelector("#sf-save").addEventListener("click", async () => {
    const name = overlay.querySelector("#sf-name").value.trim();
    const priceCents = toCents(overlay.querySelector("#sf-price").value);
    const durationRaw = overlay.querySelector("#sf-duration").value;
    if (!name || priceCents <= 0) {
      toast("Escribe un nombre y un precio válido.", "error");
      return;
    }
    showLoading(true, "Guardando…");
    try {
      if (isEdit) {
        await data.updateService(service.id, {
          name,
          price_cents: priceCents,
          duration_minutes: durationRaw ? Number(durationRaw) : null,
          active: overlay.querySelector("#sf-active").value === "true",
        });
      } else {
        await data.createService({ name, priceCents, durationMinutes: durationRaw ? Number(durationRaw) : null });
      }
      toast("Servicio guardado.", "success");
      close();
      onDone();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });
}

// ---------- Ventas ----------
export async function renderAdminSales(container) {
  const state = { start: toISODate(startOfWeek()), end: toISODate(endOfWeek()) };

  async function draw() {
    container.innerHTML = `
      <h2 class="view-title">Ventas</h2>
      <div class="card flex gap-12" style="flex-wrap:wrap">
        <div class="field" style="flex:1;min-width:140px;margin-bottom:0"><label>Desde</label><input type="date" id="sales-start" value="${state.start}"></div>
        <div class="field" style="flex:1;min-width:140px;margin-bottom:0"><label>Hasta</label><input type="date" id="sales-end" value="${state.end}"></div>
      </div>
      <div id="sales-table" class="table-wrap card card-flush mt-16"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    `;

    container.querySelector("#sales-start").addEventListener("change", (e) => {
      state.start = e.target.value;
      draw();
    });
    container.querySelector("#sales-end").addEventListener("change", (e) => {
      state.end = e.target.value;
      draw();
    });

    try {
      const records = await data.listAllRecordsForRange(state.start, state.end);
      const total = recordsTotalCents(records.filter((r) => r.status === "completed"));

      container.querySelector("#sales-table").innerHTML = `
        <table>
          <thead><tr><th>Fecha</th><th>Barbero</th><th>Cliente</th><th>Servicio</th><th>Precio</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${
              records
                .map(
                  (r) => `
              <tr>
                <td>${r.record_date}</td>
                <td>${escapeHtml(r.barbers?.name || "—")}</td>
                <td>${escapeHtml(r.clients?.name || "—")}</td>
                <td>${escapeHtml(r.service_name)}</td>
                <td>${formatCents(r.price_cents - (r.discount_cents || 0))}</td>
                <td><span class="badge ${r.status === "completed" ? "badge-success" : "badge-danger"}">${r.status === "completed" ? "Completado" : "Cancelado"}</span></td>
                <td>${
                  r.status === "completed"
                    ? `<button class="btn btn-ghost btn-sm" data-cancel="${r.id}">Cancelar</button>`
                    : `<button class="btn btn-ghost btn-sm" data-reopen="${r.id}">Reabrir</button>`
                }</td>
              </tr>
            `
                )
                .join("") || `<tr><td colspan="7" class="text-muted">Sin registros en este rango.</td></tr>`
            }
          </tbody>
        </table>
        <div class="card-row"><strong>Total del rango</strong><strong>${formatCents(total)}</strong></div>
      `;

      container.querySelectorAll("[data-cancel]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          const ok = await confirmDialog({ title: "Cancelar registro", message: "¿Cancelar este servicio?", confirmLabel: "Cancelar", danger: true });
          if (!ok) return;
          showLoading(true);
          try {
            await data.cancelServiceRecord(btn.dataset.cancel);
            toast("Registro cancelado.", "success");
            draw();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        })
      );
      container.querySelectorAll("[data-reopen]").forEach((btn) =>
        btn.addEventListener("click", async () => {
          showLoading(true);
          try {
            await data.reopenServiceRecord(btn.dataset.reopen);
            toast("Registro reabierto.", "success");
            draw();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        })
      );
    } catch (error) {
      container.querySelector("#sales-table").innerHTML = `<div class="text-danger" style="padding:20px">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

// ---------- Semanas (cortes) ----------
export async function renderAdminWeeks(container) {
  async function draw() {
    container.innerHTML = `<h2 class="view-title">Semanas</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
    try {
      const barbers = await data.listBarbers();
      const weekStart = toISODate(startOfWeek());
      const weekEnd = toISODate(endOfWeek());

      const cards = await Promise.all(
        barbers.map(async (b) => {
          const [records, promos, settlements] = await Promise.all([
            data.listRecordsForRange(b.id, weekStart, weekEnd),
            data.listPromotionsForRange(b.id, weekStart, weekEnd),
            data.listSettlements(b.id),
          ]);
          const promoMap = {};
          promos.forEach((p) => (promoMap[p.record_date] = p.discount_cents));
          const byDate = groupRecordsByDate(records);
          const total = weekTotalCents(byDate, promoMap);
          const existingSettlement = settlements.find((s) => s.week_start_date === weekStart);
          return { barber: b, total, existingSettlement };
        })
      );

      container.innerHTML = `
        <h2 class="view-title">Semanas</h2>
        <p class="view-sub">Semana actual: ${weekLabel(weekStart)}</p>
        ${cards
          .map(
            ({ barber, total, existingSettlement }) => `
          <div class="card">
            <div class="flex-between">
              <h3>${escapeHtml(barber.name)}</h3>
              ${existingSettlement ? `<span class="badge ${existingSettlement.status === "cancelled" ? "badge-danger" : "badge-success"}">${existingSettlement.status === "cancelled" ? "Cancelado" : "Cerrado"}</span>` : `<span class="badge badge-warning">Abierta</span>`}
            </div>
            <p class="text-muted mt-8">Total acumulado: ${formatCents(total)}</p>
            <button class="btn btn-primary mt-16" data-settle="${barber.id}">${existingSettlement ? "Editar corte" : "Cerrar semana (corte)"}</button>
          </div>
        `
          )
          .join("")}
      `;

      container.querySelectorAll("[data-settle]").forEach((btn) => {
        const info = cards.find((c) => c.barber.id === btn.dataset.settle);
        btn.addEventListener("click", () => openSettlementForm(info, weekStart, weekEnd, draw));
      });
    } catch (error) {
      container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

function openSettlementForm({ barber, total, existingSettlement }, weekStart, weekEnd, onDone) {
  const extra = existingSettlement ? existingSettlement.extra_adjustment_cents / 100 : 0;
  const pct = existingSettlement ? existingSettlement.barber_percentage : barber.default_percentage;

  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Corte de la semana — ${escapeHtml(barber.name)}</h3>
    <p class="text-muted mt-8">${weekLabel(weekStart)}</p>
    <div class="field mt-16"><label for="st-extra">Pago extra / ajuste</label><input id="st-extra" type="number" step="0.01" value="${extra}"></div>
    <div class="field"><label for="st-pct">Porcentaje del barbero (%)</label><input id="st-pct" type="number" min="0" max="100" step="0.01" value="${pct}"></div>
    <div class="card" id="st-preview"></div>
    <button type="button" class="btn btn-primary btn-block" id="st-save">Guardar corte</button>
    ${existingSettlement && existingSettlement.status !== "cancelled" ? `<button type="button" class="btn btn-ghost btn-block mt-8" id="st-cancel">Cancelar corte</button>` : ""}
    ${existingSettlement && existingSettlement.status === "cancelled" ? `<button type="button" class="btn btn-ghost btn-block mt-8" id="st-reopen">Reabrir corte</button>` : ""}
  `);

  function updatePreview() {
    const extraCents = toCents(overlay.querySelector("#st-extra").value);
    const barberPct = Number(overlay.querySelector("#st-pct").value || 60);
    const { finalTotal, barberShare, businessShare } = settlementBreakdown({ totalCents: total, extraAdjustmentCents: extraCents, barberPercentage: barberPct });
    overlay.querySelector("#st-preview").innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Total semanal</div><div class="stat-value">${formatCents(finalTotal)}</div></div>
        <div class="stat-box"><div class="stat-label">${barberPct}% barbero</div><div class="stat-value text-success">${formatCents(barberShare)}</div></div>
        <div class="stat-box"><div class="stat-label">Good Barber</div><div class="stat-value">${formatCents(businessShare)}</div></div>
      </div>
    `;
  }
  overlay.querySelector("#st-extra").addEventListener("input", updatePreview);
  overlay.querySelector("#st-pct").addEventListener("input", updatePreview);
  updatePreview();

  overlay.querySelector("#st-save").addEventListener("click", async () => {
    const extraCents = toCents(overlay.querySelector("#st-extra").value);
    const barberPct = Number(overlay.querySelector("#st-pct").value || 60);
    const { finalTotal, barberShare, businessShare } = settlementBreakdown({ totalCents: total, extraAdjustmentCents: extraCents, barberPercentage: barberPct });
    showLoading(true, "Guardando corte…");
    try {
      const period = await data.getOrCreateWeeklyPeriod(barber.id, weekStart, weekEnd);
      await data.setWeeklyPeriodStatus(period.id, "closed");
      await data.upsertSettlement({
        weekly_period_id: period.id,
        barber_id: barber.id,
        week_start_date: weekStart,
        week_end_date: weekEnd,
        total_cents: finalTotal,
        extra_adjustment_cents: extraCents,
        barber_percentage: barberPct,
        barber_share_cents: barberShare,
        business_share_cents: businessShare,
        status: "completed",
      });
      toast("Corte guardado.", "success");
      close();
      onDone();
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });

  const cancelBtn = overlay.querySelector("#st-cancel");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Cancelar corte", message: "El corte quedará marcado como cancelado, sin borrarlo.", confirmLabel: "Cancelar corte", danger: true });
      if (!ok) return;
      showLoading(true);
      try {
        await data.cancelSettlement(existingSettlement.id);
        toast("Corte cancelado.", "success");
        close();
        onDone();
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    });
  }

  const reopenBtn = overlay.querySelector("#st-reopen");
  if (reopenBtn) {
    reopenBtn.addEventListener("click", async () => {
      showLoading(true);
      try {
        await data.reopenSettlement(existingSettlement.id);
        toast("Corte reactivado.", "success");
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

// ---------- Historial general ----------
export async function renderAdminHistory(container) {
  container.innerHTML = `<h2 class="view-title">Historial</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const settlements = await data.listSettlements();
    if (settlements.length === 0) {
      container.innerHTML = `<h2 class="view-title">Historial</h2><div class="card empty-state"><div class="icon">🗂️</div>No hay semanas cerradas todavía.</div>`;
      return;
    }
    container.innerHTML = `
      <h2 class="view-title">Historial</h2>
      <div class="table-wrap card card-flush">
        <table>
          <thead><tr><th>Semana</th><th>Barbero</th><th>Total</th><th>Barbero %</th><th>Good Barber</th><th>Estado</th></tr></thead>
          <tbody>
            ${settlements
              .map(
                (s) => `
              <tr>
                <td>${weekLabel(s.week_start_date)}</td>
                <td>${escapeHtml(s.barbers?.name || "—")}</td>
                <td>${formatCents(s.total_cents)}</td>
                <td>${formatCents(s.barber_share_cents)}</td>
                <td>${formatCents(s.business_share_cents)}</td>
                <td><span class="badge ${s.status === "cancelled" ? "badge-danger" : "badge-success"}">${s.status === "cancelled" ? "Cancelado" : "Cerrado"}</span></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

// ---------- Configuración ----------
export async function renderAdminSettings(container) {
  container.innerHTML = `<h2 class="view-title">Configuración</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
  try {
    const [settings, barbers] = await Promise.all([data.getSettings(), data.listBarbers()]);
    const legacy = readLegacyData();
    const legacySummary = summarizeLegacyData(legacy);

    container.innerHTML = `
      <h2 class="view-title">Configuración</h2>
      <div class="card">
        <div class="field"><label for="cfg-name">Nombre del negocio</label><input id="cfg-name" value="${escapeHtml(settings.business_name)}"></div>
        <div class="field"><label for="cfg-pct">Porcentaje por defecto del barbero (%)</label><input id="cfg-pct" type="number" min="0" max="100" step="0.01" value="${settings.default_barber_percentage}"></div>
        <div class="field"><label for="cfg-tz">Zona horaria</label><input id="cfg-tz" value="${escapeHtml(settings.timezone)}"></div>
        <button class="btn btn-primary btn-block" id="cfg-save">Guardar configuración</button>
      </div>

      <div class="card">
        <h3>Migrar datos antiguos de este navegador</h3>
        ${
          legacy
            ? `<p class="text-muted mt-8">Se encontraron ${legacySummary.weeks} semana(s) y ${legacySummary.cuts} corte(s) guardados localmente en este navegador (versión anterior sin Supabase). Puedes importarlos una sola vez.</p>
               <button class="btn btn-ghost btn-block mt-16" id="migrate-btn">Revisar y migrar datos locales</button>`
            : `<p class="text-muted mt-8">No se encontraron datos antiguos en este navegador.</p>`
        }
      </div>
    `;

    container.querySelector("#cfg-save").addEventListener("click", async () => {
      showLoading(true, "Guardando…");
      try {
        await data.updateSettings({
          business_name: container.querySelector("#cfg-name").value.trim(),
          default_barber_percentage: Number(container.querySelector("#cfg-pct").value || 60),
          timezone: container.querySelector("#cfg-tz").value.trim(),
        });
        toast("Configuración guardada.", "success");
      } catch (error) {
        toast(friendlyError(error), "error");
      } finally {
        showLoading(false);
      }
    });

    const migrateBtn = container.querySelector("#migrate-btn");
    if (migrateBtn) {
      migrateBtn.addEventListener("click", () => openMigrationDialog(legacy, legacySummary, barbers));
    }
  } catch (error) {
    container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
  }
}

function openMigrationDialog(legacy, summary, barbers) {
  const legacyNames = new Set();
  Object.keys(legacy.semanas || {}).forEach((k) => legacyNames.add(k.split("|")[0]));
  Object.values(legacy.cortes || {}).forEach((c) => legacyNames.add(c.barbero));

  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Migrar datos locales</h3>
    <p class="text-muted mt-8">${summary.weeks} semana(s) y ${summary.cuts} corte(s) encontrados. Asocia cada nombre antiguo con el barbero correspondiente en Supabase antes de continuar.</p>
    ${[...legacyNames]
      .map(
        (name, idx) => `
      <div class="field mt-16">
        <label for="map-${idx}">"${escapeHtml(name)}" corresponde a:</label>
        <select id="map-${idx}" data-legacy-name="${escapeHtml(name)}">
          <option value="">Selecciona un barbero</option>
          ${barbers.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("")}
        </select>
      </div>
    `
      )
      .join("")}
    <div id="migration-result" class="mt-16"></div>
    <button type="button" class="btn btn-primary btn-block mt-16" id="migrate-confirm">Migrar ahora</button>
  `);

  overlay.querySelector("#migrate-confirm").addEventListener("click", async (e) => {
    const mapping = {};
    let complete = true;
    overlay.querySelectorAll("[data-legacy-name]").forEach((select) => {
      if (!select.value) complete = false;
      mapping[select.dataset.legacyName] = select.value;
    });
    if (!complete) {
      toast("Asocia todos los nombres antes de migrar.", "error");
      return;
    }
    const ok = await confirmDialog({
      title: "Confirmar migración",
      message: "Esto creará registros nuevos en Supabase a partir de los datos guardados en este navegador. No se borrará nada localmente.",
      confirmLabel: "Migrar",
    });
    if (!ok) return;

    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Migrando…";
    try {
      const report = await migrateLegacyData(legacy, mapping);
      overlay.querySelector("#migration-result").innerHTML = `
        <div class="card">
          <p><strong>${report.weeksImported}</strong> semanas procesadas · <strong>${report.recordsCreated}</strong> servicios creados · <strong>${report.cutsImported}</strong> cortes importados.</p>
          ${report.skipped.length ? `<p class="text-danger mt-8">${report.skipped.length} elemento(s) con problemas — revisa la consola.</p>` : `<p class="text-success mt-8">Sin errores.</p>`}
        </div>
      `;
      if (report.skipped.length) console.warn("Errores de migración:", report.skipped);
      toast("Migración completada.", "success");
      btn.remove();
    } catch (error) {
      toast(friendlyError(error), "error");
      btn.disabled = false;
      btn.textContent = "Migrar ahora";
    }
  });
}
