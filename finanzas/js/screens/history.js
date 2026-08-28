// HISTORIAL completo de movimientos. Nunca se borra solo.

import * as Store from "../store.js";
import { money, esc } from "../format.js";
import { formatLong, monthKey, formatMonthYear } from "../dates.js";
import { icon, empty } from "../ui.js";
import { backHeader, movementRow } from "../components.js";

let filter = "all";

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "income", label: "Ingresos" },
  { id: "expense", label: "Gastos" },
  { id: "debt", label: "Deudas" },
];

export default {
  render() {
    let rows = Store.movements().sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1
    );

    if (filter === "income") rows = rows.filter((m) => m.type === "income");
    if (filter === "expense") rows = rows.filter((m) => m.type === "expense" && m.kind !== "debt" && m.kind !== "heavy");
    if (filter === "debt") rows = rows.filter((m) => m.kind === "debt" || m.kind === "heavy");

    const byMonth = new Map();
    rows.forEach((m) => {
      const key = monthKey(m.date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(m);
    });

    const groups = [...byMonth.entries()].map(([key, list]) => {
      const income = list.filter((m) => m.type === "income").reduce((s, m) => s + m.amount, 0);
      const expense = list.filter((m) => m.type === "expense").reduce((s, m) => s + m.amount, 0);
      return `
        <div class="section-head">
          <h2 class="section-title">${esc(formatMonthYear(`${key}-01`))}</h2>
          <span class="section-link num">
            <span class="pos">+${esc(money(income))}</span> · <span class="neg">−${esc(money(expense))}</span>
          </span>
        </div>
        <div class="list">${list.map(movementRow).join("")}</div>`;
    }).join("");

    return `
      ${backHeader("Historial", `${rows.length} movimiento${rows.length === 1 ? "" : "s"}`)}

      <div class="filters">
        ${FILTERS.map((f) => `<button class="filter ${f.id === filter ? "is-on" : ""}" data-filter="${f.id}">${esc(f.label)}</button>`).join("")}
      </div>

      ${rows.length ? groups : `<div class="card">${empty("Sin movimientos", "Aquí queda registrado cada ingreso y cada pago.", "history")}</div>`}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        filter = btn.dataset.filter;
        ctx.rerender();
      });
    });
  },
};
