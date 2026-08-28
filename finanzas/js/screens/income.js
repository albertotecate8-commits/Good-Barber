// Pantalla INGRESOS: semanales, mensuales, extraordinarios y recibidos.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, STATUS } from "../model.js";
import { money, esc } from "../format.js";
import { todayISO, endOfMonth, addDays, formatMedium, recurrenceShort } from "../dates.js";
import { icon, empty } from "../ui.js";
import { occurrenceRow, movementRow } from "../components.js";

function summaryCard() {
  const today = todayISO();
  const summary = Finance.monthSummary(today);
  const expected = Finance.pendingIncomes({ until: endOfMonth(today) })
    .reduce((s, o) => s + o.amount, 0);
  const week = Finance.weekSummary(today);

  return `
    <section class="card-dark">
      <div class="hero-label" style="text-align:left">Recibido este mes</div>
      <div class="hero-amount num" style="text-align:left;font-size:32px">${esc(money(summary.income))}</div>
      <div class="mini-grid mt-14">
        <div class="mini">
          <div class="k">Esta semana</div>
          <div class="v lime num">${esc(money(week.income))}</div>
        </div>
        <div class="mini">
          <div class="k">Por recibir</div>
          <div class="v warn num">${esc(money(expected))}</div>
        </div>
        <div class="mini">
          <div class="k">Disponible</div>
          <div class="v num">${esc(money(Store.availableMoney()))}</div>
        </div>
      </div>
    </section>`;
}

/** Fila de ingreso esperado con botón de cobro directo. */
function expectedRow(occ) {
  const overdue = occ.dueDate <= todayISO();
  return `
    <div class="row has-actions" style="cursor:default">
      <span class="row-ico c-ingreso">${icon("income", 18)}</span>
      <button class="row-body" data-action="open-item" data-id="${esc(occ.itemId)}" style="text-align:left">
        <span class="row-title">${esc(occ.name)}</span>
        <span class="row-sub">
          <span class="chip ${overdue ? "lime" : "pending"}">${overdue ? "Listo para cobrar" : "Esperado"}</span>
          <span>${esc(formatMedium(occ.dueDate))}</span>
        </span>
      </button>
      <span class="row-end"><span class="row-amount num pos">+${esc(money(occ.amount))}</span></span>
      <span class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="edit-occ" data-occ="${esc(occ.id)}">Ajustar</button>
        <button class="btn btn-lime btn-sm" data-action="receive" data-occ="${esc(occ.id)}">Recibir</button>
      </span>
    </div>`;
}

function extraordinarySection() {
  const list = Store.items().filter((i) => i.active && i.kind === KIND.INCOME && !i.startDate);
  if (!list.length) return "";

  return `
    <div class="section-head">
      <h2 class="section-title">Ingreso extraordinario</h2>
    </div>
    <div class="list">
      ${list.map((item) => `
        <div class="row has-actions" style="cursor:default">
          <span class="row-ico c-ingreso">${icon("income", 18)}</span>
          <button class="row-body" data-action="open-item" data-id="${esc(item.id)}" style="text-align:left">
            <span class="row-title">${esc(item.name)}</span>
            <span class="row-sub">
              <span class="chip pending">${esc(item.statusNote || "Pendiente")}</span>
            </span>
          </button>
          <span class="row-end"><span class="row-amount num pos">+${esc(money(item.amount))}</span></span>
          <span class="row-actions">
            <button class="btn btn-outline btn-sm" data-action="open-item" data-id="${esc(item.id)}">Detalle</button>
            <button class="btn btn-lime btn-sm" data-action="receive-item" data-id="${esc(item.id)}">Recibir</button>
          </span>
        </div>`).join("")}
    </div>`;
}

function sourcesSection() {
  const list = Store.items()
    .filter((i) => i.active && i.kind === KIND.INCOME && i.startDate)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  if (!list.length) return "";

  return `
    <div class="section-head">
      <h2 class="section-title">Fuentes de ingreso</h2>
    </div>
    <div class="list">
      ${list.map((item) => `
        <button class="row" data-action="open-item" data-id="${esc(item.id)}">
          <span class="row-ico c-ingreso">${icon("income", 18)}</span>
          <span class="row-body">
            <span class="row-title">${esc(item.name)}</span>
            <span class="row-sub"><span class="chip neutral">${esc(recurrenceShort(item.recurrence))}</span>${item.variable ? '<span class="chip neutral">Editable</span>' : ""}</span>
          </span>
          <span class="row-end">
            <span class="row-amount num pos">+${esc(money(item.amount))}</span>
            <span class="row-meta">esperado</span>
          </span>
        </button>`).join("")}
    </div>`;
}

export default {
  render() {
    const today = todayISO();
    const expected = Finance.pendingIncomes({ until: addDays(today, 45) });
    const received = Store.movements()
      .filter((m) => m.type === "income")
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
      .slice(0, 8);

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Ingresos</b></div>
          <div class="head-sub">Solo suman cuando los marcas recibidos</div>
        </div>
        <button class="icon-btn is-lime" data-action="new-income-source" aria-label="Nueva fuente de ingreso">${icon("plus", 20, 2.4)}</button>
      </header>

      ${summaryCard()}

      <div class="btn-row mt-14">
        <button class="btn btn-lime" data-action="quick-income">${icon("plus", 18, 2.4)} Ingreso</button>
        <button class="btn btn-outline" data-action="nav" data-to="#/historial">${icon("history", 17)} Historial</button>
      </div>

      <div class="section-head">
        <h2 class="section-title">Por recibir</h2>
      </div>
      ${expected.length
        ? `<div class="list">${expected.slice(0, 12).map(expectedRow).join("")}</div>`
        : `<div class="card">${empty("Nada por recibir", "Cuando venza un ingreso aparecerá aquí.", "income")}</div>`}

      ${extraordinarySection()}
      ${sourcesSection()}

      <div class="section-head">
        <h2 class="section-title">Recibidos</h2>
        <button class="section-link" data-action="nav" data-to="#/historial">Ver todo ${icon("chevron", 13, 2.4)}</button>
      </div>
      ${received.length
        ? `<div class="list">${received.map(movementRow).join("")}</div>`
        : `<div class="card">${empty("Sin ingresos registrados", "Usa “Ingreso rápido” para registrar el primero.", "income")}</div>`}`;
  },

  mount() {},
};
