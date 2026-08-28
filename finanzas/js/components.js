// Piezas visuales reutilizables entre pantallas.

import * as Store from "./store.js";
import * as Finance from "./finance.js";
import { KIND } from "./model.js";
import { money, moneyShort, esc } from "./format.js";
import { formatMedium, formatShort, relativeLabel, recurrenceShort, todayISO } from "./dates.js";
import { icon, statusChip } from "./ui.js";

const CATEGORY_GLYPH = {
  casa: "home",
  local: "tag",
  deudas: "debt",
  suscripciones: "refresh",
  fuertes: "alert",
  otros: "wallet",
};

export function categoryGlyph(categoryId, kind) {
  if (kind === KIND.INCOME) return "income";
  return CATEGORY_GLYPH[categoryId] || "wallet";
}

function iconClass(categoryId, kind) {
  if (kind === KIND.INCOME) return "c-ingreso";
  return `c-${CATEGORY_GLYPH[categoryId] ? categoryId : "otros"}`;
}

/** Fila de un vencimiento (pago pendiente, pagado o ingreso esperado). */
export function occurrenceRow(occ, options = {}) {
  const status = Finance.statusOf(occ);
  const isIncome = occ.kind === KIND.INCOME;
  const done = status === "paid" || status === "received";
  const progress = done ? null : Finance.occurrenceProgress(occ);
  const hasPartial = !!progress && progress.paid > 0;
  const amount = done && occ.paidAmount != null ? occ.paidAmount : hasPartial ? progress.remaining : occ.amount;
  const changed = done && occ.paidAmount != null && occ.paidAmount !== occ.amount;

  return `
    <button class="row" data-action="open-item" data-id="${esc(occ.itemId)}" data-occ="${esc(occ.id)}">
      <span class="row-ico ${iconClass(occ.category, occ.kind)}">${icon(categoryGlyph(occ.category, occ.kind), 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(occ.name)}</span>
        <span class="row-sub">
          ${statusChip(status)}
          ${hasPartial ? `<span class="chip lime">Abonado ${esc(moneyShort(progress.paid))}</span>` : ""}
          ${options.hideDate ? "" : `<span>${esc(options.showRelative ? relativeLabel(occ.dueDate) : formatMedium(occ.dueDate))}</span>`}
        </span>
      </span>
      <span class="row-end">
        <span class="row-amount num ${isIncome && done ? "pos" : ""}">${isIncome ? "+" : ""}${esc(money(amount))}</span>
        ${changed ? `<span class="row-meta">esperado ${esc(moneyShort(occ.amount))}</span>`
                  : hasPartial ? `<span class="row-meta">de ${esc(moneyShort(occ.amount))}</span>`
                  : `<span class="row-meta">${esc(Store.categoryName(occ.category))}</span>`}
      </span>
    </button>`;
}

/** Fila de un movimiento del historial. */
export function movementRow(mov) {
  const isIncome = mov.type === "income";
  return `
    <button class="row" data-action="open-movement" data-id="${esc(mov.id)}">
      <span class="row-ico ${iconClass(mov.category, isIncome ? KIND.INCOME : mov.kind)}">
        ${icon(isIncome ? "income" : "expense", 18)}
      </span>
      <span class="row-body">
        <span class="row-title">${esc(mov.concept)}</span>
        <span class="row-sub">
          <span>${esc(formatMedium(mov.date))}</span>
          <span class="chip neutral">${esc(Store.categoryName(mov.category))}</span>
        </span>
      </span>
      <span class="row-end">
        <span class="row-amount num ${isIncome ? "pos" : ""}">${isIncome ? "+" : "−"}${esc(money(mov.amount))}</span>
        <span class="row-meta">saldo ${esc(moneyShort(mov.balanceAfter || 0))}</span>
      </span>
    </button>`;
}

/** Fila de un concepto (plantilla), con su próximo vencimiento. */
export function itemRow(item) {
  const next = Store.occurrencesOf(item.id)
    .filter((o) => o.status === "pending")
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

  const isIncome = item.kind === KIND.INCOME;
  const sub = next
    ? `${statusChip(Finance.statusOf(next))}<span>${esc(formatMedium(next.dueDate))}</span>`
    : `<span class="chip neutral">Fecha por configurar</span>`;

  return `
    <button class="row" data-action="open-item" data-id="${esc(item.id)}">
      <span class="row-ico ${iconClass(item.category, item.kind)}">${icon(categoryGlyph(item.category, item.kind), 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">${sub}</span>
      </span>
      <span class="row-end">
        <span class="row-amount num ${isIncome ? "pos" : ""}">${esc(money(item.amount))}</span>
        <span class="row-meta">${esc(recurrenceShort(item.recurrence))}${item.variable ? " · variable" : ""}</span>
      </span>
    </button>`;
}

/** Tarjeta de deuda fuerte. */
export function heavyCard(item) {
  const canceled = item.active === false;
  return `
    <button class="row" data-action="open-item" data-id="${esc(item.id)}">
      <span class="row-ico c-fuertes">${icon("alert", 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">
          ${canceled ? `<span class="chip cancel">Cancelada</span>` : ""}
          ${item.statusNote ? `<span class="chip dark">${esc(item.statusNote)}</span>` : canceled ? "" : `<span class="chip neutral">Sin estado</span>`}
        </span>
      </span>
      <span class="row-end">
        <span class="row-amount num">${esc(money(item.balance || 0))}</span>
        <span class="row-meta">saldo</span>
      </span>
    </button>`;
}

/** Gráfica de barras ingresos vs gastos. */
export function barsChart(groups) {
  const bars = groups.map((g) => `
    <div class="bars-group">
      <div class="bars-pair">
        <i class="inc" style="height:${Math.max(3, g.incomePct)}%" title="Ingresos ${money(g.income)}"></i>
        <i class="exp" style="height:${Math.max(3, g.expensePct)}%" title="Gastos ${money(g.expense)}"></i>
      </div>
      <div class="cap">${esc(g.label)}</div>
    </div>`).join("");

  return `
    <div class="bars">${bars}</div>
    <div class="legend">
      <span><i style="background:var(--lime-2)"></i> Ingresos</span>
      <span><i style="background:var(--ink)"></i> Gastos</span>
    </div>`;
}

/** Dona de distribución por categoría. */
export function donutChart(rows, total, centerLabel) {
  if (!total) {
    return `<p class="tiny muted center" style="padding:18px 0">Todavía no hay gastos pagados en este periodo.</p>`;
  }

  const R = 46;
  const C = 2 * Math.PI * R;
  let offset = 0;

  const arcs = rows.map((r) => {
    const fraction = r.amount / total;
    const dash = `${(fraction * C).toFixed(2)} ${(C - fraction * C).toFixed(2)}`;
    const seg = `<circle cx="58" cy="58" r="${R}" fill="none" stroke="${esc(r.color)}"
      stroke-width="15" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset * C).toFixed(2)}"></circle>`;
    offset += fraction;
    return seg;
  }).join("");

  const legend = rows.map((r) => `
    <div class="cl">
      <i style="background:${esc(r.color)}"></i>
      <span class="n">${esc(r.name)}</span>
      <span class="a num">${esc(moneyShort(r.amount))}</span>
    </div>`).join("");

  return `
    <div class="donut-wrap">
      <div class="donut">
        <svg width="116" height="116" viewBox="0 0 116 116">
          <circle cx="58" cy="58" r="${R}" fill="none" stroke="rgba(19,19,19,.06)" stroke-width="15"></circle>
          ${arcs}
        </svg>
        <div class="mid">
          <div class="k">${esc(centerLabel || "Total")}</div>
          <div class="v num">${esc(moneyShort(total))}</div>
        </div>
      </div>
      <div class="cat-legend">${legend}</div>
    </div>`;
}

/** Encabezado con botón de regreso. */
export function backHeader(title, subtitle, actionHtml) {
  return `
    <div class="back-row">
      <button class="icon-btn is-outline" data-action="back" aria-label="Regresar">${icon("back", 18, 2.2)}</button>
      <div class="titles">
        <div class="title">${esc(title)}</div>
        ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ""}
      </div>
      ${actionHtml || '<span style="width:40px"></span>'}
    </div>`;
}

/** Lista de vencimientos agrupada por fecha. */
export function groupedByDate(list, renderer) {
  if (!list.length) return "";
  const groups = new Map();
  list.forEach((row) => {
    const key = row.dueDate || row.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  return [...groups.entries()].map(([date, rows]) => `
    <div class="section-head" style="margin-top:18px">
      <span class="section-title" style="font-size:13px">${esc(formatShort(date))}</span>
      <span class="section-link">${esc(relativeLabel(date))}</span>
    </div>
    <div class="list">${rows.map(renderer).join("")}</div>`).join("");
}

export { todayISO };
