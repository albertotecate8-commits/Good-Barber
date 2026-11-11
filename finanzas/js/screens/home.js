// Pantalla de INICIO: lo de todos los días, rápido — entradas de Barbería y
// Uñas (con lo que le toca a cada quien), el Afore por recibir, lo que hay
// que apartar para el local y los pagos que se vienen.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, PARTNER_SHARE, LOCAL_WEEKLY_RESERVE } from "../model.js";
import { money, esc, round2 } from "../format.js";
import { todayISO, formatLong, formatShort, formatCutRange } from "../dates.js";
import { icon, empty } from "../ui.js";
import { occurrenceRow } from "../components.js";
import { splitTotal } from "../forms.js";

const SHARED_BUSINESSES = Object.keys(PARTNER_SHARE);

/** Saludo según la hora del día. */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "buenos días";
  if (hour < 19) return "buenas tardes";
  return "buenas noches";
}

function heroCard() {
  const available = Store.availableMoney();
  const entry = (id, label) => `
    <button class="qa is-primary" data-action="entrada" data-business="${esc(id)}">
      <span class="ic">${icon("plus", 21, 2.4)}</span>
      <span class="lbl">${esc(label)}</span>
    </button>`;

  return `
    <section class="hero">
      <button class="hero-tap" data-action="show-breakdown" aria-label="Ver de dónde sale el dinero disponible">
        <div class="hero-label">Dinero disponible ${icon("info", 13, 2.2)}</div>
        <div class="hero-amount num${available < 0 ? " is-neg" : ""}">${esc(money(available))}</div>
        <div class="hero-note">Lo que entró menos lo que se pagó · toca para ver el detalle</div>
      </button>

      <div class="hero-actions is-4">
        ${SHARED_BUSINESSES.map((id) => {
          const b = Store.getBusiness(id);
          return entry(id, b ? b.name : id);
        }).join("")}
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

/** Entradas de la semana (sábado a viernes) y cómo se dividen con la socia. */
function entriesCard() {
  const range = Finance.weekRangeFor(todayISO());
  let mineTotal = 0;

  const rows = SHARED_BUSINESSES.map((id) => {
    const b = Store.getBusiness(id);
    const total = Finance.businessSummary(id, range.start, range.end).income;
    const split = splitTotal(id, total) || { mine: 0, theirs: 0 };
    mineTotal += split.mine;
    return `
      <div class="entry-row">
        <div class="grow">
          <div class="name">${esc(b ? b.name : id)}</div>
          <div class="total num">${esc(money(total))}</div>
          <div class="split num">Tú ${esc(money(split.mine))} · Tu socia ${esc(money(split.theirs))}</div>
        </div>
        <button class="btn btn-lime btn-sm" data-action="entrada" data-business="${esc(id)}">${icon("plus", 15, 2.4)} Entrada</button>
      </div>`;
  }).join("");

  return `
    <section class="stack-card mt-14">
      <div class="top">
        <span>Entradas de la semana</span>
        <span class="date">${esc(formatCutRange(range.start, range.end))}</span>
      </div>
      <div class="body">
        ${rows}
        <div class="entry-row">
          <span class="name">Tu parte de la semana</span>
          <span class="total num" style="color:var(--lime)">${esc(money(round2(mineTotal)))}</span>
        </div>
      </div>
    </section>`;
}

/** Lo que se espera recibir del Afore (se escribe a mano). */
function aforeCard() {
  const item = Store.items().find((i) => i.active && i.kind === KIND.INCOME && i.businessId === "afores");
  const hasAmount = item && item.amount > 0;

  return `
    <div class="section-head">
      <h2 class="section-title">Afore</h2>
    </div>
    <div class="card">
      ${hasAmount
        ? `<div class="kv"><span class="k">Por recibir</span><span class="v num pos">+${esc(money(item.amount))}</span></div>
           ${item.statusNote ? `<p class="tiny muted mt-8">${esc(item.statusNote)}</p>` : ""}
           <p class="tiny muted mt-8">No cuenta como disponible hasta que lo recibas.</p>
           <div class="btn-row mt-14">
             <button class="btn btn-outline btn-sm" data-action="afore-edit" data-id="${esc(item.id)}">Cambiar monto</button>
             <button class="btn btn-lime btn-sm" data-action="receive-item" data-id="${esc(item.id)}">Ya lo recibí</button>
           </div>`
        : `<p class="tiny muted">Escribe cuánto vas a recibir del Afore para tenerlo a la vista.</p>
           <div class="btn-row mt-14">
             <button class="btn btn-ink btn-sm" data-action="afore-edit" data-id="${esc(item ? item.id : "")}">Escribir monto</button>
           </div>`}
    </div>`;
}

/** Cuánto apartar para el local y cuál es su siguiente pago. */
function localCard() {
  const next = Store.occurrences()
    .filter((o) => o.status === "pending" && o.category === "local")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

  return `
    <div class="section-head">
      <h2 class="section-title">Local</h2>
    </div>
    <div class="card">
      <div class="kv"><span class="k">Aparta esta semana</span><span class="v num">${esc(money(LOCAL_WEEKLY_RESERVE))}</span></div>
      ${next
        ? `<div class="kv"><span class="k">Siguiente pago: ${esc(next.name)} · ${esc(formatShort(next.dueDate))}</span><span class="v num">${esc(money(next.amount))}</span></div>`
        : ""}
      <p class="tiny muted mt-8">Con eso cubres renta, luz, agua e internet del local.</p>
    </div>`;
}

/** Vencidos: su fecha ya llegó y siguen sin pagarse. Nunca se mezclan con los próximos. */
function overdueSection() {
  const list = Finance.overduePayments();
  if (!list.length) return "";
  const total = round2(list.reduce((s, o) => s + o.amount, 0));

  return `
    <div class="section-head">
      <h2 class="section-title" style="color:var(--danger)">Vencidos</h2>
      <span class="section-link num" style="color:var(--danger)">${esc(money(total))}</span>
    </div>
    <div class="list">${list.slice(0, 6).map((o) => occurrenceRow(o, { showRelative: true })).join("")}</div>`;
}

/** Pagos que vencen en los próximos 7 días (desde mañana). */
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
      ${entriesCard()}
      ${aforeCard()}
      ${localCard()}
      ${overdueSection()}
      ${next7DaysSection()}`;
  },

  mount() {},
};
