// Pantalla de INICIO: la situación financiera completa de un vistazo.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND } from "../model.js";
import { money, esc, round2 } from "../format.js";
import { todayISO, formatLong, formatShort, formatMonthYear, startOfMonth, endOfMonth, addMonths } from "../dates.js";
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
  const hasInitial = Store.initialBalance() !== 0;

  return `
    <section class="hero">
      <button class="hero-tap" data-action="show-breakdown" aria-label="Ver de dónde sale el dinero disponible">
        <div class="hero-label">Dinero disponible ${icon("info", 13, 2.2)}</div>
        <div class="hero-amount num${negative ? " is-neg" : ""}">${esc(money(available))}</div>
        <div class="hero-note">${hasInitial ? "Saldo inicial + ingresos recibidos − gastos pagados" : "Ingresos recibidos menos gastos pagados"} · toca para ver el detalle</div>
      </button>

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
  const snap = Finance.pendingSnapshot();
  const available = Store.availableMoney();
  const expectedIncome = round2(
    Finance.pendingIncomes({ from: startOfMonth(today), until: endOfMonth(today) })
      .reduce((s, o) => s + o.amount, 0)
  );

  return `
    <section class="stack-card mt-14">
      <div class="top">
        <span>Resumen del mes</span>
        <span class="date">${esc(formatMonthYear(today))}</span>
      </div>
      <div class="body">
        <div class="mini-grid">
          <div class="mini">
            <div class="k">Ingresos recibidos (mes)</div>
            <div class="v lime num">${esc(money(summary.income))}</div>
          </div>
          <div class="mini">
            <div class="k">Gastos pagados (mes)</div>
            <div class="v num">${esc(money(summary.paid))}</div>
          </div>
          <div class="mini">
            <div class="k">Vencido</div>
            <div class="v num" style="${snap.overdueTotal ? "color:#ff9096" : ""}">${esc(money(snap.overdueTotal))}</div>
          </div>
        </div>
        <div class="mini-grid mt-14">
          <div class="mini">
            <div class="k">Próximos pagos</div>
            <div class="v warn num">${esc(money(snap.upcomingTotal))}</div>
          </div>
          <div class="mini">
            <div class="k">Ingresos por recibir</div>
            <div class="v num">${esc(money(expectedIncome))}</div>
          </div>
          <div class="mini">
            <div class="k">Dinero disponible</div>
            <div class="v num">${esc(money(available))}</div>
          </div>
        </div>
      </div>
    </section>`;
}

/**
 * Próximos 7 días: ingresos esperados y pagos próximos son cifras del MISMO
 * periodo (mañana → +7 días), nunca se mezclan con el dinero disponible
 * actual. "Diferencia" es un escenario hipotético, no dinero que ya se tenga.
 */
function next7DaysCard() {
  const week = Finance.next7Days();
  const diff = round2(week.expected - week.needed);
  const scenarioA = week.available >= week.needed;
  const scenarioB = round2(week.available + week.expected - week.needed);

  return `
    <section class="stack-card mt-14">
      <div class="top">
        <span>Próximos 7 días</span>
        <span class="date">${esc(formatShort(week.from))} → ${esc(formatShort(week.until))}</span>
      </div>
      <div class="body">
        <div class="mini-grid">
          <div class="mini">
            <div class="k">Ingresos esperados</div>
            <div class="v lime num">${esc(money(week.expected))}</div>
          </div>
          <div class="mini">
            <div class="k">Pagos próximos</div>
            <div class="v warn num">${esc(money(week.needed))}</div>
          </div>
          <div class="mini">
            <div class="k">Diferencia</div>
            <div class="v num ${diff >= 0 ? "pos" : "neg"}">${diff >= 0 ? "+" : "−"}${esc(money(Math.abs(diff)))}</div>
          </div>
        </div>
        <p class="tiny muted mt-14">
          Si recibes todos los ingresos esperados de este periodo y cubres los pagos del mismo periodo,
          quedarían ${diff >= 0 ? "+" : "−"}${esc(money(Math.abs(diff)))}. Esto NO es tu dinero disponible actual.
        </p>

        <button class="stat-card mt-14" data-action="nav" data-to="#/gastos" style="text-align:left;width:100%">
          <div class="k">¿Alcanza para cubrir los próximos pagos?</div>
          <div class="mt-8" style="display:flex;flex-direction:column;gap:6px">
            <div class="flex" style="justify-content:space-between;align-items:baseline">
              <span class="tiny muted">A. Solo con lo disponible ahora</span>
              <span class="tiny strong ${scenarioA ? "pos" : "neg"}">${scenarioA ? "Sí alcanza" : "No alcanza"}</span>
            </div>
            <div class="flex" style="justify-content:space-between;align-items:baseline">
              <span class="tiny muted">B. Si recibo los ingresos esperados</span>
              <span class="tiny strong num">${esc(money(scenarioB))} ${scenarioB >= 0 ? "disponibles" : "en contra"}</span>
            </div>
          </div>
        </button>
      </div>
    </section>`;
}

/** 🔴 Vencidos: su fecha ya llegó y siguen sin pagarse. Nunca se mezclan con los próximos. */
function overdueSection() {
  const list = Finance.overduePayments();
  if (!list.length) return "";
  const total = round2(list.reduce((s, o) => s + o.amount, 0));

  return `
    <div class="section-head">
      <h2 class="section-title" style="color:var(--danger)">Vencidos</h2>
      <span class="section-link num" style="color:var(--danger)">${esc(money(total))}</span>
    </div>
    <div class="list">${list.slice(0, 6).map((o) => occurrenceRow(o, { showRelative: true })).join("")}</div>
    ${list.length > 6 ? `<button class="section-link" data-action="nav" data-to="#/gastos" style="display:block;margin:10px 2px 0">Ver todos ${icon("chevron", 13, 2.4)}</button>` : ""}`;
}

/** 🟠 Pagos que vencen en los próximos 7 días (desde mañana): nunca incluye lo vencido. */
function next7DaysSection() {
  const week = Finance.next7Days();

  return `
    <div class="section-head">
      <h2 class="section-title">Próximos pagos</h2>
      <span class="section-link num">${esc(money(week.needed))}</span>
    </div>
    ${week.list.length
      ? `<div class="list">${week.list.map((o) => occurrenceRow(o, { showRelative: true })).join("")}</div>`
      : `<div class="card">${empty("Nada en los próximos 7 días", "Todo al corriente por ahora.", "check")}</div>`}`;
}

function expectedIncomeSection() {
  const today = todayISO();
  const list = Finance.pendingIncomes({ until: endOfMonth(today) }).slice(0, 4);
  const noDate = Store.items().filter(
    (i) => i.active && i.kind === KIND.INCOME && !i.startDate && !i.cutBased
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
        <div class="kv"><span class="k">Ingresos del periodo</span><span class="v num pos">${esc(money(range.income))}</span></div>
        <div class="kv"><span class="k">Gastos pagados del periodo</span><span class="v num">${esc(money(range.paid))}</span></div>
        <div class="kv"><span class="k">Pendiente del periodo</span><span class="v num">${esc(money(range.pending))}</span></div>
        <div class="kv"><span class="k">Disponible ahora (total)</span><span class="v num">${esc(money(available))}</span></div>
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
      ${next7DaysCard()}

      <div class="search" data-action="nav" data-to="#/buscar" role="button" tabindex="0">
        <span class="mag">${icon("search", 16, 2.2)}</span>
        <input type="text" placeholder="Buscar Mercado Libre, Vexi, Netflix…" readonly>
      </div>

      ${overdueSection()}
      ${next7DaysSection()}
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
