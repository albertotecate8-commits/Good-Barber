// Pantalla DETALLE de un concepto: estado, próximo pago, acciones e historial.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { KIND, STATUS } from "../model.js";
import { money, moneyShort, esc } from "../format.js";
import { todayISO, formatLong, formatMedium, relativeLabel, recurrenceLabel, WEEKDAYS_PLURAL } from "../dates.js";
import { icon, empty, statusChip } from "../ui.js";
import { backHeader } from "../components.js";

/**
 * Historial: TODOS los movimientos del concepto, uno por uno — incluidos los
 * abonos parciales, que no resuelven el vencimiento pero sí quedan
 * registrados (y descuentan del disponible) igual que cualquier otro pago.
 */
function historyList(item) {
  const rows = Store.movementsOf(item.id);

  if (!rows.length) {
    return `<div class="card">${empty("Sin historial todavía", "Aquí aparecerá cada pago que registres.", "history")}</div>`;
  }

  const isIncome = item.kind === KIND.INCOME;

  return `<div class="list">${rows.map((m) => `
    <div class="row has-actions" style="cursor:default">
      <span class="row-ico ${isIncome ? "c-ingreso" : "c-otros"}">${icon("check", 17, 2.4)}</span>
      <span class="row-body">
        <span class="row-title">${esc(formatLong(m.date))}</span>
        <span class="row-sub">
          <span class="chip ${m.partial ? "pending" : "paid"}">${m.partial ? "Abono parcial" : isIncome ? "Recibido" : "Pagado"}</span>
          ${m.note ? `<span class="tiny truncate">${esc(m.note)}</span>` : ""}
        </span>
      </span>
      <span class="row-end"><span class="row-amount num ${isIncome ? "pos" : ""}">${esc(money(m.amount))}</span></span>
      <span class="row-actions single">
        <button class="btn btn-outline btn-sm" data-action="undo" data-id="${esc(m.id)}">Deshacer</button>
      </span>
    </div>`).join("")}</div>`;
}

/** Barra de progreso cuando un vencimiento ya tiene abonos parciales. */
function partialProgress(occ) {
  const progress = Finance.occurrenceProgress(occ);
  if (progress.paid <= 0) return "";
  const pct = Math.min(100, Math.round((progress.paid / occ.amount) * 100));
  return `
    <div class="card mt-14">
      <div class="between" style="margin-bottom:8px">
        <span class="tiny muted">Abonado hasta ahora</span>
        <span class="tiny strong">${esc(money(progress.paid))} de ${esc(money(occ.amount))}</span>
      </div>
      <div class="track"><i class="lime" style="width:${pct}%"></i></div>
      <div class="tiny muted mt-8">Restan ${esc(money(progress.remaining))}</div>
    </div>`;
}

/** Detalle de una deuda fuerte: saldo, estado y abonos. */
function heavyView(item) {
  const paid = Store.movementsOf(item.id);
  const totalPaid = paid.reduce((s, m) => s + m.amount, 0);
  const original = (item.balance || 0) + totalPaid;
  const progress = original ? Math.round((totalPaid / original) * 100) : 0;

  return `
    ${backHeader(item.name, "Deuda fuerte")}

    <section class="detail-hero">
      <div class="detail-top">
        <div class="grow">
          <div class="detail-amount num">${esc(money(item.balance || 0))}</div>
          <div class="detail-cap">Saldo pendiente</div>
        </div>
        ${item.statusNote ? `<span class="detail-pill warn">${esc(item.statusNote)}</span>` : ""}
      </div>
      <div class="detail-meta">
        <div class="m"><div class="k">Abonado</div><div class="v num">${esc(money(totalPaid))}</div></div>
        <div class="m"><div class="k">Avance</div><div class="v num">${progress}%</div></div>
      </div>
    </section>

    <div class="btn-row mt-14">
      <button class="btn btn-ink" data-action="pay-heavy" data-id="${esc(item.id)}">${icon("check", 18, 2.4)} Abonar</button>
      <button class="btn btn-lime" data-action="edit-item" data-id="${esc(item.id)}">${icon("edit", 17, 2)} Editar</button>
    </div>

    ${item.note ? `<div class="card mt-14"><div class="tiny muted">Nota</div><p style="font-size:14px;margin-top:4px">${esc(item.note)}</p></div>` : ""}

    <div class="section-head">
      <h2 class="section-title">Historial de abonos</h2>
    </div>
    ${paid.length
      ? `<div class="list">${paid.map((m) => `
          <div class="row has-actions" style="cursor:default">
            <span class="row-ico c-fuertes">${icon("check", 17, 2.4)}</span>
            <span class="row-body">
              <span class="row-title">${esc(formatLong(m.date))}</span>
              <span class="row-sub"><span class="chip paid">Abonado</span>${m.note ? `<span class="tiny truncate">${esc(m.note)}</span>` : ""}</span>
            </span>
            <span class="row-end"><span class="row-amount num">${esc(money(m.amount))}</span></span>
            <span class="row-actions single">
              <button class="btn btn-outline btn-sm" data-action="undo" data-id="${esc(m.id)}">Deshacer abono</button>
            </span>
          </div>`).join("")}</div>`
      : `<div class="card">${empty("Sin abonos", "Cuando abones algo aparecerá aquí.", "history")}</div>`}`;
}

export default {
  render(params) {
    const item = Store.getItem(params.id);
    if (!item) {
      return `${backHeader("No encontrado", "")}
        <div class="card">${empty("Ese registro ya no existe", "Puede que lo hayas eliminado.", "alert")}</div>`;
    }

    if (item.kind === KIND.HEAVY) return heavyView(item);

    const isIncome = item.kind === KIND.INCOME;
    const next = Store.occurrencesOf(item.id)
      .filter((o) => o.status === STATUS.PENDING)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

    const status = next ? Finance.statusOf(next) : null;
    const pillClass = status === "overdue" ? "bad" : status === "pending" ? "warn" : "ok";
    const needsDate = !next && !item.cutBased;

    const pillLabel = next
      ? (status === "overdue" ? "Vencido" : "Pendiente")
      : (item.cutBased ? "Corte semanal" : "Fecha por configurar");

    return `
      ${backHeader(item.name, Store.categoryName(item.category))}

      <section class="detail-hero">
        <div class="detail-top">
          <div class="grow">
            <div class="detail-amount num">${esc(money(next ? next.amount : item.amount))}</div>
            <div class="detail-cap">${isIncome ? "Monto esperado" : "Monto configurado"}${item.variable ? " · variable" : ""}</div>
          </div>
          <span class="detail-pill ${pillClass}">${esc(pillLabel)}</span>
        </div>

        <div class="detail-meta">
          <div class="m">
            <div class="k">${isIncome ? "Próximo cobro" : "Próximo pago"}</div>
            <div class="v">${next ? esc(formatMedium(next.dueDate)) : (item.cutBased ? `Cierra ${esc(WEEKDAYS_PLURAL[Finance.cutClosingDay()])}` : "Sin definir")}</div>
          </div>
          <div class="m">
            <div class="k">Periodicidad</div>
            <div class="v">${esc(recurrenceLabel(item.recurrence))}</div>
          </div>
        </div>
      </section>

      ${needsDate ? `
        <div class="card mt-14" style="border:1.5px solid rgba(217,130,0,.3);background:var(--warn-soft)">
          <p class="tiny" style="color:#8a5600;margin-bottom:10px">
            No tiene una fecha de vencimiento configurada. Puedes registrarlo cuando lo pagues, o ponerle
            una fecha para que la app te avise cuándo toca.
          </p>
          <button class="btn btn-soft btn-sm" data-action="edit-item" data-id="${esc(item.id)}">${icon("calendar", 16, 2.2)} Configurar fecha</button>
        </div>` : ""}

      <div class="${next ? "btn-row-3" : "btn-row"} mt-14">
        ${next
          ? `<button class="btn ${isIncome ? "btn-lime" : "btn-ink"}" data-action="${isIncome ? "receive" : "pay"}" data-occ="${esc(next.id)}">${isIncome ? "Recibir" : "Pagar"}</button>`
          : `<button class="btn ${isIncome ? "btn-lime" : "btn-ink"}" data-action="pay-item" data-id="${esc(item.id)}">${isIncome ? "Recibir" : "Pagar"} ahora</button>`}
        <button class="btn btn-outline" data-action="edit-item" data-id="${esc(item.id)}">Editar</button>
        ${next ? `<button class="btn btn-outline" data-action="edit-occ" data-occ="${esc(next.id)}">Ajustar</button>` : ""}
      </div>

      ${next ? partialProgress(next) : ""}

      <div class="card mt-14">
        <div class="kv"><span class="k">Categoría</span><span class="v">${esc(Store.categoryName(item.category))}</span></div>
        <div class="kv"><span class="k">Tipo</span><span class="v">${isIncome ? "Ingreso" : item.kind === KIND.DEBT ? "Deuda" : "Gasto"}</span></div>
        <div class="kv"><span class="k">Monto variable</span><span class="v">${item.variable ? "Sí" : "No"}</span></div>
        ${item.reference ? `<div class="kv"><span class="k">Referencia</span><span class="v num">${esc(item.reference)}</span></div>` : ""}
        ${item.statusNote ? `<div class="kv"><span class="k">Estado</span><span class="v">${esc(item.statusNote)}</span></div>` : ""}
        ${item.note ? `<div class="kv"><span class="k">Nota</span><span class="v" style="font-weight:500;max-width:60%">${esc(item.note)}</span></div>` : ""}
      </div>

      <div class="section-head">
        <h2 class="section-title">Historial de pagos</h2>
      </div>
      ${historyList(item)}`;
  },

  mount() {},
};
