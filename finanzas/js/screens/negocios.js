// Pantalla BARBERÍA Y UÑAS (pestaña Negocios), aparte de "Mi dinero":
//   · La semana (sábado a viernes): entradas, $1,100 del local descontados
//     solos y lo que queda a repartir entre los dos.
//   · El fondo del local: lo apartado, lo pagado y lo que queda, con los
//     pagos del local que vienen (se pagan de ese fondo).
//   · La gráfica de entradas de la semana.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { PARTNER_SHARE, LOCAL_WEEKLY_RESERVE } from "../model.js";
import { money, moneyShort, esc } from "../format.js";
import { todayISO, formatCutRange, addDays, parseISO, relativeLabel } from "../dates.js";
import { icon } from "../ui.js";

const SHARED = Object.keys(PARTNER_SHARE);
const DAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];

const nameOf = (id) => { const b = Store.getBusiness(id); return b ? b.name : id; };
const colorOf = (id) => { const b = Store.getBusiness(id); return (b && b.color) || "#3d8b98"; };

function weekCard(w) {
  const tones = ["is-mint", ""];
  return `
    <section class="tiles">
      ${SHARED.map((id, i) => `
        <button class="tile ${tones[i % tones.length]}" data-action="entrada" data-business="${esc(id)}">
          <div class="tile-ic">${icon("plus", 18, 2.4)}</div>
          <div class="k">${esc(nameOf(id))}</div>
          <div class="v num">${esc(money(w.byBusiness[id] || 0))}</div>
          <div class="d">Toca para anotar</div>
        </button>`).join("")}
      <div class="tile is-lav">
        <div class="tile-ic">${icon("home", 18)}</div>
        <div class="k">Local</div>
        <div class="v num">−${esc(money(w.local))}</div>
        <div class="d">${w.localMissing > 0 ? `Faltan ${esc(moneyShort(w.localMissing))} para ${esc(moneyShort(LOCAL_WEEKLY_RESERVE))}` : "Ya se apartó lo de la semana"}</div>
      </div>
      <div class="tile is-ice">
        <div class="tile-ic">${icon("user", 18)}</div>
        <div class="k">Cada quien</div>
        <div class="v num">${esc(money(w.mine))}</div>
        <div class="d">Tú y ${esc(Store.partnerName())}, igual</div>
      </div>
    </section>`;
}

/** Fondo del local y los pagos del local que vienen (se pagan de este fondo). */
function localFundCard() {
  const fund = Finance.localFund();
  const today = todayISO();
  const list = [...Finance.overduePayments(), ...Finance.pendingPayments({ from: addDays(today, 1) })]
    .filter((o) => o.category === "local")
    .slice(0, 4);

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
      <div class="between">
        <h2 class="panel-title">Fondo del local</h2>
        <span class="debt-left num">${esc(money(fund.balance))}</span>
      </div>
      <p class="tiny muted mt-8">Apartado ${esc(money(fund.saved))} · pagado ${esc(money(fund.paid))}. Renta, luz, agua e internet del local se pagan de aquí, no de tu dinero.</p>
      ${list.length ? `<div class="pay-list mt-8">${rows}</div>` : ""}
    </section>`;
}

function weekChart(w) {
  const today = todayISO();
  const days = [];
  for (let d = w.start; d <= w.end; d = addDays(d, 1)) {
    days.push({
      date: d,
      values: SHARED.map((id) => Finance.movementsBetween(d, d, id).reduce((s, m) => s + (m.type === "income" ? m.amount : 0), 0)),
    });
  }
  const max = Math.max(1, ...days.flatMap((d) => d.values));
  return `
    <section class="card">
      <h2 class="panel-title">Entradas por día</h2>
      <div class="week-bars">
        ${days.map((d) => `
          <div class="g${d.date === today ? " is-today" : ""}">
            <div class="pair">${d.values.map((v, i) => `<i style="height:${Math.round((v / max) * 100)}%;background:${esc(colorOf(SHARED[i]))}" title="${esc(money(v))}"></i>`).join("")}</div>
            <span class="cap">${DAY_LETTER[parseISO(d.date).getDay()]}</span>
          </div>`).join("")}
      </div>
      <div class="cat-legend week-legend">
        ${SHARED.map((id) => `<div class="cl"><i style="background:${esc(colorOf(id))}"></i><span class="n">${esc(nameOf(id))}</span></div>`).join("")}
      </div>
    </section>`;
}

export default {
  render() {
    const w = Finance.partnerWeek(todayISO());
    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Barbería y Uñas</b></div>
          <div class="head-sub">${esc(formatCutRange(w.start, w.end))} · aparte de tu dinero</div>
        </div>
      </header>

      <section class="banner">
        <div class="banner-sub">A repartir esta semana</div>
        <div class="banner-amount num">${esc(money(w.toSplit))}</div>
        <div class="banner-sub num">Entradas ${esc(money(w.total))} − local ${esc(money(w.local))}</div>
        <div class="banner-actions is-2">
          ${SHARED.map((id) => `
            <button class="qa is-primary" data-action="entrada" data-business="${esc(id)}">
              <span class="ic">${icon("plus", 21, 2.4)}</span>
              <span class="lbl">${esc(nameOf(id))}</span>
            </button>`).join("")}
        </div>
      </section>

      ${weekCard(w)}
      <div class="panel-grid">
        ${localFundCard()}
        ${weekChart(w)}
      </div>`;
  },

  mount() {},
};
