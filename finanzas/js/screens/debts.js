// Pantalla DEUDAS: pagos periódicos de deuda + deudas fuertes.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, STATUS } from "../model.js";
import { money, esc } from "../format.js";
import { todayISO, formatMedium, relativeLabel } from "../dates.js";
import { icon, empty } from "../ui.js";
import { heavyCard } from "../components.js";

/** Tarjeta de deuda periódica con su próximo pago y botón de pago directo. */
function debtCard(item) {
  const next = Store.occurrencesOf(item.id)
    .filter((o) => o.status === STATUS.PENDING)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

  const overdue = next && next.dueDate < todayISO();

  return `
    <div class="row has-actions" style="cursor:default">
      <span class="row-ico c-deudas">${icon("debt", 18)}</span>
      <button class="row-body" data-action="open-item" data-id="${esc(item.id)}" style="text-align:left">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">
          ${next
            ? `<span class="chip ${overdue ? "overdue" : "pending"}">${overdue ? "Vencido" : "Próximo pago"}</span>
               <span class="nowrap">${esc(formatMedium(next.dueDate))}${item.variable ? " · variable" : ""}</span>`
            : `<span class="chip neutral">Sin programar</span>`}
        </span>
      </button>
      <span class="row-end">
        <span class="row-amount num">${esc(money(next ? next.amount : item.amount))}</span>
        <span class="row-meta">${next ? "próximo pago" : "monto"}</span>
      </span>
      <span class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="open-item" data-id="${esc(item.id)}">Detalle</button>
        ${next
          ? `<button class="btn btn-ink btn-sm" data-action="pay" data-occ="${esc(next.id)}">Pagar</button>`
          : `<button class="btn btn-ink btn-sm" data-action="pay-item" data-id="${esc(item.id)}">Pagar</button>`}
      </span>
    </div>`;
}

export default {
  render() {
    const debts = Store.items()
      .filter((i) => i.active && i.kind === KIND.DEBT)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const heavy = Store.items()
      .filter((i) => i.active && i.kind === KIND.HEAVY)
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const monthlyTotal = debts.reduce((sum, item) => {
      const next = Store.occurrencesOf(item.id)
        .filter((o) => o.status === STATUS.PENDING)
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
      return sum + (next ? next.amount : item.amount);
    }, 0);

    const heavyTotal = heavy.reduce((sum, i) => sum + (i.balance || 0), 0);

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Deudas</b></div>
          <div class="head-sub">${debts.length} periódicas · ${heavy.length} fuertes</div>
        </div>
        <button class="icon-btn is-lime" data-action="new-debt" aria-label="Nueva deuda">${icon("plus", 20, 2.4)}</button>
      </header>

      <section class="card-dark">
        <div class="hero-label" style="text-align:left">Deuda fuerte pendiente</div>
        <div class="hero-amount num" style="text-align:left;font-size:32px">${esc(money(heavyTotal))}</div>
        <div class="mini-grid mt-14">
          <div class="mini">
            <div class="k">Pagos del periodo</div>
            <div class="v warn num">${esc(money(monthlyTotal))}</div>
          </div>
          <div class="mini">
            <div class="k">Deudas activas</div>
            <div class="v num">${debts.length + heavy.length}</div>
          </div>
          <div class="mini">
            <div class="k">Disponible</div>
            <div class="v lime num">${esc(money(Store.availableMoney()))}</div>
          </div>
        </div>
      </section>

      <div class="section-head">
        <h2 class="section-title">Pagos periódicos</h2>
        <span class="section-link num">${esc(money(monthlyTotal))}</span>
      </div>
      ${debts.length
        ? `<div class="list">${debts.map(debtCard).join("")}</div>`
        : `<div class="card">${empty("Sin deudas periódicas", "Agrega una con el botón +.", "debt")}</div>`}

      <div class="section-head">
        <h2 class="section-title">Deudas fuertes</h2>
        <button class="section-link" data-action="new-heavy">Agregar ${icon("plus", 13, 2.4)}</button>
      </div>
      <p class="tiny muted" style="margin:-4px 2px 10px">
        No generan pagos mensuales automáticos: son saldos que se abonan cuando se puede.
      </p>
      ${heavy.length
        ? `<div class="list">${heavy.map(heavyCard).join("")}</div>`
        : `<div class="card">${empty("Sin deudas fuertes", "", "alert")}</div>`}`;
  },

  mount() {},
};
