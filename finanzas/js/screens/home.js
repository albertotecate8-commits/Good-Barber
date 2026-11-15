// Pantalla de INICIO, en limpio:
//   · Mi dinero = Afore y otros ingresos − gastos (Barbería y Uñas van aparte).
//   · Gastos del día.
//   · Deudas: cuánto se debe y botón para abonar.
//   · Pagos que vienen (si hay).
//   · Un renglón con Barbería y Uñas que lleva a su apartado.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, moneyShort, esc, round2 } from "../format.js";
import { todayISO, formatLong, addDays, relativeLabel } from "../dates.js";
import { icon } from "../ui.js";

/** Día que muestra la tarjeta "Gastos del día" (0 = hoy, -1 = ayer…). */
let expenseDayOffset = 0;

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function banner() {
  const available = Store.availableMoney();
  const profile = Store.currentProfile();
  const name = profile && profile.name ? `, ${profile.name}` : "";
  const qa = (action, glyph, label, primary) => `
    <button class="qa${primary ? " is-primary" : ""}" data-action="${action}">
      <span class="ic">${icon(glyph, 21, 2.4)}</span>
      <span class="lbl">${label}</span>
    </button>`;

  return `
    <section class="banner">
      <div class="banner-hi">${esc(greeting() + name)}</div>
      <div class="banner-sub">${esc(formatLong(todayISO()))}</div>
      <button class="hero-tap" data-action="show-breakdown" aria-label="Ver de dónde sale tu dinero">
        <div class="banner-amount num${available < 0 ? " is-neg" : ""}">${esc(money(available))}</div>
        <div class="banner-sub">Mi dinero · Afore e ingresos menos gastos ${icon("info", 12, 2.2)}</div>
      </button>
      <div class="banner-actions is-3">
        ${qa("quick-expense", "minus", "Gasto", true)}
        ${qa("quick-income", "plus", "Ingreso", false)}
        ${qa("quick-pay", "check", "Pago", false)}
      </div>
    </section>`;
}

/** Lo que se gastó en un día (de tu dinero), con flechas para ver días anteriores. */
function dailyExpensesCard() {
  const day = addDays(todayISO(), expenseDayOffset);
  const list = Finance.movementsBetween(day, day).filter((m) => m.type === "expense" && !Store.isOutsideAvailable(m));
  const total = round2(list.reduce((s, m) => s + m.amount, 0));
  const label = expenseDayOffset === 0 ? "Hoy" : expenseDayOffset === -1 ? "Ayer" : relativeLabel(day);

  const rows = list.map((m) => {
    const name = Store.profileName(m.createdBy);
    const who = name && name !== "Alguien" ? name : "";
    return `
      <button class="pay-item day-exp" data-action="open-movement" data-id="${esc(m.id)}">
        <div class="grow">
          <div class="t">${esc(m.concept)}</div>
          ${who ? `<div class="s">Anotó ${esc(who)}</div>` : ""}
        </div>
        <span class="a num">-${esc(money(m.amount))}</span>
      </button>`;
  }).join("");

  return `
    <section class="card day-card">
      <div class="between">
        <h2 class="panel-title">Gastos del día</h2>
        <div class="day-nav">
          <button class="day-arrow" data-day-step="-1" aria-label="Día anterior">${icon("back", 16, 2.4)}</button>
          <span class="day-label">${esc(label)}</span>
          <button class="day-arrow" data-day-step="1" aria-label="Día siguiente"${expenseDayOffset >= 0 ? " disabled" : ""}>${icon("chevron", 16, 2.4)}</button>
        </div>
      </div>
      <div class="day-total num">${esc(money(total))}</div>
      ${list.length
        ? `<div class="pay-list">${rows}</div>`
        : `<p class="tiny muted">Sin gastos ${expenseDayOffset === 0 ? "hoy" : "este día"}.</p>`}
    </section>`;
}

/** Deudas: total y cada una con lo que falta y su botón para abonar. */
function debtsCard() {
  const active = Finance.debtList().filter((d) => !d.done);
  const total = round2(active.reduce((s, d) => s + d.remaining, 0));

  const rows = active.slice(0, 4).map((d) => {
    const pct = Math.round(d.progress * 100);
    const action = d.item.kind === "heavy"
      ? `data-action="pay-heavy" data-id="${esc(d.item.id)}"`
      : d.next ? `data-action="pay" data-occ="${esc(d.next.id)}"` : `data-action="pay-item" data-id="${esc(d.item.id)}"`;
    return `
      <div class="pay-item">
        <button class="grow pay-open" data-action="nav" data-to="#/deudas">
          <div class="t">${esc(d.item.name)}</div>
          <div class="track mt-8"><i class="lime" style="width:${pct}%"></i></div>
          <div class="s">Abonado ${esc(moneyShort(d.paid))} · ${pct}%</div>
        </button>
        <span class="a num">${esc(money(d.remaining))}</span>
        <button class="round-btn" ${action} aria-label="Abonar a ${esc(d.item.name)}">${icon("check", 17, 2.6)}</button>
      </div>`;
  }).join("");

  return `
    <section class="card">
      <div class="between">
        <h2 class="panel-title">Deudas</h2>
        <button class="section-link" data-action="nav" data-to="#/deudas">${active.length ? `Debes ${esc(money(total))}` : "Ver"}</button>
      </div>
      ${active.length
        ? `<div class="pay-list">${rows}</div>`
        : `<p class="tiny muted mt-8">Sin deudas. ${icon("check", 13, 2.4)}</p>`}
    </section>`;
}

/** Pagos fijos que vienen (de tu dinero). Los del local van en Barbería y Uñas. */
function paymentsCard() {
  const today = todayISO();
  const mine = (o) => o.category !== "local" && o.kind !== "debt";
  const list = [...Finance.overduePayments(), ...Finance.pendingPayments({ from: addDays(today, 1), until: addDays(today, 14) })]
    .filter(mine)
    .slice(0, 3);
  if (!list.length) return "";

  const rows = list.map((o) => {
    const late = o.dueDate <= today;
    return `
      <div class="pay-item${late ? " is-late" : ""}">
        <button class="grow pay-open" data-action="open-item" data-id="${esc(o.itemId)}" data-occ="${esc(o.id)}">
          <div class="t">${esc(o.name)}</div>
          <div class="s">${esc(late && o.dueDate < today ? "Vencido · " : "")}${esc(relativeLabel(o.dueDate))}</div>
        </button>
        <span class="a num">${esc(money(o.amount))}</span>
        <button class="round-btn" data-action="pay" data-occ="${esc(o.id)}" aria-label="Pagar ${esc(o.name)}">${icon("check", 17, 2.6)}</button>
      </div>`;
  }).join("");

  return `
    <section class="card">
      <h2 class="panel-title">Pagos que vienen</h2>
      <div class="pay-list">${rows}</div>
    </section>`;
}

/** Un renglón con lo de Barbería y Uñas de la semana; lleva a su apartado. */
function partnerLink() {
  const w = Finance.partnerWeek(todayISO());
  return `
    <button class="card partner-link" data-action="nav" data-to="#/negocios">
      <span class="tile-ic">${icon("wallet", 18)}</span>
      <span class="grow">
        <span class="t">Barbería y Uñas</span>
        <span class="s num">Esta semana: Tú ${esc(moneyShort(w.mine))} · ${esc(Store.partnerName())} ${esc(moneyShort(w.theirs))}</span>
      </span>
      ${icon("chevron", 18, 2.2)}
    </button>`;
}

export default {
  render() {
    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Inicio</b></div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      ${banner()}
      <div class="panel-grid">
        ${dailyExpensesCard()}
        ${debtsCard()}
        ${paymentsCard()}
        ${partnerLink()}
      </div>`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-day-step]").forEach((btn) => {
      btn.addEventListener("click", () => {
        expenseDayOffset = Math.min(0, expenseDayOffset + Number(btn.dataset.dayStep));
        ctx.rerender();
      });
    });
  },
};
