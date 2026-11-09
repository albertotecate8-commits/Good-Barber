// Pantalla NEGOCIOS: una tarjeta por negocio (Barbería, Uñas, Afores) con su
// ingreso/gasto/ganancia del mes. Tocar una tarjeta abre su detalle.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { todayISO, formatMonthYear, startOfMonth, endOfMonth } from "../dates.js";
import { icon, empty } from "../ui.js";

function businessCard(b) {
  const today = todayISO();
  const s = Finance.businessSummary(b.id, startOfMonth(today), endOfMonth(today));
  const neg = s.net < 0;

  return `
    <button class="stack-card" data-action="nav" data-to="#/negocio/${esc(b.id)}" style="width:100%;text-align:left;display:block">
      <div class="top">
        <span class="flex" style="gap:8px;align-items:center">
          <i style="width:10px;height:10px;border-radius:50%;background:${esc(b.color)};display:inline-block"></i>
          ${esc(b.name)}
        </span>
        <span class="date">${esc(formatMonthYear(today))}</span>
      </div>
      <div class="body">
        <div class="mini-grid">
          <div class="mini">
            <div class="k">Ingresos</div>
            <div class="v lime num">${esc(money(s.income))}</div>
          </div>
          <div class="mini">
            <div class="k">Gastos</div>
            <div class="v num">${esc(money(s.paid))}</div>
          </div>
          <div class="mini">
            <div class="k">Ganancia</div>
            <div class="v num ${neg ? "neg" : "pos"}">${esc(money(s.net))}</div>
          </div>
        </div>
        ${s.pending || s.expectedIncome ? `
          <div class="mt-8 flex" style="justify-content:space-between;gap:10px">
            ${s.expectedIncome ? `<span class="tiny muted">Por recibir: ${esc(money(s.expectedIncome))}</span>` : "<span></span>"}
            ${s.pending ? `<span class="tiny muted">Pendiente: ${esc(money(s.pending))}</span>` : ""}
          </div>` : ""}
      </div>
    </button>`;
}

export default {
  render() {
    const list = Store.businesses().filter((b) => b.active !== false);
    const today = todayISO();
    const all = Finance.allBusinessesSummary(startOfMonth(today), endOfMonth(today));

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Negocios</b></div>
          <div class="head-sub">${esc(formatMonthYear(today))}</div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      <section class="card-dark">
        <div class="hero-label" style="text-align:left">Ganancia combinada del mes</div>
        <div class="hero-amount num" style="text-align:left;font-size:30px">${esc(money(all.net))}</div>
        <div class="mini-grid mt-14">
          <div class="mini">
            <div class="k">Ingresos (3 negocios)</div>
            <div class="v num">${esc(money(all.income))}</div>
          </div>
          <div class="mini">
            <div class="k">Gastos (3 negocios)</div>
            <div class="v num">${esc(money(all.paid))}</div>
          </div>
        </div>
      </section>

      <div class="section-head mt-14">
        <h2 class="section-title">Cada negocio</h2>
      </div>
      ${list.length
        ? `<div class="stack" style="gap:12px">${list.map(businessCard).join("")}</div>`
        : `<div class="card">${empty("Sin negocios configurados", "", "wallet")}</div>`}`;
  },

  mount() {},
};
