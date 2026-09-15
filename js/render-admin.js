import * as data from "./data.js";
import { toast, friendlyError, showLoading, confirmDialog, openModal, escapeHtml, animateNumberText } from "./ui.js";
import { formatCents, toCents } from "./money.js";
import { dayTotalCents, groupRecordsByDate, weekTotalCents, settlementBreakdown, recordsTotalCents, recordLineTotalCents } from "./calc.js";
import { startOfWeek, endOfWeek, toISODate, todayISO, weekLabel, formatDateText, parseISODate } from "./dates.js";
import { imageFieldHTML, wireImageField } from "./image-field.js";
import { borrarImagen } from "./media.js";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "agenda", label: "Agenda", icon: "🗓️" },
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
      const total = records.reduce((s, r) => s + recordLineTotalCents(r), 0);
      const { barberShare, businessShare } = settlementBreakdown({ totalCents: total, barberPercentage: b.default_percentage });
      return { barber: b, count: records.length, total, barberShare, businessShare };
    });

    container.innerHTML = `
      <div class="dashboard-view">
        <div class="dash-header">
          <h2 class="view-title">Dashboard</h2>
          <p class="view-sub">${formatDateText(new Date())}</p>
        </div>

        <div class="card dash-hero">
          <div class="dash-hero-label">Ventas de hoy</div>
          <div class="dash-hero-value" id="dash-today-total">${formatCents(0)}</div>
          <div class="dash-hero-sub">${todayRecords.length} servicio${todayRecords.length === 1 ? "" : "s"} registrado${todayRecords.length === 1 ? "" : "s"} hoy</div>
        </div>

        <div class="stat-grid">
          <div class="stat-box"><div class="stat-label">Ventas de la semana</div><div class="stat-value" id="dash-week-total">${formatCents(0)}</div></div>
          <div class="stat-box"><div class="stat-label">Ventas del mes</div><div class="stat-value" id="dash-month-total">${formatCents(0)}</div></div>
          <div class="stat-box"><div class="stat-label">Servicios (semana)</div><div class="stat-value" id="dash-week-count">0</div></div>
        </div>

        <h3 class="dash-section-title mt-16">Rendimiento por barbero — semana actual</h3>
        <div class="card card-flush dash-perf-list">
          ${
            perBarber.length
              ? perBarber
                  .map(
                    (p) => `
              <div class="dash-perf-row">
                <div class="dash-perf-id">
                  <div class="dash-perf-name">${escapeHtml(p.barber.name)}</div>
                  <div class="dash-perf-meta">${p.count} servicio${p.count === 1 ? "" : "s"}</div>
                </div>
                <div class="dash-perf-amounts">
                  <div class="dash-perf-total">${formatCents(p.total)}</div>
                  <div class="dash-perf-split">${formatCents(p.barberShare)} barbero · ${formatCents(p.businessShare)} Good Barber</div>
                </div>
              </div>
            `
                  )
                  .join("")
              : `<div class="empty-state"><div class="icon">💈</div>Sin barberos registrados todavía.</div>`
          }
        </div>
      </div>
    `;

    animateNumberText(container.querySelector("#dash-today-total"), 0, todayTotal, formatCents);
    animateNumberText(container.querySelector("#dash-week-total"), 0, weekTotal, formatCents);
    animateNumberText(container.querySelector("#dash-month-total"), 0, monthTotal, formatCents);
    animateNumberText(container.querySelector("#dash-week-count"), 0, completedWeek.length, (v) => String(Math.round(v)));
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
          const total = records.reduce((s, r) => s + recordLineTotalCents(r), 0);
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
              <button class="btn btn-ghost btn-sm" data-edit="${b.id}">Editar</button>
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
    <div class="field">
      <label for="nb-pct">Reparto del barbero (%)</label>
      <input id="nb-pct" type="number" min="0" max="100" step="0.01" value="60">
      <div class="field-hint">El resto corresponde a Good Barber.</div>
    </div>
    <div class="field">
      <label for="nb-active">Estado</label>
      <select id="nb-active">
        <option value="true" selected>Activo</option>
        <option value="false">Inactivo</option>
      </select>
    </div>
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
    const percentage = Number(overlay.querySelector("#nb-pct").value || 60);
    const active = overlay.querySelector("#nb-active").value === "true";
    if (!name || !email || password.length < 8) {
      errorBox.textContent = "Completa todos los campos (contraseña mínimo 8 caracteres).";
      errorBox.classList.remove("hidden");
      return;
    }
    if (Number.isNaN(percentage) || percentage < 0 || percentage > 100) {
      errorBox.textContent = "El reparto debe estar entre 0 y 100.";
      errorBox.classList.remove("hidden");
      return;
    }
    btn.disabled = true;
    btn.textContent = "Creando…";
    try {
      await data.createBarberViaFunction({ name, email, password, percentage, active });
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
    <h3>Editar — ${escapeHtml(barber.name)}</h3>

    <div class="field mt-16">
      <label for="be-name">Nombre</label>
      <input id="be-name" value="${escapeHtml(barber.name)}" maxlength="60">
      <p class="field-help">Es el nombre que ve el cliente al elegir barbero.</p>
    </div>
    <div class="field">
      <label for="be-bio">Descripción</label>
      <input id="be-bio" value="${escapeHtml(barber.bio || "")}" maxlength="80" placeholder="Fade y clásico">
      <p class="field-help">Una línea corta bajo el nombre. Si la dejas vacía, no se muestra.</p>
    </div>
    ${imageFieldHTML("be-img", "Fotografía", barber.photo_url, "Si no hay foto, la página pública usa sus iniciales.")}
    <div class="field">
      <label for="be-order">Orden de aparición</label>
      <input id="be-order" type="number" min="0" max="999" value="${barber.sort_order ?? 0}">
      <p class="field-help">Menor número, antes en la lista. A igualdad, por nombre.</p>
    </div>
    <div class="field">
      <label class="switch-row" for="be-public">
        <input type="checkbox" id="be-public" ${barber.public_visible !== false ? "checked" : ""}>
        <span>Visible en la página pública</span>
      </label>
      <p class="field-help">Si lo apagas, deja de ofrecerse para reservar. Sus citas y su historial no cambian.</p>
    </div>

    <div class="field">
      <label for="be-pct">Porcentaje del barbero (%)</label>
      <input id="be-pct" type="number" min="0" max="100" step="0.01" value="${barber.default_percentage}">
      <div class="field-hint">El resto corresponde a Good Barber.</div>
    </div>

    <div id="be-err" class="text-danger mb-8" hidden></div>
    <div class="flex gap-8">
      <button type="button" class="btn btn-primary" id="be-save">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button>
    </div>
  `);

  const imagen = wireImageField(overlay, "be-img", { carpeta: "barberos", urlActual: barber.photo_url || null });

  overlay.querySelector("#be-save").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    const err = overlay.querySelector("#be-err");
    err.hidden = true;
    const nombre = overlay.querySelector("#be-name").value.trim();
    const pct = Number(overlay.querySelector("#be-pct").value || 60);
    if (!nombre) return mostrar(err, "El nombre no puede quedar vacío.");
    if (!(pct >= 0 && pct <= 100)) return mostrar(err, "El porcentaje debe estar entre 0 y 100.");

    boton.disabled = true;
    boton.textContent = imagen.hayCambio() ? "Subiendo…" : "Guardando…";
    try {
      const photo_url = await imagen.guardar();
      boton.textContent = "Guardando…";
      await data.updateBarber(barber.id, {
        name: nombre,
        bio: overlay.querySelector("#be-bio").value.trim() || null,
        photo_url,
        sort_order: Number(overlay.querySelector("#be-order").value || 0),
        public_visible: overlay.querySelector("#be-public").checked,
        default_percentage: pct,
      });
      toast("Barbero actualizado. Ya se ve en la página pública.", "success");
      close();
      onDone();
    } catch (error) {
      mostrar(err, friendlyError(error));
      boton.disabled = false;
      boton.textContent = "Guardar";
    }
  });
}

// ---------- Clientes (todos) ----------
// El admin puede crear, editar, desactivar, buscar y ver el historial de
// cualquier cliente (is_admin() ya le da ese acceso en RLS — no se toca
// ninguna política). El barbero NO gana ningún permiso nuevo con esto: sigue
// exactamente igual que antes, limitado a los suyos desde su propio panel.
export async function renderAdminClients(container) {
  async function draw(term = "") {
    container.innerHTML = `
      <div class="flex-between">
        <h2 class="view-title">Clientes</h2>
        <button class="btn btn-primary btn-sm" id="add-client-btn">+ Nuevo cliente</button>
      </div>
      <div class="card" style="margin-bottom:0">
        <input id="admin-client-search" placeholder="Buscar cliente por nombre…" value="${escapeHtml(term)}">
      </div>
      <div id="admin-clients-list" class="card card-flush mt-16"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>
    `;

    let searchTimer;
    container.querySelector("#admin-client-search").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      const value = e.target.value.trim();
      searchTimer = setTimeout(() => draw(value), 250);
    });

    container.querySelector("#add-client-btn").addEventListener("click", async () => {
      showLoading(true, "Cargando…");
      try {
        const barbersList = await data.listBarbers();
        showLoading(false);
        openAdminClientForm(null, barbersList, () => draw(term));
      } catch (error) {
        showLoading(false);
        toast(friendlyError(error), "error");
      }
    });

    try {
      const [barbers, clients] = await Promise.all([
        data.listBarbers(),
        term ? data.searchClients(null, term) : data.listClients(),
      ]);
      const barberName = (id) => barbers.find((b) => b.id === id)?.name || "Sin barbero asignado";

      const listBox = container.querySelector("#admin-clients-list");
      if (clients.length === 0) {
        listBox.innerHTML = `<div class="empty-state"><div class="icon">👥</div>No hay clientes registrados.</div>`;
        return;
      }
      listBox.innerHTML = clients
        .map(
          (c) => `
        <div class="card-row">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(c.name)}</div>
            <div class="list-item-sub">${c.phone ? escapeHtml(c.phone) : "Sin teléfono"} · ${escapeHtml(barberName(c.barber_id))}</div>
          </div>
          <div class="flex gap-8" style="align-items:center;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" data-history="${c.id}">Historial</button>
            <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Editar</button>
          </div>
        </div>
      `
        )
        .join("");

      listBox.querySelectorAll("[data-edit]").forEach((btn) => {
        const client = clients.find((c) => c.id === btn.dataset.edit);
        btn.addEventListener("click", () => openAdminClientForm(client, barbers, () => draw(term)));
      });
      listBox.querySelectorAll("[data-history]").forEach((btn) => {
        const client = clients.find((c) => c.id === btn.dataset.history);
        btn.addEventListener("click", () => openClientHistory(client));
      });
    } catch (error) {
      container.querySelector("#admin-clients-list").innerHTML = `<div class="empty-state text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

function openAdminClientForm(client, barbers, onDone) {
  const isEdit = !!client;
  const { overlay, close } = openModal(`
    <button type="button" class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar cliente" : "Nuevo cliente"}</h3>
    <div class="field mt-16">
      <label for="acf-name">Nombre</label>
      <input id="acf-name" value="${isEdit ? escapeHtml(client.name) : ""}" required>
    </div>
    <div class="field">
      <label for="acf-phone">Teléfono</label>
      <input id="acf-phone" value="${isEdit ? escapeHtml(client.phone || "") : ""}">
    </div>
    <div class="field">
      <label for="acf-barber">Barbero relacionado</label>
      <select id="acf-barber">
        <option value="">Sin barbero asignado</option>
        ${barbers
          .map((b) => `<option value="${b.id}" ${isEdit && client.barber_id === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`)
          .join("")}
      </select>
    </div>
    <div class="field">
      <label for="acf-notes">Notas</label>
      <textarea id="acf-notes">${isEdit ? escapeHtml(client.notes || "") : ""}</textarea>
    </div>
    <div id="acf-error" class="text-danger mt-8 hidden"></div>
    <button type="button" class="btn btn-primary btn-block mt-16" id="acf-save">Guardar</button>
    ${isEdit && client.active !== false ? `<button type="button" class="btn btn-ghost btn-block mt-8" id="acf-deactivate">Desactivar cliente</button>` : ""}
  `);

  const errorBox = overlay.querySelector("#acf-error");

  overlay.querySelector("#acf-save").addEventListener("click", async () => {
    errorBox.classList.add("hidden");
    errorBox.innerHTML = "";
    const name = overlay.querySelector("#acf-name").value.trim();
    if (!name) {
      errorBox.textContent = "El nombre es obligatorio.";
      errorBox.classList.remove("hidden");
      return;
    }
    const phone = overlay.querySelector("#acf-phone").value.trim() || null;
    const barberId = overlay.querySelector("#acf-barber").value || null;
    const notes = overlay.querySelector("#acf-notes").value.trim() || null;

    showLoading(true, "Guardando…");
    try {
      if (isEdit) {
        await data.updateClient(client.id, { name, phone, barber_id: barberId, notes });
      } else {
        await data.createClient({ barberId, name, phone, notes });
      }
      showLoading(false);
      toast("Cliente guardado.", "success");
      close();
      onDone();
    } catch (error) {
      showLoading(false);
      if (error.code === "DUPLICATE_PHONE") {
        if (!isEdit && error.existingClient) {
          errorBox.innerHTML = `Este número ya está registrado a nombre de <strong>${escapeHtml(error.existingClient.name)}</strong>.<br>`;
          const useBtn = document.createElement("button");
          useBtn.type = "button";
          useBtn.className = "btn btn-ghost btn-sm mt-8";
          useBtn.textContent = "Usar cliente existente";
          useBtn.addEventListener("click", () => {
            close();
            openAdminClientForm(error.existingClient, barbers, onDone);
          });
          errorBox.appendChild(useBtn);
        } else {
          errorBox.textContent = "Este número ya está registrado.";
        }
      } else {
        errorBox.textContent = friendlyError(error);
      }
      errorBox.classList.remove("hidden");
    }
  });

  if (isEdit && client.active !== false) {
    overlay.querySelector("#acf-deactivate").addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Desactivar cliente",
        message: `¿Desactivar a ${client.name}? Dejará de aparecer en las listas.`,
        confirmLabel: "Desactivar",
        danger: true,
      });
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

async function openClientHistory(client) {
  const { overlay } = openModal(`
    <button type="button" class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>Historial — ${escapeHtml(client.name)}</h3>
    <div id="ch-body" class="mt-16"><div class="text-center" style="padding:20px"><div class="spinner" style="margin:auto"></div></div></div>
  `);
  const body = overlay.querySelector("#ch-body");
  try {
    const records = await data.listRecordsForClient(client.id);
    if (records.length === 0) {
      body.innerHTML = `<div class="empty-state"><div class="icon">📅</div>Este cliente todavía no tiene servicios registrados.</div>`;
      return;
    }
    const total = recordsTotalCents(records.filter((r) => r.status === "completed"));
    body.innerHTML = `
      <div class="card-row"><strong>Total (completados)</strong><strong>${formatCents(total)}</strong></div>
      <div class="table-wrap card card-flush mt-8">
        <table>
          <thead><tr><th>Fecha</th><th>Barbero</th><th>Servicio</th><th>Precio</th><th>Estado</th></tr></thead>
          <tbody>
            ${records
              .map(
                (r) => `
              <tr>
                <td>${r.record_date}</td>
                <td>${escapeHtml(r.barbers?.name || "—")}</td>
                <td>${escapeHtml(r.service_name)}${r.quantity > 1 ? ` ×${r.quantity}` : ""}</td>
                <td>${formatCents(recordLineTotalCents(r))}</td>
                <td><span class="badge ${r.status === "completed" ? "badge-success" : "badge-danger"}">${r.status === "completed" ? "Completado" : "Anulado"}</span></td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div class="text-danger">${escapeHtml(friendlyError(error))}</div>`;
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
      container.querySelector("#services-list").innerHTML = `<div class="empty-state text-danger">${escapeHtml(friendlyError(error))}</div>`;
    }
  }
  draw();
}

// Iconos que el cliente sabe traducir a SVG (cliente/js/icons.js). Se ofrece
// una lista cerrada en vez de un campo libre: así el administrador no puede
// elegir un emoji que la página pública no sepa dibujar.
const ICONOS_SERVICIO = [
  { valor: "", etiqueta: "Tijeras (por defecto)" },
  { valor: "✂️", etiqueta: "✂️  Tijeras" },
  { valor: "🪒", etiqueta: "🪒  Rasuradora / barba" },
  { valor: "💈", etiqueta: "💈  Poste de barbería" },
  { valor: "🧴", etiqueta: "🧴  Peine / tratamiento" },
];

function openServiceForm(service, onDone) {
  const isEdit = !!service;
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar servicio" : "Nuevo servicio"}</h3>
    <div class="field mt-16"><label for="sf-name">Nombre</label>
      <input id="sf-name" value="${isEdit ? escapeHtml(service.name) : ""}" maxlength="60"></div>
    <div class="field"><label for="sf-desc">Descripción</label>
      <input id="sf-desc" value="${isEdit ? escapeHtml(service.description || "") : ""}" maxlength="120"
             placeholder="Tijera y máquina, incluye lavado">
      <p class="field-help">Aparece bajo el nombre en la página pública. Si la dejas vacía, no se muestra nada.</p></div>
    <div class="field"><label for="sf-price">Precio</label>
      <input id="sf-price" type="number" min="0" step="0.01" value="${isEdit ? (service.price_cents / 100).toFixed(2) : ""}"></div>
    <div class="field"><label for="sf-duration">Duración (minutos)</label>
      <input id="sf-duration" type="number" min="5" max="480" value="${isEdit && service.duration_minutes ? service.duration_minutes : 30}"></div>
    <div class="field"><label for="sf-icon">Icono</label>
      <select id="sf-icon">
        ${ICONOS_SERVICIO.map((o) => `<option value="${escapeHtml(o.valor)}" ${isEdit && (service.icon || "") === o.valor ? "selected" : ""}>${escapeHtml(o.etiqueta)}</option>`).join("")}
      </select></div>
    <div class="field"><label for="sf-order">Orden de aparición</label>
      <input id="sf-order" type="number" min="0" max="999" value="${isEdit ? service.sort_order ?? 0 : 0}">
      <p class="field-help">Menor número, más arriba.</p></div>
    ${imageFieldHTML("sf-img", "Fotografía del servicio", isEdit ? service.image_url : null, "Opcional. Si no hay foto, se usa el icono.")}
    <div class="field">
      <label class="switch-row" for="sf-public">
        <input type="checkbox" id="sf-public" ${!isEdit || service.public_visible !== false ? "checked" : ""}>
        <span>Visible en la página pública</span>
      </label>
      <p class="field-help">Si lo apagas, deja de ofrecerse para reservar pero el historial no cambia.</p>
    </div>
    ${isEdit ? `<div class="field"><label for="sf-active">Estado</label><select id="sf-active"><option value="true" ${service.active ? "selected" : ""}>Activo</option><option value="false" ${!service.active ? "selected" : ""}>Inactivo</option></select></div>` : ""}
    <div id="sf-err" class="text-danger mb-8" hidden></div>
    <div class="flex gap-8 mt-16">
      <button type="button" class="btn btn-primary" id="sf-save">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button>
    </div>
  `);

  const imagen = wireImageField(overlay, "sf-img", {
    carpeta: "servicios",
    urlActual: isEdit ? service.image_url || null : null,
  });

  overlay.querySelector("#sf-save").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    const err = overlay.querySelector("#sf-err");
    err.hidden = true;
    const name = overlay.querySelector("#sf-name").value.trim();
    const priceCents = toCents(overlay.querySelector("#sf-price").value);
    const duracion = Number(overlay.querySelector("#sf-duration").value);
    if (!name) return mostrar(err, "Escribe el nombre del servicio.");
    if (!(priceCents > 0)) return mostrar(err, "Escribe un precio mayor que cero.");
    if (!(duracion >= 5 && duracion <= 480)) return mostrar(err, "La duración debe estar entre 5 y 480 minutos.");

    boton.disabled = true;
    boton.textContent = imagen.hayCambio() ? "Subiendo…" : "Guardando…";
    try {
      const image_url = await imagen.guardar();
      boton.textContent = "Guardando…";
      const comun = {
        name,
        description: overlay.querySelector("#sf-desc").value.trim() || null,
        price_cents: priceCents,
        duration_minutes: duracion,
        icon: overlay.querySelector("#sf-icon").value || null,
        sort_order: Number(overlay.querySelector("#sf-order").value || 0),
        public_visible: overlay.querySelector("#sf-public").checked,
        image_url,
      };
      if (isEdit) {
        await data.updateService(service.id, {
          ...comun,
          active: overlay.querySelector("#sf-active").value === "true",
        });
      } else {
        await data.createService({
          name,
          priceCents,
          durationMinutes: duracion,
          sortOrder: comun.sort_order,
          description: comun.description,
          icon: comun.icon,
          publicVisible: comun.public_visible,
          imageUrl: image_url,
        });
      }
      toast("Servicio guardado. Ya se ve en la página pública.", "success");
      close();
      onDone();
    } catch (error) {
      mostrar(err, friendlyError(error));
      boton.disabled = false;
      boton.textContent = "Guardar";
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
      const [records, settlements] = await Promise.all([data.listAllRecordsForRange(state.start, state.end), data.listSettlements()]);
      const total = recordsTotalCents(records.filter((r) => r.status === "completed"));
      const closedWeekKeys = new Set(
        settlements.filter((s) => s.status !== "cancelled").map((s) => `${s.barber_id}|${s.week_start_date}`)
      );
      const weekKeyForRecord = (r) => `${r.barber_id}|${toISODate(startOfWeek(parseISODate(r.record_date)))}`;

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
                <td>${escapeHtml(r.service_name)}${r.quantity > 1 ? ` ×${r.quantity}` : ""}</td>
                <td>${formatCents(recordLineTotalCents(r))}</td>
                <td><span class="badge ${r.status === "completed" ? "badge-success" : "badge-danger"}">${r.status === "completed" ? "Completado" : "Anulado"}</span></td>
                <td>${
                  r.status === "completed"
                    ? `<button class="btn btn-ghost btn-sm" data-cancel="${r.id}">Anular</button>`
                    : `<button class="btn btn-ghost btn-sm" data-reopen="${r.id}">Reabrir</button>`
                }</td>
              </tr>
            `
                )
                .join("") ||
                `<tr><td colspan="7"><div class="empty-state"><div class="icon">💰</div>Sin registros en este rango.</div></td></tr>`
            }
          </tbody>
        </table>
        <div class="card-row"><strong>Total del rango</strong><strong>${formatCents(total)}</strong></div>
      `;

      const closedWeekWarning =
        " Esta fecha pertenece a una semana ya cerrada (tiene un corte guardado) — el total de ese corte NO se recalculará automáticamente; si corresponde, cierra la semana de nuevo desde \"Semanas\" después de este cambio.";

      container.querySelectorAll("[data-cancel]").forEach((btn) => {
        const record = records.find((r) => r.id === btn.dataset.cancel);
        const inClosedWeek = record && closedWeekKeys.has(weekKeyForRecord(record));
        btn.addEventListener("click", async () => {
          const ok = await confirmDialog({
            title: "Anular registro",
            message: "¿Anular este servicio? No contará para ingresos ni liquidaciones, pero se conserva en el historial." + (inClosedWeek ? closedWeekWarning : ""),
            confirmLabel: "Anular",
            danger: true,
          });
          if (!ok) return;
          showLoading(true);
          try {
            await data.cancelServiceRecord(btn.dataset.cancel);
            toast("Registro anulado.", "success");
            draw();
          } catch (error) {
            toast(friendlyError(error), "error");
          } finally {
            showLoading(false);
          }
        });
      });
      container.querySelectorAll("[data-reopen]").forEach((btn) => {
        const record = records.find((r) => r.id === btn.dataset.reopen);
        const inClosedWeek = record && closedWeekKeys.has(weekKeyForRecord(record));
        btn.addEventListener("click", async () => {
          if (inClosedWeek) {
            const ok = await confirmDialog({
              title: "Reabrir registro",
              message: "¿Reabrir este servicio?" + closedWeekWarning,
              confirmLabel: "Reabrir",
            });
            if (!ok) return;
          }
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
        });
      });
    } catch (error) {
      container.querySelector("#sales-table").innerHTML = `<div class="empty-state text-danger">${escapeHtml(friendlyError(error))}</div>`;
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
      await data.closeWeeklySettlement({
        barberId: barber.id,
        weekStart,
        weekEnd,
        totalCents: finalTotal,
        extraAdjustmentCents: extraCents,
        barberPercentage: barberPct,
        barberShareCents: barberShare,
        businessShareCents: businessShare,
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
// El widget de "migrar datos antiguos de este navegador" (localStorage de la
// versión previa a Supabase) se quitó de este flujo normal: Good Barber ya
// funciona completamente sobre Supabase. Las funciones de migración
// (js/migration.js) NO se borraron — siguen ahí intactas por si algún día
// hicieran falta — solo se dejó de importarlas y mostrarlas aquí.
// Tira de pestañas desplazable. Hace tres cosas y ninguna más: trae la
// pestaña activa a la vista, marca de qué lado queda contenido para que las
// máscaras del CSS aparezcan solo donde tocan, y se mantiene al día si la
// ventana cambia de tamaño. No altera qué pestañas hay ni qué hacen.
function wireTabStrip(tira) {
  if (!tira) return () => {};

  const marcarBordes = () => {
    const desborda = tira.scrollWidth > tira.clientWidth + 1;
    // 2px de tolerancia: los navegadores redondean scrollLeft en pantallas
    // con densidad fraccionaria y si no, el difuminado parpadea en los topes.
    tira.classList.toggle("has-inicio", desborda && tira.scrollLeft > 2);
    tira.classList.toggle("has-fin", desborda && tira.scrollLeft + tira.clientWidth < tira.scrollWidth - 2);
  };

  // scrollLeft directo, no scrollIntoView: este último también desplaza la
  // página en vertical y daría un salto al abrir Configuración.
  const traerActiva = (suave) => {
    const activa = tira.querySelector(".cms-tab.active");
    if (!activa) return;
    const t = tira.getBoundingClientRect();
    const a = activa.getBoundingClientRect();
    const aire = 14;
    let destino = null;
    if (a.left < t.left + aire) destino = tira.scrollLeft + (a.left - t.left) - aire;
    else if (a.right > t.right - aire) destino = tira.scrollLeft + (a.right - t.right) + aire;
    if (destino === null) return;
    const max = tira.scrollWidth - tira.clientWidth;
    tira.scrollTo({ left: Math.max(0, Math.min(destino, max)), behavior: suave ? "smooth" : "auto" });
  };

  tira.addEventListener("scroll", marcarBordes, { passive: true });
  const alRedimensionar = () => { marcarBordes(); traerActiva(false); };
  window.addEventListener("resize", alRedimensionar);

  // Primer pintado: sin animación, ya colocada.
  traerActiva(false);
  marcarBordes();
  // Y otra pasada cuando el navegador ya midió de verdad (fuentes, etc.).
  requestAnimationFrame(() => { traerActiva(false); marcarBordes(); });

  return () => {
    tira.removeEventListener("scroll", marcarBordes);
    window.removeEventListener("resize", alRedimensionar);
  };
}

export async function renderAdminSettings(container) {
  const PESTANAS = [
    { id: "negocio", label: "Negocio" },
    { id: "promo", label: "Promoción" },
    { id: "imagenes", label: "Imágenes" },
    { id: "portada", label: "Carrusel de inicio" },
    { id: "cortes", label: "Cortes destacados" },
    { id: "reservas", label: "Reservas" },
    { id: "operacion", label: "Operación" },
  ];
  let activa = "negocio";
  let soltarTira = null;

  async function draw() {
    container.innerHTML = `<h2 class="view-title">Configuración</h2><div class="text-center mt-16"><div class="spinner" style="margin:auto"></div></div>`;
    let settings;
    try {
      settings = await data.getSettings();
    } catch (error) {
      container.innerHTML = `<div class="card text-danger">${escapeHtml(friendlyError(error))}</div>`;
      return;
    }

    container.innerHTML = `
      <h2 class="view-title">Configuración</h2>
      <p class="view-sub">Lo que edites aquí es lo que ve el cliente en la página pública.</p>
      <div class="cms-tabs" role="tablist">
        ${PESTANAS.map((t) => `
          <button type="button" role="tab" class="cms-tab ${t.id === activa ? "active" : ""}"
                  data-cms-tab="${t.id}" aria-selected="${t.id === activa}">${t.label}</button>`).join("")}
      </div>
      <div id="cms-panel"></div>
    `;

    container.querySelectorAll("[data-cms-tab]").forEach((btn) =>
      btn.addEventListener("click", () => { activa = btn.dataset.cmsTab; draw(); })
    );
    if (soltarTira) soltarTira();
    soltarTira = wireTabStrip(container.querySelector(".cms-tabs"));

    const panel = container.querySelector("#cms-panel");
    if (activa === "negocio") panelNegocio(panel, settings, draw);
    else if (activa === "promo") panelPromo(panel, settings, draw);
    else if (activa === "imagenes") panelImagenes(panel, settings, draw);
    else if (activa === "portada") panelPortada(panel);
    else if (activa === "cortes") panelCortes(panel);
    else if (activa === "reservas") panelReservas(panel, settings, draw);
    else panelOperacion(panel, settings, draw);
  }

  draw();
}

// Guardado común a todos los paneles: deshabilita el botón mientras viaja,
// avisa del resultado y vuelve a pintar con los datos ya guardados.
async function guardarSettings(boton, patch, onDone) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    await data.updateSettings(patch);
    toast("Cambios guardados. Ya se ven en la página pública.", "success");
    if (onDone) onDone();
  } catch (error) {
    toast(friendlyError(error), "error");
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

const val = (root, id) => root.querySelector(id).value.trim();

function panelNegocio(panel, settings, onDone) {
  panel.innerHTML = `
    <div class="card">
      <div class="field"><label for="cfg-name">Nombre del negocio</label>
        <input id="cfg-name" value="${escapeHtml(settings.business_name || "")}" maxlength="80"></div>
      <div class="field"><label for="cfg-tagline">Eslogan</label>
        <input id="cfg-tagline" value="${escapeHtml(settings.tagline || "")}" maxlength="80">
        <p class="field-help">Es el titular grande de la portada.</p></div>
      <div class="field"><label for="cfg-address">Dirección</label>
        <input id="cfg-address" value="${escapeHtml(settings.address || "")}" maxlength="160"></div>
      <div class="field"><label for="cfg-phone">Teléfono</label>
        <input id="cfg-phone" type="tel" value="${escapeHtml(settings.phone || "")}" maxlength="30"></div>
      <div class="field"><label for="cfg-whatsapp">WhatsApp</label>
        <input id="cfg-whatsapp" type="tel" value="${escapeHtml(settings.whatsapp || "")}" maxlength="30">
        <p class="field-help">Solo dígitos, con código de país. Ejemplo: 5215512345678</p></div>
      <div class="field"><label for="cfg-instagram">Instagram</label>
        <input id="cfg-instagram" value="${escapeHtml(settings.instagram || "")}" maxlength="60">
        <p class="field-help">Con o sin arroba.</p></div>
      <div id="cfg-err" class="text-danger mb-8" hidden></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="cfg-save">Guardar</button>
        <button class="btn btn-ghost" id="cfg-cancel">Cancelar</button>
      </div>
    </div>`;

  panel.querySelector("#cfg-cancel").addEventListener("click", onDone);
  panel.querySelector("#cfg-save").addEventListener("click", (e) => {
    const err = panel.querySelector("#cfg-err");
    err.hidden = true;
    const nombre = val(panel, "#cfg-name");
    if (!nombre) {
      err.textContent = "El nombre del negocio no puede quedar vacío.";
      err.hidden = false;
      panel.querySelector("#cfg-name").focus();
      return;
    }
    guardarSettings(e.currentTarget, {
      business_name: nombre,
      tagline: val(panel, "#cfg-tagline") || null,
      address: val(panel, "#cfg-address") || null,
      phone: val(panel, "#cfg-phone") || null,
      whatsapp: val(panel, "#cfg-whatsapp").replace(/[^0-9]/g, "") || null,
      instagram: val(panel, "#cfg-instagram") || null,
    }, onDone);
  });
}

function panelPromo(panel, settings, onDone) {
  panel.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="switch-row" for="cfg-promo-on">
          <input type="checkbox" id="cfg-promo-on" ${settings.promo_active ? "checked" : ""}>
          <span>Mostrar la promoción en la página pública</span>
        </label>
      </div>
      <div class="field"><label for="cfg-promo-text">Texto de la promoción</label>
        <input id="cfg-promo-text" value="${escapeHtml(settings.promo_text || "")}" maxlength="120"
               placeholder="Martes 2x1 en corte clásico">
        <p class="field-help">Si está vacío, la tarjeta no aparece aunque esté activada.</p></div>
      <div id="cfg-err" class="text-danger mb-8" hidden></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="cfg-save">Guardar</button>
        <button class="btn btn-ghost" id="cfg-cancel">Cancelar</button>
      </div>
    </div>`;

  panel.querySelector("#cfg-cancel").addEventListener("click", onDone);
  panel.querySelector("#cfg-save").addEventListener("click", (e) => {
    const err = panel.querySelector("#cfg-err");
    err.hidden = true;
    const activa = panel.querySelector("#cfg-promo-on").checked;
    const texto = val(panel, "#cfg-promo-text");
    if (activa && !texto) {
      err.textContent = "Escribe el texto de la promoción o desactívala.";
      err.hidden = false;
      panel.querySelector("#cfg-promo-text").focus();
      return;
    }
    guardarSettings(e.currentTarget, { promo_active: activa, promo_text: texto || null }, onDone);
  });
}

function panelImagenes(panel, settings, onDone) {
  panel.innerHTML = `
    <div class="card">
      ${imageFieldHTML("cfg-logo", "Logotipo", settings.logo_url, "Se usa en la barra superior y en el pie. JPG, PNG o WebP, máximo 5 MB.")}
      ${imageFieldHTML("cfg-hero", "Imagen de portada", settings.hero_image_url, "Fondo de la portada pública.")}
      <div id="cfg-err" class="text-danger mb-8" hidden></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="cfg-save">Guardar</button>
        <button class="btn btn-ghost" id="cfg-cancel">Cancelar</button>
      </div>
    </div>`;

  const logo = wireImageField(panel, "cfg-logo", { carpeta: "logo", urlActual: settings.logo_url });
  const hero = wireImageField(panel, "cfg-hero", { carpeta: "hero", urlActual: settings.hero_image_url });

  panel.querySelector("#cfg-cancel").addEventListener("click", onDone);
  panel.querySelector("#cfg-save").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    const err = panel.querySelector("#cfg-err");
    err.hidden = true;
    boton.disabled = true;
    boton.textContent = "Subiendo…";
    try {
      const [logo_url, hero_image_url] = await Promise.all([logo.guardar(), hero.guardar()]);
      boton.textContent = "Guardando…";
      await data.updateSettings({ logo_url, hero_image_url });
      toast("Imágenes actualizadas. Ya se ven en la página pública.", "success");
      onDone();
    } catch (error) {
      err.textContent = friendlyError(error);
      err.hidden = false;
      boton.disabled = false;
      boton.textContent = "Guardar";
    }
  });
}

/* ===============================================================
   Carrusel de la portada de INICIO — la baraja 3D
   ===============================================================

   Las fotografías que giran arriba, en la portada. Hasta ahora estaban
   incrustadas en el código; ahora se administran desde aquí.

   Es una colección DISTINTA de los cortes destacados: otra tabla
   (hero_slides), otro formato (3:4 en vez de 2:3) y otra carpeta del bucket
   (inicio/ en vez de cortes/). Los dos bloques no se mezclan. */
async function panelPortada(panel) {
  async function draw() {
    panel.innerHTML = `
      <div class="flex-between mb-8">
        <p class="view-sub" style="margin:0">Las fotografías que giran en la portada. Formato vertical 3:4.</p>
        <button class="btn btn-primary btn-sm" id="hs-add">+ Agregar imagen</button>
      </div>
      <div id="hs-list" class="card card-flush"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>`;

    panel.querySelector("#hs-add").addEventListener("click", () => openPortadaForm(null, draw));

    let slides;
    try {
      slides = await data.listHeroSlides(false);
    } catch (error) {
      panel.querySelector("#hs-list").innerHTML =
        `<div class="empty-state text-danger">${escapeHtml(friendlyError(error))}</div>`;
      return;
    }

    if (!slides.length) {
      panel.querySelector("#hs-list").innerHTML =
        `<div class="empty-state">Sin imágenes propias: la portada usa las fotografías que vienen con la aplicación. Pulsa «+ Agregar imagen» para poner las tuyas.</div>`;
      return;
    }

    const activas = slides.filter((d) => d.active).length;
    panel.querySelector("#hs-list").innerHTML = slides.map((d) => `
      <div class="card-row fc-row">
        <div class="fc-thumb fc-thumb-34">
          ${d.image_url
            ? `<img src="${escapeHtml(d.image_url)}" alt="">`
            : `<span class="img-preview-empty">Sin imagen</span>`}
        </div>
        <div class="list-item-main">
          <div class="list-item-title">
            ${escapeHtml(d.name)}
            ${!d.active ? '<span class="badge badge-neutral">Oculta</span>' : ""}
            ${d.no_zoom ? '<span class="badge badge-neutral">Sin acercamiento</span>' : ""}
          </div>
          <div class="list-item-sub">Orden ${d.sort_order}</div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" data-hs-edit="${d.id}">Editar</button>
          <button class="btn btn-ghost btn-sm text-danger" data-hs-del="${d.id}">Eliminar</button>
        </div>
      </div>`).join("") +
      `<div class="card-row"><div class="list-item-sub">El contador de la portada mostrará 01 / ${String(activas).padStart(2, "0")}.</div></div>`;

    panel.querySelectorAll("[data-hs-edit]").forEach((btn) => {
      const slide = slides.find((d) => d.id === btn.dataset.hsEdit);
      btn.addEventListener("click", () => openPortadaForm(slide, draw));
    });

    panel.querySelectorAll("[data-hs-del]").forEach((btn) => {
      const slide = slides.find((d) => d.id === btn.dataset.hsDel);
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Eliminar imagen de la portada",
          message: `Se quitará «${slide.name}» del carrusel de la portada. No afecta a los cortes destacados, ni a servicios, ni a reservas.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await data.deleteHeroSlide(slide.id);
          if (slide.image_url) await borrarImagen(slide.image_url);
          toast("Imagen eliminada de la portada.", "success");
          draw();
        } catch (error) {
          toast(friendlyError(error), "error");
        }
      });
    });
  }

  draw();
}

function openPortadaForm(slide, onDone) {
  const isEdit = !!slide;
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar imagen de la portada" : "Nueva imagen de la portada"}</h3>
    <div class="field mt-16"><label for="hs-name">Texto de la tarjeta</label>
      <input id="hs-name" value="${isEdit ? escapeHtml(slide.name) : ""}" maxlength="40"
             placeholder="Fresh Cut">
      <p class="field-help">Se lee en el pie de la tarjeta cuando está al frente.</p></div>
    <div class="field"><label for="hs-order">Orden de aparición</label>
      <input id="hs-order" type="number" min="0" max="999" value="${isEdit ? slide.sort_order ?? 0 : 0}">
      <p class="field-help">Menor número, antes en el giro.</p></div>
    ${imageFieldHTML("hs-img", "Fotografía", isEdit ? slide.image_url : null,
      "Vertical, formato 3:4 (por ejemplo 720×960). Es el mismo formato que usa la portada ahora.")}
    <div class="field">
      <label class="switch-row" for="hs-nozoom">
        <input type="checkbox" id="hs-nozoom" ${isEdit && slide.no_zoom ? "checked" : ""}>
        <span>Arte plano: no acercar la imagen</span>
      </label>
      <p class="field-help">Actívalo para logotipos o imágenes con texto. Evita que el acercamiento lento recorte los bordes. La tarjeta sigue girando igual.</p>
    </div>
    <div class="field">
      <label class="switch-row" for="hs-active">
        <input type="checkbox" id="hs-active" ${!isEdit || slide.active !== false ? "checked" : ""}>
        <span>Visible en la portada</span>
      </label>
      <p class="field-help">Si la apagas, deja de girar en la portada pero el registro se conserva. El contador se ajusta solo.</p>
    </div>
    <div id="hs-err" class="text-danger mb-8" hidden></div>
    <div class="flex gap-8 mt-16">
      <button type="button" class="btn btn-primary" id="hs-save">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button>
    </div>
  `);

  const imagen = wireImageField(overlay, "hs-img", {
    carpeta: "inicio",
    urlActual: isEdit ? slide.image_url || null : null,
  });

  overlay.querySelector("#hs-save").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    const err = overlay.querySelector("#hs-err");
    err.hidden = true;
    const name = overlay.querySelector("#hs-name").value.trim();
    if (!name) return mostrar(err, "Escribe el texto de la tarjeta.");

    boton.disabled = true;
    boton.textContent = imagen.hayCambio() ? "Subiendo…" : "Guardando…";
    try {
      const image_url = await imagen.guardar();
      boton.textContent = "Guardando…";
      const fila = {
        name,
        sort_order: Number(overlay.querySelector("#hs-order").value || 0),
        active: overlay.querySelector("#hs-active").checked,
        no_zoom: overlay.querySelector("#hs-nozoom").checked,
        image_url,
      };
      if (isEdit) await data.updateHeroSlide(slide.id, fila);
      else await data.createHeroSlide({
        name: fila.name,
        sortOrder: fila.sort_order,
        active: fila.active,
        noZoom: fila.no_zoom,
        imageUrl: image_url,
      });
      toast("Portada actualizada. Ya se ve en INICIO.", "success");
      close();
      onDone();
    } catch (error) {
      mostrar(err, friendlyError(error));
      boton.disabled = false;
      boton.textContent = "Guardar";
    }
  });
}

/* ===============================================================
   Cortes destacados de INICIO
   ===============================================================

   CMS de la colección editorial de la página pública. Es contenido, no
   catálogo: no hay precio, ni duración, ni reserva, y no toca services.

   Todo lo que el administrador puede hacer desde aquí —agregar, subir o
   reemplazar la lámina, quitarla, renombrar, describir, reordenar, ocultar
   y eliminar— se guarda en public.featured_cuts. No hay que editar código
   nunca más para cambiar estas imágenes. */
async function panelCortes(panel) {
  async function draw() {
    panel.innerHTML = `
      <div class="flex-between mb-8">
        <p class="view-sub" style="margin:0">Las láminas que se ven en INICIO. No son servicios reservables.</p>
        <button class="btn btn-primary btn-sm" id="fc-add">+ Agregar corte</button>
      </div>
      <div id="fc-list" class="card card-flush"><div class="text-center" style="padding:30px"><div class="spinner" style="margin:auto"></div></div></div>`;

    panel.querySelector("#fc-add").addEventListener("click", () => openCorteForm(null, draw));

    let cortes;
    try {
      cortes = await data.listFeaturedCuts(false);
    } catch (error) {
      panel.querySelector("#fc-list").innerHTML =
        `<div class="empty-state text-danger">${escapeHtml(friendlyError(error))}</div>`;
      return;
    }

    if (!cortes.length) {
      panel.querySelector("#fc-list").innerHTML =
        `<div class="empty-state">Todavía no hay cortes destacados. Pulsa «+ Agregar corte».</div>`;
      return;
    }

    panel.querySelector("#fc-list").innerHTML = cortes.map((c) => `
      <div class="card-row fc-row">
        <div class="fc-thumb">
          ${c.image_url
            ? `<img src="${escapeHtml(c.image_url)}" alt="">`
            : `<span class="img-preview-empty">Sin lámina</span>`}
        </div>
        <div class="list-item-main">
          <div class="list-item-title">
            ${escapeHtml(c.name)}
            ${!c.active ? '<span class="badge badge-neutral">Oculto</span>' : ""}
          </div>
          <div class="list-item-sub">
            Orden ${c.sort_order}${c.description ? ` · ${escapeHtml(c.description)}` : ""}
          </div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm" data-fc-edit="${c.id}">Editar</button>
          <button class="btn btn-ghost btn-sm text-danger" data-fc-del="${c.id}">Eliminar</button>
        </div>
      </div>`).join("");

    panel.querySelectorAll("[data-fc-edit]").forEach((btn) => {
      const corte = cortes.find((c) => c.id === btn.dataset.fcEdit);
      btn.addEventListener("click", () => openCorteForm(corte, draw));
    });

    panel.querySelectorAll("[data-fc-del]").forEach((btn) => {
      const corte = cortes.find((c) => c.id === btn.dataset.fcDel);
      btn.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Eliminar corte destacado",
          message: `Se quitará «${corte.name}» de INICIO y se borrará su lámina. Esto no afecta a servicios, reservas ni finanzas.`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await data.deleteFeaturedCut(corte.id);
          // La lámina se borra después del registro: si el borrado del
          // archivo falla, el corte ya desapareció de la web igualmente.
          if (corte.image_url) await borrarImagen(corte.image_url);
          toast("Corte eliminado.", "success");
          draw();
        } catch (error) {
          toast(friendlyError(error), "error");
        }
      });
    });
  }

  draw();
}

function openCorteForm(corte, onDone) {
  const isEdit = !!corte;
  const { overlay, close } = openModal(`
    <button class="btn btn-ghost btn-icon modal-close" data-close-modal aria-label="Cerrar">✕</button>
    <h3>${isEdit ? "Editar corte destacado" : "Nuevo corte destacado"}</h3>
    <div class="field mt-16"><label for="fc-name">Nombre</label>
      <input id="fc-name" value="${isEdit ? escapeHtml(corte.name) : ""}" maxlength="60"
             placeholder="Corte clásico"></div>
    <div class="field"><label for="fc-desc">Descripción</label>
      <input id="fc-desc" value="${isEdit ? escapeHtml(corte.description || "") : ""}" maxlength="120"
             placeholder="Opcional">
      <p class="field-help">Si la dejas vacía, no se muestra nada bajo el nombre.</p></div>
    <div class="field"><label for="fc-order">Orden de aparición</label>
      <input id="fc-order" type="number" min="0" max="999" value="${isEdit ? corte.sort_order ?? 0 : 0}">
      <p class="field-help">Menor número, más arriba.</p></div>
    ${imageFieldHTML("fc-img", "Lámina del corte", isEdit ? corte.image_url : null,
      "Vertical, formato 2:3 (por ejemplo 1024×1536). Se muestra completa, sin recortar.")}
    <div class="field">
      <label class="switch-row" for="fc-active">
        <input type="checkbox" id="fc-active" ${!isEdit || corte.active !== false ? "checked" : ""}>
        <span>Visible en INICIO</span>
      </label>
      <p class="field-help">Si lo apagas, deja de verse en la página pública pero el registro se conserva.</p>
    </div>
    <div id="fc-err" class="text-danger mb-8" hidden></div>
    <div class="flex gap-8 mt-16">
      <button type="button" class="btn btn-primary" id="fc-save">Guardar</button>
      <button type="button" class="btn btn-ghost" data-close-modal>Cancelar</button>
    </div>
  `);

  const imagen = wireImageField(overlay, "fc-img", {
    carpeta: "cortes",
    urlActual: isEdit ? corte.image_url || null : null,
  });

  overlay.querySelector("#fc-save").addEventListener("click", async (e) => {
    const boton = e.currentTarget;
    const err = overlay.querySelector("#fc-err");
    err.hidden = true;
    const name = overlay.querySelector("#fc-name").value.trim();
    if (!name) return mostrar(err, "Escribe el nombre del corte.");

    boton.disabled = true;
    boton.textContent = imagen.hayCambio() ? "Subiendo…" : "Guardando…";
    try {
      const image_url = await imagen.guardar();
      boton.textContent = "Guardando…";
      const fila = {
        name,
        description: overlay.querySelector("#fc-desc").value.trim() || null,
        sort_order: Number(overlay.querySelector("#fc-order").value || 0),
        active: overlay.querySelector("#fc-active").checked,
        image_url,
      };
      if (isEdit) await data.updateFeaturedCut(corte.id, fila);
      else await data.createFeaturedCut({
        name: fila.name,
        description: fila.description,
        sortOrder: fila.sort_order,
        active: fila.active,
        imageUrl: image_url,
      });
      toast("Corte guardado. Ya se ve en INICIO.", "success");
      close();
      onDone();
    } catch (error) {
      mostrar(err, friendlyError(error));
      boton.disabled = false;
      boton.textContent = "Guardar";
    }
  });
}

function panelReservas(panel, settings, onDone) {
  panel.innerHTML = `
    <div class="card">
      <div class="field">
        <label class="switch-row" for="cfg-booking">
          <input type="checkbox" id="cfg-booking" ${settings.booking_enabled ? "checked" : ""}>
          <span>Aceptar reservas en línea</span>
        </label>
        <p class="field-help">Si lo apagas, la página pública deja de ofrecer horarios.</p>
      </div>
      <div class="field"><label for="cfg-slot">Intervalo entre horarios (minutos)</label>
        <input id="cfg-slot" type="number" min="5" max="240" step="5" value="${settings.slot_minutes}">
        <p class="field-help">Cada cuánto empieza una cita. La duración la marca el servicio.</p></div>
      <div class="field"><label for="cfg-days">Días que se pueden reservar por adelantado</label>
        <input id="cfg-days" type="number" min="1" max="365" value="${settings.max_days_ahead}"></div>
      <div class="field"><label for="cfg-notice">Antelación mínima (horas)</label>
        <input id="cfg-notice" type="number" min="0" max="168" value="${settings.min_hours_notice}"></div>
      <div id="cfg-err" class="text-danger mb-8" hidden></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="cfg-save">Guardar</button>
        <button class="btn btn-ghost" id="cfg-cancel">Cancelar</button>
      </div>
    </div>`;

  panel.querySelector("#cfg-cancel").addEventListener("click", onDone);
  panel.querySelector("#cfg-save").addEventListener("click", (e) => {
    const err = panel.querySelector("#cfg-err");
    err.hidden = true;
    const slot = Number(panel.querySelector("#cfg-slot").value);
    const dias = Number(panel.querySelector("#cfg-days").value);
    const horas = Number(panel.querySelector("#cfg-notice").value);
    // Los mismos límites que impone la base, comprobados antes de viajar.
    if (!(slot >= 5 && slot <= 240)) return mostrar(err, "El intervalo debe estar entre 5 y 240 minutos.");
    if (!(dias >= 1 && dias <= 365)) return mostrar(err, "Los días por adelantado deben estar entre 1 y 365.");
    if (!(horas >= 0 && horas <= 168)) return mostrar(err, "La antelación mínima debe estar entre 0 y 168 horas.");
    guardarSettings(e.currentTarget, {
      booking_enabled: panel.querySelector("#cfg-booking").checked,
      slot_minutes: slot,
      max_days_ahead: dias,
      min_hours_notice: horas,
    }, onDone);
  });
}

function mostrar(caja, mensaje) {
  caja.textContent = mensaje;
  caja.hidden = false;
}

// Ajustes internos, que no ve el cliente. Se quedan aquí para no perderlos.
function panelOperacion(panel, settings, onDone) {
  panel.innerHTML = `
    <div class="card">
      <div class="field"><label for="cfg-pct">Porcentaje por defecto del barbero (%)</label>
        <input id="cfg-pct" type="number" min="0" max="100" step="0.01" value="${settings.default_barber_percentage}"></div>
      <div class="field"><label for="cfg-tz">Zona horaria</label>
        <input id="cfg-tz" value="${escapeHtml(settings.timezone || "")}">
        <p class="field-help">Afecta a los horarios que se ofrecen al reservar. Ejemplo: America/Mexico_City</p></div>
      <div id="cfg-err" class="text-danger mb-8" hidden></div>
      <div class="flex gap-8">
        <button class="btn btn-primary" id="cfg-save">Guardar</button>
        <button class="btn btn-ghost" id="cfg-cancel">Cancelar</button>
      </div>
    </div>`;

  panel.querySelector("#cfg-cancel").addEventListener("click", onDone);
  panel.querySelector("#cfg-save").addEventListener("click", (e) => {
    const err = panel.querySelector("#cfg-err");
    err.hidden = true;
    const tz = val(panel, "#cfg-tz");
    if (!tz) return mostrar(err, "La zona horaria no puede quedar vacía.");
    guardarSettings(e.currentTarget, {
      default_barber_percentage: Number(panel.querySelector("#cfg-pct").value || 60),
      timezone: tz,
    }, onDone);
  });
}
