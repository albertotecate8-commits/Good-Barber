// Pantalla DEUDAS: lo que se debe en total y, por deuda, cuánto falta, cuánto
// se ha abonado y un botón para abonar. Los abonos restan de "Mi dinero".

import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { formatMedium } from "../dates.js";
import { icon, empty } from "../ui.js";

/** Botón para abonar: deuda fuerte → abono libre; periódica → su próximo pago. */
function payButton(d) {
  if (d.item.kind === "heavy") {
    return `<button class="btn btn-ink btn-sm" data-action="pay-heavy" data-id="${esc(d.item.id)}">${icon("check", 15, 2.4)} Abonar</button>`;
  }
  return d.next
    ? `<button class="btn btn-ink btn-sm" data-action="pay" data-occ="${esc(d.next.id)}">${icon("check", 15, 2.4)} Pagar</button>`
    : `<button class="btn btn-ink btn-sm" data-action="pay-item" data-id="${esc(d.item.id)}">${icon("check", 15, 2.4)} Pagar</button>`;
}

export function debtCard(d) {
  const pct = Math.round(d.progress * 100);
  return `
    <section class="card debt-card">
      <div class="between">
        <button class="debt-name" data-action="open-item" data-id="${esc(d.item.id)}">${esc(d.item.name)} ${icon("chevron", 14, 2.2)}</button>
        <span class="debt-left num">${esc(money(d.remaining))}</span>
      </div>
      <div class="track mt-8"><i class="lime" style="width:${pct}%"></i></div>
      <div class="between mt-8">
        <span class="tiny muted">Abonado ${esc(money(d.paid))}${d.next ? ` · próximo ${esc(formatMedium(d.next.dueDate))}` : ""}</span>
        <span class="tiny muted">${pct}%</span>
      </div>
      <div class="debt-actions mt-14">${payButton(d)}</div>
    </section>`;
}

export default {
  render() {
    const list = Finance.debtList();
    const active = list.filter((d) => !d.done);
    const done = list.filter((d) => d.done);
    const total = active.reduce((s, d) => s + d.remaining, 0);

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Deudas</b></div>
        </div>
        <button class="icon-btn is-lime" data-action="new-heavy" aria-label="Nueva deuda">${icon("plus", 20, 2.4)}</button>
      </header>

      <section class="banner">
        <div class="banner-sub">Debes en total</div>
        <div class="banner-amount num">${esc(money(total))}</div>
        <div class="banner-sub">${active.length === 1 ? "1 deuda" : `${active.length} deudas`} · los abonos salen de tu dinero</div>
      </section>

      <div class="stack mt-14" style="gap:12px">
        ${active.length
          ? active.map(debtCard).join("")
          : `<div class="card">${empty("Sin deudas", "Cuando tengas una, agrégala con el botón +.", "check")}</div>`}
      </div>

      ${done.length ? `
        <div class="section-head"><h2 class="section-title">Pagadas</h2></div>
        <div class="card">
          ${done.map((d) => `
            <button class="pay-item day-exp" data-action="open-item" data-id="${esc(d.item.id)}">
              <div class="grow"><div class="t">${esc(d.item.name)}</div><div class="s">Abonado ${esc(money(d.paid))}</div></div>
              <span class="chip lime">Pagada</span>
            </button>`).join("")}
        </div>` : ""}`;
  },

  mount() {},
};
