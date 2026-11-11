// Pantalla de INICIO: un tablero corto — saludo con el dinero disponible y
// los botones de entrada, cuatro fichas (Barbería, Uñas, tu parte, apartar
// para el local), la semana en barras, de dónde entró el dinero, los pagos
// que se vienen y el Afore.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, PARTNER_SHARE, LOCAL_WEEKLY_RESERVE } from "../model.js";
import { money, moneyShort, esc, round2 } from "../format.js";
import { todayISO, formatLong, formatCutRange, addDays, parseISO, relativeLabel, startOfMonth, endOfMonth } from "../dates.js";
import { icon } from "../ui.js";
import { donutChart } from "../components.js";
import { splitTotal } from "../forms.js";

const SHARED_BUSINESSES = Object.keys(PARTNER_SHARE);
const DAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];

/** Saludo según la hora del día. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function businessName(id) {
  const b = Store.getBusiness(id);
  return b ? b.name : id;
}

function businessColor(id) {
  const b = Store.getBusiness(id);
  return (b && b.color) || "#3d8b98";
}

function banner() {
  const available = Store.availableMoney();
  const profile = Store.currentProfile();
  const name = profile && profile.name ? `, ${profile.name}` : "";

  return `
    <section class="banner">
      <div class="banner-hi">${esc(greeting() + name)}</div>
      <div class="banner-sub">${esc(formatLong(todayISO()))}</div>
      <button class="hero-tap" data-action="show-breakdown" aria-label="Ver de dónde sale el dinero disponible">
        <div class="banner-amount num${available < 0 ? " is-neg" : ""}">${esc(money(available))}</div>
        <div class="banner-sub">Dinero disponible ${icon("info", 12, 2.2)}</div>
      </button>
      <div class="banner-actions">
        ${SHARED_BUSINESSES.map((id) => `
          <button class="qa is-primary" data-action="entrada" data-business="${esc(id)}">
            <span class="ic">${icon("plus", 21, 2.4)}</span>
            <span class="lbl">${esc(businessName(id))}</span>
          </button>`).join("")}
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

/** Cuatro fichas: lo que entró esta semana por negocio, tu parte y lo del local. */
function tiles(range) {
  let mine = 0;
  const tones = ["is-mint", ""];

  const business = SHARED_BUSINESSES.map((id, i) => {
    const total = Finance.businessSummary(id, range.start, range.end).income;
    const split = splitTotal(id, total) || { mine: 0, theirs: 0 };
    mine += split.mine;
    return `
      <button class="tile ${tones[i % tones.length]}" data-action="entrada" data-business="${esc(id)}">
        <div class="tile-ic">${icon("plus", 18, 2.4)}</div>
        <div class="k">${esc(businessName(id))}</div>
        <div class="v num">${esc(money(total))}</div>
        <div class="d num">Tú ${esc(moneyShort(split.mine))} · Socia ${esc(moneyShort(split.theirs))}</div>
      </button>`;
  }).join("");

  return `
    <section class="tiles">
      ${business}
      <div class="tile is-ice">
        <div class="tile-ic">${icon("wallet", 18)}</div>
        <div class="k">Tu parte</div>
        <div class="v num">${esc(money(round2(mine)))}</div>
        <div class="d">Esta semana</div>
      </div>
      <div class="tile is-lav">
        <div class="tile-ic">${icon("home", 18)}</div>
        <div class="k">Apartar local</div>
        <div class="v num">${esc(money(LOCAL_WEEKLY_RESERVE))}</div>
        <div class="d">Cada semana</div>
      </div>
    </section>`;
}

/** Entradas de cada día de la semana, una barra por negocio. */
function weekChart(range) {
  const today = todayISO();
  const days = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    const values = SHARED_BUSINESSES.map((id) =>
      Finance.movementsBetween(d, d, id).reduce((s, m) => s + (m.type === "income" ? m.amount : 0), 0));
    days.push({ date: d, values });
  }
  const max = Math.max(1, ...days.flatMap((d) => d.values));

  const bars = days.map((d) => `
    <div class="g${d.date === today ? " is-today" : ""}">
      <div class="pair">
        ${d.values.map((v, i) => `<i style="height:${Math.round((v / max) * 100)}%;background:${esc(businessColor(SHARED_BUSINESSES[i]))}" title="${esc(money(v))}"></i>`).join("")}
      </div>
      <span class="cap">${DAY_LETTER[parseISO(d.date).getDay()]}</span>
    </div>`).join("");

  const legend = SHARED_BUSINESSES.map((id) => `
    <div class="cl"><i style="background:${esc(businessColor(id))}"></i><span class="n">${esc(businessName(id))}</span></div>`).join("");

  return `
    <section class="card">
      <div class="between">
        <h2 class="panel-title">Entradas de la semana</h2>
        <span class="tiny muted">${esc(formatCutRange(range.start, range.end))}</span>
      </div>
      <div class="week-bars">${bars}</div>
      <div class="cat-legend week-legend">${legend}</div>
    </section>`;
}

/** De qué negocio entró el dinero este mes. */
function monthDonut() {
  const today = todayISO();
  const rows = Store.businesses()
    .filter((b) => b.active !== false)
    .map((b) => ({ name: b.name, color: b.color, amount: Finance.businessSummary(b.id, startOfMonth(today), endOfMonth(today)).income }))
    .filter((r) => r.amount > 0);
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));

  return `
    <section class="card">
      <h2 class="panel-title">Entradas del mes</h2>
      <div class="mt-14">
        ${total
          ? donutChart(rows, total, "Total")
          : `<p class="tiny muted">Todavía no hay entradas este mes. Registra la primera con los botones de arriba.</p>`}
      </div>
    </section>`;
}

/** Vencidos primero y luego lo que viene; cada uno con su botón para pagarlo. */
function paymentsCard() {
  const today = todayISO();
  const overdue = Finance.overduePayments();
  const upcoming = Finance.pendingPayments({ from: addDays(today, 1) });
  const list = [...overdue, ...upcoming].slice(0, 5);

  const rows = list.map((o) => {
    const late = o.dueDate <= today;
    return `
      <div class="pay-item${late ? " is-late" : ""}">
        <button class="grow pay-open" data-action="open-item" data-id="${esc(o.itemId)}" data-occ="${esc(o.id)}">
          <div class="t">${esc(o.name)} <span class="muted">· ${esc(Store.categoryName(o.category))}</span></div>
          <div class="s">${esc(late && o.dueDate < today ? "Vencido · " : "")}${esc(relativeLabel(o.dueDate))}</div>
        </button>
        <span class="a num">${esc(money(o.amount))}</span>
        <button class="round-btn" data-action="pay" data-occ="${esc(o.id)}" aria-label="Pagar ${esc(o.name)}">${icon("check", 17, 2.6)}</button>
      </div>`;
  }).join("");

  return `
    <section class="card">
      <div class="between">
        <h2 class="panel-title">Próximos pagos</h2>
        <button class="section-link" data-action="nav" data-to="#/calendario">Calendario</button>
      </div>
      ${list.length
        ? `<div class="pay-list">${rows}</div>`
        : `<p class="tiny muted mt-8">Nada pendiente por ahora.</p>`}
    </section>`;
}

/** Lo que se espera recibir del Afore (se escribe a mano). */
function aforeCard() {
  const item = Store.items().find((i) => i.active && i.kind === KIND.INCOME && i.businessId === "afores");
  const hasAmount = item && item.amount > 0;
  const id = esc(item ? item.id : "");

  return `
    <section class="card card-dark">
      <h2 class="panel-title">Afore</h2>
      ${hasAmount
        ? `<div class="banner-amount num">+${esc(money(item.amount))}</div>
           <p class="banner-sub">Por recibir · no cuenta como disponible hasta que llegue.</p>
           <div class="btn-row mt-14">
             <button class="btn btn-outline btn-sm" data-action="afore-edit" data-id="${id}">Cambiar</button>
             <button class="btn btn-lime btn-sm" data-action="receive-item" data-id="${id}">Ya lo recibí</button>
           </div>`
        : `<div class="cta">
             <p class="banner-sub grow">Escribe cuánto vas a recibir para tenerlo a la vista.</p>
             <button class="btn btn-lime btn-sm" data-action="afore-edit" data-id="${id}">Escribir monto</button>
           </div>`}
    </section>`;
}

export default {
  render() {
    const range = Finance.weekRangeFor(todayISO());
    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Inicio</b></div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      ${banner()}
      ${tiles(range)}
      <div class="panel-grid">
        ${weekChart(range)}
        ${monthDonut()}
        ${paymentsCard()}
        ${aforeCard()}
      </div>`;
  },

  mount() {},
};
