// Pantalla de INICIO: la situación financiera completa de un vistazo.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND } from "../model.js";
import { money, moneyShort, esc } from "../format.js";
import { todayISO, formatLong, formatMonthYear, startOfMonth, endOfMonth, addMonths } from "../dates.js";
import { icon, empty } from "../ui.js";
import { occurrenceRow, barsChart, donutChart } from "../components.js";

let period = "month"; // week | month | quarter

const PERIODS = [
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "quarter", label: "3 meses" },
];

/** Saludo según la hora del día. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "buenos días";
  if (hour < 19) return "buenas tardes";
  return "buenas noches";
}

function heroCard() {
  const available = Store.availableMoney();
  const negative = available < 0;

  return `
    <section class="hero">
      <div class="hero-label">Dinero disponible</div>
      <div class="hero-amount num${negative ? " is-neg" : ""}">${esc(money(available))}</div>
      <div class="hero-note">Ingresos recibidos menos gastos pagados</div>

      <div class="hero-actions">
        <button class="qa is-primary" data-action="quick-income">
          <span class="ic">${icon("plus", 21, 2.4)}</span>
          <span class="lbl">Ingreso</span>
        </button>
        <button class="qa" data-action="quick-expense">
          <span class="ic">${icon("minus", 21, 2.4)}</span>
          <span class="lbl">Gasto</span>
        </button>
        <button class="qa" data-action="quick-pay">
          <span class="ic">${icon("check", 21, 2.4)}</span>
          <span class="lbl">Pago</span>
        </button>
      </div>
    </section>`;
}

function monthCard() {
  const today = todayISO();
  const summary = Finance.monthSummary(today);
  const committed = Finance.committedThisMonth(today);

  return `
    <section class="stack-card mt-14">
      <div class="top">
        <span>Resumen del mes</span>
        <span class="date">${esc(formatMonthYear(today))}</span>
      </div>
      <div class="body">
        <div class="mini-grid">
          <div class="mini">
            <div class="k">Ingresos</div>
            <div class="v lime num">${esc(money(summary.income))}</div>
          </div>
          <div class="mini">
            <div class="k">Gastos pagados</div>
            <div class="v num">${esc(money(summary.paid))}</div>
          </div>
          <div class="mini">
            <div class="k">Pendiente</div>
            <div class="v warn num">${esc(money(committed.total))}</div>
          </div>
        </div>
      </div>
    </section>`;
}

function needCard() {
  const week = Finance.next7Days();

  return `
    <div class="pair mt-14">
      <div class="stat-card">
        <div class="k">Próximos 7 días</div>
        <div class="v num">${esc(money(week.needed))}</div>
        <div class="d"><span class="g">${week.list.length} pago${week.list.length === 1 ? "" : "s"} por cubrir</span></div>
      </div>
      <button class="stat-card" data-action="nav" data-to="#/gastos" style="text-align:left">
        <div class="k">¿Alcanza?</div>
        <div class="v sm ${week.isEnough ? "pos" : "neg"}">${week.isEnough ? "Sí alcanza" : "No alcanza"}</div>
        <div class="d">
          ${week.isEnough
            ? `<span class="pos">Te sobran ${esc(moneyShort(week.available - week.needed))}</span>`
            : `<span class="neg">Faltan ${esc(moneyShort(week.missing))}</span>`}
        </div>
      </button>
    </div>`;
}

function upcomingSection() {
  const list = Finance.upcomingPayments(6);
  const total = Finance.upcomingPayments().length;

  return `
    <div class="section-head">
      <h2 class="section-title">Próximos pagos</h2>
      ${total > 6 ? `<button class="section-link" data-action="nav" data-to="#/gastos">Ver todo ${icon("chevron", 13, 2.4)}</button>` : ""}
    </div>
    ${list.length
      ? `<div class="list">${list.map((o) => occurrenceRow(o, { showRelative: true })).join("")}</div>`
      : `<div class="card">${empty("Sin pagos pendientes", "Todo al corriente por ahora.", "check")}</div>`}`;
}

function expectedIncomeSection() {
  const today = todayISO();
  const list = Finance.pendingIncomes({ until: endOfMonth(today) }).slice(0, 4);
  const noDate = Store.items().filter(
    (i) => i.active && i.kind === KIND.INCOME && !i.startDate
  );

  if (!list.length && !noDate.length) return "";

  const extra = noDate.map((item) => `
    <button class="row" data-action="open-item" data-id="${esc(item.id)}">
      <span class="row-ico c-ingreso">${icon("income", 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub"><span class="chip pending">${esc(item.statusNote || "Sin fecha")}</span></span>
      </span>
      <span class="row-end"><span class="row-amount num pos">+${esc(money(item.amount))}</span></span>
    </button>`).join("");

  return `
    <div class="section-head">
      <h2 class="section-title">Ingresos esperados</h2>
      <button class="section-link" data-action="nav" data-to="#/ingresos">Ver todo ${icon("chevron", 13, 2.4)}</button>
    </div>
    <div class="list">${list.map((o) => occurrenceRow(o, { showRelative: true })).join("")}${extra}</div>`;
}

function summarySection() {
  const groups = Finance.series(period);
  const today = todayISO();
  let range;
  if (period === "week") range = Finance.weekSummary(today);
  else if (period === "quarter") range = Finance.summaryBetween(addMonths(today, -2, 1).slice(0, 8) + "01", endOfMonth(today));
  else range = Finance.monthSummary(today);

  const available = Store.availableMoney();

  return `
    <div class="section-head">
      <h2 class="section-title">Ingresos vs gastos</h2>
    </div>
    <div class="card">
      <div class="segment" data-period-group>
        ${PERIODS.map((p) => `<button data-period="${p.id}" class="${p.id === period ? "is-on" : ""}">${esc(p.label)}</button>`).join("")}
      </div>
      <div class="mt-14">${barsChart(groups)}</div>
      <div class="mt-14 stack" style="gap:0">
        <div class="kv"><span class="k">Ingresos</span><span class="v num pos">${esc(money(range.income))}</span></div>
        <div class="kv"><span class="k">Gastos pagados</span><span class="v num">${esc(money(range.paid))}</span></div>
        <div class="kv"><span class="k">Pendiente del periodo</span><span class="v num">${esc(money(range.pending))}</span></div>
        <div class="kv"><span class="k">Disponible ahora</span><span class="v num">${esc(money(available))}</span></div>
      </div>
    </div>`;
}

function categorySection() {
  const today = todayISO();
  const { rows, total } = Finance.categoryBreakdown(startOfMonth(today), endOfMonth(today));

  return `
    <div class="section-head">
      <h2 class="section-title">Gastos por categoría</h2>
      <button class="section-link" data-action="nav" data-to="#/mensual">Detalle ${icon("chevron", 13, 2.4)}</button>
    </div>
    <div class="card">${donutChart(rows, total, "Pagado")}</div>`;
}

export default {
  render() {
    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title">Hola, <b>${esc(greeting())}</b></div>
          <div class="head-sub">${esc(formatLong(todayISO()))}</div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/calendario" aria-label="Calendario">${icon("calendar", 18)}</button>
        <button class="icon-btn is-dark" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      ${heroCard()}
      ${monthCard()}
      ${needCard()}

      <div class="search" data-action="nav" data-to="#/buscar" role="button" tabindex="0">
        <span class="mag">${icon("search", 16, 2.2)}</span>
        <input type="text" placeholder="Buscar Mercado Libre, Vexi, Netflix…" readonly>
      </div>

      ${upcomingSection()}
      ${expectedIncomeSection()}
      ${summarySection()}
      ${categorySection()}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        period = btn.dataset.period;
        ctx.rerender();
      });
    });
  },
};
