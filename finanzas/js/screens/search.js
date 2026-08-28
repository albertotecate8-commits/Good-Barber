// BÚSQUEDA y filtros sobre todo lo registrado.

import * as Finance from "../finance.js";
import { esc } from "../format.js";
import { icon, empty } from "../ui.js";
import { backHeader, occurrenceRow, movementRow, itemRow } from "../components.js";

let query = "";
let filter = "all";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendientes" },
  { id: "paid", label: "Pagados" },
  { id: "overdue", label: "Vencidos" },
  { id: "income", label: "Ingresos" },
  { id: "expense", label: "Gastos" },
  { id: "debt", label: "Deudas" },
];

export default {
  render() {
    const result = Finance.search(query, filter);
    const nothing = !result.items.length && !result.occurrences.length && !result.movements.length;

    return `
      ${backHeader("Buscar", "Conceptos, pagos y movimientos")}

      <div class="search" style="margin-top:0">
        <span class="mag">${icon("search", 16, 2.2)}</span>
        <input type="text" placeholder="Mercado Libre, Vexi, Netflix…" data-search value="${esc(query)}">
      </div>

      <div class="filters mt-14">
        ${FILTERS.map((f) => `<button class="filter ${f.id === filter ? "is-on" : ""}" data-filter="${f.id}">${esc(f.label)}</button>`).join("")}
      </div>

      ${nothing
        ? `<div class="card">${empty(query ? "Sin resultados" : "Escribe para buscar", query ? "Prueba con otro nombre." : "También puedes filtrar por estado.", "search")}</div>`
        : ""}

      ${result.items.length ? `
        <div class="section-head"><h2 class="section-title">Conceptos</h2></div>
        <div class="list">${result.items.map(itemRow).join("")}</div>` : ""}

      ${result.occurrences.length ? `
        <div class="section-head"><h2 class="section-title">Vencimientos</h2></div>
        <div class="list">${result.occurrences.map((o) => occurrenceRow(o)).join("")}</div>` : ""}

      ${result.movements.length ? `
        <div class="section-head"><h2 class="section-title">Movimientos</h2></div>
        <div class="list">${result.movements.map(movementRow).join("")}</div>` : ""}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        ctx.rerender();
      });
    });

    const input = root.querySelector("[data-search]");
    if (input) {
      let timer = null;
      input.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          query = input.value;
          ctx.rerender(() => {
            const next = document.querySelector("[data-search]");
            if (next) {
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
            }
          });
        }, 200);
      });
      setTimeout(() => input.focus(), 80);
    }
  },
};
