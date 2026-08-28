// BÚSQUEDA y filtros sobre todo lo registrado.

import * as Finance from "../finance.js";
import * as Filters from "../filters.js";
import { esc } from "../format.js";
import { icon, empty } from "../ui.js";
import { backHeader, occurrenceRow, movementRow, itemRow } from "../components.js";

let query = "";
let filter = "all";
let advanced = { ...Filters.DEFAULT_FILTER };

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
    const isAdvanced = !Filters.isDefaultFilter(advanced);

    let occurrences = result.occurrences;
    let movements = result.movements;

    if (isAdvanced) {
      occurrences = Filters.applyAll(occurrences.map(Filters.normalizeOccurrence), advanced).map((r) => r.raw);
      movements = Filters.applyAll(movements.map(Filters.normalizeMovement), advanced).map((r) => r.raw);
    }

    const nothing = !result.items.length && !occurrences.length && !movements.length;

    return `
      ${backHeader("Buscar", "Conceptos, pagos y movimientos")}

      <div class="flex" style="gap:8px;margin-top:0">
        <div class="search grow" style="margin:0">
          <span class="mag">${icon("search", 16, 2.2)}</span>
          <input type="text" placeholder="Mercado Libre, Vexi, Netflix…" data-search value="${esc(query)}">
        </div>
        <button class="icon-btn ${isAdvanced ? "is-dark" : "is-outline"}" data-action="open-filters" aria-label="Filtrar">${icon("filter", 18, 2.2)}</button>
      </div>

      <div class="filters mt-14">
        ${FILTERS.map((f) => `<button class="filter ${f.id === filter ? "is-on" : ""}" data-filter="${f.id}">${esc(f.label)}</button>`).join("")}
      </div>

      ${nothing
        ? `<div class="card">${empty(query ? "Sin resultados" : "Escribe para buscar", query ? "Prueba con otro nombre o quita algún filtro." : "También puedes filtrar por estado, categoría o fecha.", "search")}</div>`
        : ""}

      ${result.items.length ? `
        <div class="section-head"><h2 class="section-title">Conceptos</h2></div>
        <div class="list">${result.items.map(itemRow).join("")}</div>` : ""}

      ${occurrences.length ? `
        <div class="section-head"><h2 class="section-title">Vencimientos</h2></div>
        <div class="list">${occurrences.map((o) => occurrenceRow(o)).join("")}</div>` : ""}

      ${movements.length ? `
        <div class="section-head"><h2 class="section-title">Movimientos</h2></div>
        <div class="list">${movements.map(movementRow).join("")}</div>` : ""}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        ctx.rerender();
      });
    });

    const filterBtn = root.querySelector('[data-action="open-filters"]');
    if (filterBtn) {
      filterBtn.addEventListener("click", () => {
        Filters.openFilterSheet({
          state: advanced,
          onApply: (next) => { advanced = next; ctx.rerender(); },
        });
      });
    }

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
