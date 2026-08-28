// Pantalla CORTE SEMANAL: mis cortes de ingresos son sábado a viernes.
// Un sábado siempre empieza un corte nuevo; el viernes pertenece al corte
// que arrancó el sábado anterior.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { formatCutRange, formatMedium, todayISO } from "../dates.js";
import { icon, empty } from "../ui.js";
import { backHeader } from "../components.js";

function activeCutCard() {
  const range = Finance.activeCutRange();
  const b = Finance.cutBreakdown(range);
  const period = Finance.summaryBetween(range.start, range.end);
  const isOpenEndedPast = range.end < todayISO(); // el corte ya terminó pero sigue sin cerrarse

  const rows = b.rows.map(({ item, expected, received }) => `
    <div class="row has-actions" style="cursor:default">
      <span class="row-ico c-ingreso">${icon("income", 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">
          <span class="chip ${received >= expected ? "paid" : "pending"}">${received >= expected ? "Completo" : "Falta"}</span>
          <span>Esperado ${esc(money(expected))}</span>
        </span>
      </span>
      <span class="row-end"><span class="row-amount num pos">${esc(money(received))}</span></span>
      <span class="row-actions single">
        <button class="btn btn-lime btn-sm" data-action="pay-item" data-id="${esc(item.id)}">Registrar ingreso</button>
      </span>
    </div>`).join("");

  return `
    <section class="card-dark">
      <div class="hero-label" style="text-align:left">Corte actual</div>
      <div class="detail-amount num" style="text-align:left">${esc(formatCutRange(range.start, range.end))}</div>
      ${isOpenEndedPast ? `<div class="tiny" style="color:#ffc46b;margin-top:4px">Este corte ya terminó — puedes cerrarlo cuando quieras.</div>` : ""}

      <div class="mini-grid mt-14">
        <div class="mini">
          <div class="k">Esperado</div>
          <div class="v num">${esc(money(b.expected))}</div>
        </div>
        <div class="mini">
          <div class="k">Recibido</div>
          <div class="v lime num">${esc(money(b.received))}</div>
        </div>
        <div class="mini">
          <div class="k">Faltante</div>
          <div class="v ${b.missing > 0 ? "warn" : "lime"} num">${esc(money(b.missing))}</div>
        </div>
      </div>
    </section>

    ${rows ? `<div class="list mt-14">${rows}</div>` : `<div class="card mt-14">${empty("Sin ingresos de corte", "Crea uno con periodicidad semanal para verlo aquí.", "income")}</div>`}

    <div class="card mt-14">
      <div class="card-head"><span class="t">Este corte vs. gastos del periodo</span></div>
      <div class="kv"><span class="k">Ingresos recibidos</span><span class="v num pos">${esc(money(period.income))}</span></div>
      <div class="kv"><span class="k">Pagos realizados</span><span class="v num">${esc(money(period.paid))}</span></div>
      <div class="kv"><span class="k">Pendiente del periodo</span><span class="v num">${esc(money(period.pending))}</span></div>
      <div class="kv"><span class="k">Disponible generado</span><span class="v num ${period.net >= 0 ? "pos" : "neg"}">${esc(money(period.net))}</span></div>
    </div>

    <div class="btn-row mt-14">
      <button class="btn btn-outline" data-action="quick-income">${icon("plus", 17, 2.4)} Registrar ingreso</button>
      <button class="btn btn-ink" data-action="close-cut" data-start="${esc(range.start)}" data-end="${esc(range.end)}"
              data-expected="${b.expected}" data-received="${b.received}">
        ${icon("check", 17, 2.4)} Cerrar corte
      </button>
    </div>`;
}

function historySection() {
  const list = Finance.cutHistory();
  if (!list.length) return "";

  return `
    <div class="section-head">
      <h2 class="section-title">Cortes anteriores</h2>
    </div>
    <div class="list">
      ${list.map((c) => `
        <div class="row" style="cursor:default">
          <span class="row-ico c-otros">${icon("calendar", 17)}</span>
          <span class="row-body">
            <span class="row-title">${esc(formatCutRange(c.startDate, c.endDate))}</span>
            <span class="row-sub">
              <span class="chip neutral">Cerrado</span>
              <span>${esc(formatMedium(c.closedAt.slice(0, 10)))}</span>
            </span>
          </span>
          <span class="row-end">
            <span class="row-amount num ${c.difference >= 0 ? "pos" : "neg"}">${c.difference >= 0 ? "+" : ""}${esc(money(c.difference))}</span>
            <span class="row-meta">${esc(money(c.received))} de ${esc(money(c.expected))}</span>
          </span>
        </div>`).join("")}
    </div>`;
}

export default {
  render() {
    return `
      ${backHeader("Corte semanal", "Sábado a viernes")}
      ${activeCutCard()}
      ${historySection()}`;
  },

  mount() {},
};
