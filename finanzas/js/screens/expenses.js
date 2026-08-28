// Pantalla GASTOS: pagos pendientes, vencidos y pagados + conceptos fijos.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, STATUS } from "../model.js";
import { money, esc } from "../format.js";
import { todayISO, endOfMonth, formatMedium } from "../dates.js";
import { icon, empty } from "../ui.js";
import { occurrenceRow, itemRow, groupedByDate } from "../components.js";

let filter = "pending";
let query = "";

const FILTERS = [
  { id: "pending", label: "Pendientes" },
  { id: "overdue", label: "Vencidos" },
  { id: "paid", label: "Pagados" },
  { id: "all", label: "Todos" },
];

function listFor() {
  const today = todayISO();
  const all = Store.occurrences().filter((o) => Finance.isExpenseKind(o.kind));
  const q = query.trim().toLocaleLowerCase("es");
  const match = (o) => !q || o.name.toLocaleLowerCase("es").includes(q) ||
    Store.categoryName(o.category).toLocaleLowerCase("es").includes(q);

  let rows;
  switch (filter) {
    case "overdue":
      rows = all.filter((o) => o.status === STATUS.PENDING && o.dueDate < today);
      break;
    case "paid":
      rows = all.filter((o) => o.status === STATUS.PAID);
      break;
    case "all":
      rows = all;
      break;
    default:
      rows = all.filter((o) => o.status === STATUS.PENDING);
  }

  rows = rows.filter(match);
  const asc = filter === "pending" || filter === "overdue";
  return rows.sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name, "es") : (a.dueDate < b.dueDate ? (asc ? -1 : 1) : (asc ? 1 : -1))));
}

function totalsCard() {
  const today = todayISO();
  const overdue = Finance.overduePayments();
  const committed = Finance.committedThisMonth(today);
  const paid = Finance.monthSummary(today).paid;

  return `
    <section class="card-dark">
      <div class="mini-grid">
        <div class="mini">
          <div class="k">Pendiente</div>
          <div class="v warn num">${esc(money(committed.total))}</div>
        </div>
        <div class="mini">
          <div class="k">Vencido</div>
          <div class="v num" style="${overdue.length ? "color:#ff9096" : ""}">${esc(money(overdue.reduce((s, o) => s + o.amount, 0)))}</div>
        </div>
        <div class="mini">
          <div class="k">Pagado del mes</div>
          <div class="v lime num">${esc(money(paid))}</div>
        </div>
      </div>
    </section>`;
}

function unscheduledSection() {
  const list = Store.items().filter(
    (i) => i.active && Finance.isExpenseKind(i.kind) && !i.startDate
  );
  if (!list.length) return "";

  return `
    <div class="section-head">
      <h2 class="section-title">Sin fecha programada</h2>
    </div>
    <p class="tiny muted" style="margin:-4px 2px 10px">
      No indicaste una fecha para estos conceptos. Ábrelos para ponerles fecha o regístralos cuando los pagues.
    </p>
    <div class="list">${list.map(itemRow).join("")}</div>`;
}

function conceptsSection() {
  const byCategory = new Map();
  Store.items()
    .filter((i) => i.active && Finance.isExpenseKind(i.kind) && i.startDate)
    .forEach((item) => {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category).push(item);
    });

  if (!byCategory.size) return "";

  return [...byCategory.entries()].map(([categoryId, list]) => {
    const total = list.reduce((s, i) => s + i.amount, 0);
    return `
      <div class="section-head">
        <h2 class="section-title">${esc(Store.categoryName(categoryId))}</h2>
        <span class="section-link num">${esc(money(total))}</span>
      </div>
      <div class="list">${list.sort((a, b) => a.name.localeCompare(b.name, "es")).map(itemRow).join("")}</div>`;
  }).join("");
}

export default {
  render() {
    const rows = listFor();

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Gastos</b></div>
          <div class="head-sub">${rows.length} registro${rows.length === 1 ? "" : "s"}</div>
        </div>
        <button class="icon-btn is-lime" data-action="new-expense" aria-label="Nuevo gasto">${icon("plus", 20, 2.4)}</button>
      </header>

      ${totalsCard()}

      <div class="search">
        <span class="mag">${icon("search", 16, 2.2)}</span>
        <input type="text" placeholder="Buscar gasto…" data-search value="${esc(query)}">
      </div>

      <div class="filters mt-14">
        ${FILTERS.map((f) => `<button class="filter ${f.id === filter ? "is-on" : ""}" data-filter="${f.id}">${esc(f.label)}</button>`).join("")}
      </div>

      ${rows.length
        ? (filter === "paid" || filter === "all"
            ? `<div class="list">${rows.map((o) => occurrenceRow(o)).join("")}</div>`
            : groupedByDate(rows, (o) => occurrenceRow(o, { hideDate: true })))
        : `<div class="card">${empty("Nada por aquí", query ? "Prueba con otra búsqueda." : "No hay gastos con ese filtro.", "wallet")}</div>`}

      ${unscheduledSection()}
      ${conceptsSection()}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        ctx.rerender();
      });
    });

    const search = root.querySelector("[data-search]");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          query = search.value;
          ctx.rerender(() => {
            const next = document.querySelector("[data-search]");
            if (next) {
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
            }
          });
        }, 220);
      });
    }
  },
};
