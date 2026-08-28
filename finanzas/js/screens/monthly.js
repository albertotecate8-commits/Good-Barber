// RESUMEN MENSUAL: ingresos y gastos del mes desglosados por concepto.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { todayISO, startOfMonth, endOfMonth, addMonths, formatMonthYear } from "../dates.js";
import { icon, empty } from "../ui.js";
import { backHeader, donutChart } from "../components.js";

let cursor = null;

function conceptTotals(from, to, type) {
  const totals = new Map();
  Finance.movementsBetween(from, to).forEach((m) => {
    if (m.type !== type) return;
    const key = m.concept;
    totals.set(key, (totals.get(key) || 0) + m.amount);
  });
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function block(title, rows, total, positive) {
  return `
    <div class="section-head">
      <h2 class="section-title">${esc(title)}</h2>
      <span class="section-link num ${positive ? "pos" : ""}">${esc(money(total))}</span>
    </div>
    ${rows.length
      ? `<div class="card">${rows.map((r) => `
          <div class="kv">
            <span class="k">${esc(r.name)}</span>
            <span class="v num ${positive ? "pos" : ""}">${esc(money(r.amount))}</span>
          </div>`).join("")}
          <div class="kv" style="border-top:1.5px solid rgba(19,19,19,.08);margin-top:4px;padding-top:12px">
            <span class="k strong" style="font-weight:700;color:var(--text)">Total</span>
            <span class="v num ${positive ? "pos" : ""}">${esc(money(total))}</span>
          </div>
        </div>`
      : `<div class="card">${empty("Sin registros", "Todavía no hay movimientos de este tipo en el mes.", "chart")}</div>`}`;
}

export default {
  render() {
    if (!cursor) cursor = startOfMonth(todayISO());
    const from = startOfMonth(cursor);
    const to = endOfMonth(cursor);
    const summary = Finance.summaryBetween(from, to);
    const income = conceptTotals(from, to, "income");
    const expense = conceptTotals(from, to, "expense");
    const categories = Finance.categoryBreakdown(from, to);

    return `
      ${backHeader("Resumen del mes", formatMonthYear(cursor))}

      <div class="card">
        <div class="cal-head" style="margin:0">
          <button class="icon-btn is-outline" data-move="-1" aria-label="Mes anterior">${icon("back", 17, 2.2)}</button>
          <div class="cal-month">${esc(formatMonthYear(cursor))}</div>
          <button class="icon-btn is-outline" data-move="1" aria-label="Mes siguiente">${icon("chevron", 17, 2.2)}</button>
        </div>
      </div>

      <section class="card-dark mt-14">
        <div class="mini-grid">
          <div class="mini"><div class="k">Ingresos</div><div class="v lime num">${esc(money(summary.income))}</div></div>
          <div class="mini"><div class="k">Gastos</div><div class="v num">${esc(money(summary.paid))}</div></div>
          <div class="mini"><div class="k">Balance</div>
            <div class="v num" style="color:${summary.net >= 0 ? "var(--lime)" : "#ff9096"}">${esc(money(summary.net))}</div>
          </div>
        </div>
      </section>

      ${block("Ingresos del mes", income, summary.income, true)}
      ${block("Gastos del mes", expense, summary.paid, false)}

      <div class="section-head">
        <h2 class="section-title">Por categoría</h2>
      </div>
      <div class="card">${donutChart(categories.rows, categories.total, "Pagado")}</div>

      <div class="section-head">
        <h2 class="section-title">Pendiente del mes</h2>
        <span class="section-link num">${esc(money(summary.pending))}</span>
      </div>
      <div class="card">
        <div class="kv"><span class="k">Ingresos esperados sin recibir</span><span class="v num">${esc(money(summary.expectedIncome))}</span></div>
        <div class="kv"><span class="k">Pagos pendientes del mes</span><span class="v num">${esc(money(summary.pending))}</span></div>
      </div>`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cursor = startOfMonth(addMonths(cursor, Number(btn.dataset.move), 1));
        ctx.rerender();
      });
    });
  },
};
