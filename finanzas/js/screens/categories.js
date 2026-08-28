// Pantalla CATEGORÍAS: cuánto hay comprometido por categoría, y el detalle
// de cada una. Crear/eliminar categorías vive aquí (antes solo en Más).

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { icon, empty, sheet, toast, confirmSheet } from "../ui.js";
import { backHeader, itemRow, heavyCard } from "../components.js";

function categoryRow(r) {
  return `
    <button class="row" data-action="nav" data-to="#/categorias/${esc(r.id)}">
      <span class="row-ico" style="background:${esc(r.color)}22;color:${esc(r.color)}">${icon("tag", 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(r.name)}</span>
        <span class="row-sub"><span class="chip neutral">${r.count} registro${r.count === 1 ? "" : "s"}</span></span>
      </span>
      <span class="row-end"><span class="row-amount num">${esc(money(r.total))}</span></span>
    </button>`;
}

function listScreen() {
  const rows = Finance.categoryCommitment();
  const expenseRows = rows.filter((r) => r.type !== "income");
  const incomeRows = rows.filter((r) => r.type === "income");
  const expenseTotal = expenseRows.reduce((s, r) => s + r.total, 0);
  const incomeTotal = incomeRows.reduce((s, r) => s + r.total, 0);

  return `
    ${backHeader("Categorías", "Cuánto tienes comprometido por categoría")}

    <section class="card-dark">
      <div class="hero-label" style="text-align:left">Comprometido en gastos y deudas</div>
      <div class="hero-amount num" style="text-align:left;font-size:30px">${esc(money(expenseTotal))}</div>
      ${incomeTotal ? `<div class="hero-note" style="text-align:left">Por recibir en total: ${esc(money(incomeTotal))}</div>` : ""}
    </section>

    ${expenseRows.length ? `
      <div class="section-head"><h2 class="section-title">Gastos y deudas</h2></div>
      <div class="list">${expenseRows.map(categoryRow).join("")}</div>`
      : `<div class="card mt-14">${empty("Sin categorías con registros", "Crea gastos o deudas para verlos agrupados aquí.", "tag")}</div>`}

    ${incomeRows.length ? `
      <div class="section-head"><h2 class="section-title">Ingresos</h2></div>
      <div class="list">${incomeRows.map(categoryRow).join("")}</div>` : ""}

    <div class="btn-row mt-14">
      <button class="btn btn-ink" data-action="new-category">${icon("plus", 17, 2.4)} Nueva categoría</button>
    </div>`;
}

function detailScreen(id) {
  const cat = Store.getCategory(id);
  if (!cat) {
    return `${backHeader("Categoría", "")}<div class="card">${empty("No encontrada", "Puede que la hayas eliminado.", "tag")}</div>`;
  }

  const items = Store.items().filter((i) => i.active && i.category === id);
  const total = items.reduce((s, i) => s + (i.kind === "heavy" ? i.balance || 0 : i.amount), 0);

  const isIncome = cat.type === "income";

  return `
    ${backHeader(cat.name, isIncome ? "Categoría de ingresos" : "Categoría de gastos")}

    <section class="card-dark">
      <div class="hero-label" style="text-align:left">${isIncome ? "Esperado en" : "Comprometido en"} ${esc(cat.name)}</div>
      <div class="hero-amount num" style="text-align:left;font-size:30px">${esc(money(total))}</div>
    </section>

    <div class="list mt-14">
      ${items.length
        ? items.map((i) => (i.kind === "heavy" ? heavyCard(i) : itemRow(i))).join("")
        : `<div class="card">${empty("Sin registros activos", "", "tag")}</div>`}
    </div>

    <div class="btn-row mt-14">
      <button class="btn btn-danger" data-action="delete-category" data-id="${esc(cat.id)}">${icon("trash", 17, 2)} Eliminar categoría</button>
    </div>`;
}

function newCategorySheet(onDone) {
  sheet({
    title: "Nueva categoría",
    body: `
      <div class="field">
        <label for="f-catname">Nombre</label>
        <input id="f-catname" class="input" type="text" data-name placeholder="Ej. Salud">
      </div>
      <div class="field">
        <label for="f-cattype">Tipo</label>
        <select id="f-cattype" class="select" data-type>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
      </div>
      <div class="field-error" data-error hidden></div>
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>Crear categoría</button>
      </div>`,
    onMount: (panel, close) => {
      panel.querySelector("[data-submit]").addEventListener("click", async () => {
        const errorBox = panel.querySelector("[data-error]");
        errorBox.hidden = true;
        try {
          await Store.saveCategory({
            name: panel.querySelector("[data-name]").value,
            type: panel.querySelector("[data-type]").value,
          });
          close();
          toast("Categoría creada", "ok");
          if (onDone) onDone();
        } catch (err) {
          errorBox.textContent = err.message;
          errorBox.hidden = false;
        }
      });
    },
  });
}

export default {
  render(params) {
    return params && params.id ? detailScreen(params.id) : listScreen();
  },

  mount(root, ctx) {
    root.addEventListener("click", async (event) => {
      const newBtn = event.target.closest('[data-action="new-category"]');
      if (newBtn) {
        newCategorySheet(() => ctx.rerender());
        return;
      }
      const delBtn = event.target.closest('[data-action="delete-category"]');
      if (delBtn) {
        const id = delBtn.dataset.id;
        const cat = Store.getCategory(id);
        const ok = await confirmSheet({
          title: `¿Eliminar "${cat ? cat.name : ""}"?`,
          message: "Solo puede eliminarse si ningún registro la está usando.",
          confirmText: "Sí, eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await Store.deleteCategory(id);
          toast("Categoría eliminada", "ok");
          location.hash = "#/categorias";
        } catch (err) {
          toast(err.message, "err");
        }
      }
    });
  },
};
