// Pantalla MOVIMIENTOS: ingresos y gastos en un solo lugar, con los dos
// botones grandes de registro rápido arriba (sección 5/6/17 del rediseño).
// Reutiliza expenses.js/income.js tal cual (su lógica de filtros, corte
// semanal, conceptos, etc. no cambió) a través de body()/mountBody().

import { icon } from "../ui.js";
import { body as expenseBody, mountBody as mountExpense } from "./expenses.js";
import { body as incomeBody, mountBody as mountIncome } from "./income.js";

let section = "expense"; // expense | income

export default {
  render() {
    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Movimientos</b></div>
          <div class="head-sub">Ingresos y gastos de los 3 negocios y lo personal</div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      <div class="btn-row">
        <button class="btn btn-lime" data-action="quick-income">${icon("plus", 18, 2.4)} Registrar ingreso</button>
        <button class="btn btn-ink" data-action="quick-expense">${icon("minus", 18, 2.4)} Registrar gasto</button>
      </div>

      <div class="segment mt-14" data-section-group>
        <button data-section="expense" class="${section === "expense" ? "is-on" : ""}">Gastos</button>
        <button data-section="income" class="${section === "income" ? "is-on" : ""}">Ingresos</button>
      </div>

      ${section === "income" ? incomeBody() : expenseBody()}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-section]").forEach((btn) => {
      btn.addEventListener("click", () => {
        section = btn.dataset.section;
        ctx.rerender();
      });
    });

    if (section === "income") mountIncome(root, ctx);
    else mountExpense(root, ctx);
  },
};
