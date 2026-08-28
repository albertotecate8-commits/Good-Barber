// Pantalla DEUDAS: pagos periódicos de deuda + deudas fuertes.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import * as Filters from "../filters.js";
import { KIND, STATUS } from "../model.js";
import { money, esc } from "../format.js";
import { todayISO, formatMedium } from "../dates.js";
import { icon, empty } from "../ui.js";
import { heavyCard } from "../components.js";

let query = "";
let advanced = { ...Filters.DEFAULT_FILTER };

/** Tarjeta de deuda periódica con su próximo pago y botón de pago directo. */
function debtCard(item) {
  const canceled = item.active === false;
  const next = Store.occurrencesOf(item.id)
    .filter((o) => o.status === STATUS.PENDING)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];

  const overdue = next && next.dueDate <= todayISO();
  const progress = next ? Finance.occurrenceProgress(next) : null;
  const hasPartial = !!progress && progress.paid > 0;
  const displayAmount = next ? (hasPartial ? progress.remaining : next.amount) : item.amount;

  return `
    <div class="row has-actions" style="cursor:default">
      <span class="row-ico c-deudas">${icon("debt", 18)}</span>
      <button class="row-body" data-action="open-item" data-id="${esc(item.id)}" style="text-align:left">
        <span class="row-title">${esc(item.name)}</span>
        <span class="row-sub">
          ${canceled ? `<span class="chip cancel">Cancelada</span>` : ""}
          ${next
            ? `<span class="chip ${overdue ? "overdue" : "pending"}">${overdue ? "Vencido" : "Próximo pago"}</span>
               ${hasPartial ? `<span class="chip lime">Abonado ${esc(money(progress.paid))}</span>` : ""}
               <span class="nowrap">${esc(formatMedium(next.dueDate))}${item.variable ? " · variable" : ""}</span>`
            : canceled ? "" : `<span class="chip neutral">Fecha por configurar</span>`}
        </span>
      </button>
      <span class="row-end">
        <span class="row-amount num">${esc(money(displayAmount))}</span>
        <span class="row-meta">${hasPartial ? `de ${esc(money(next.amount))}` : next ? "próximo pago" : "monto"}</span>
      </span>
      <span class="row-actions">
        <button class="btn btn-outline btn-sm" data-action="open-item" data-id="${esc(item.id)}">Detalle</button>
        ${next
          ? `<button class="btn btn-ink btn-sm" data-action="pay" data-occ="${esc(next.id)}">${hasPartial ? "Pagar resto" : "Pagar"}</button>`
          : `<button class="btn btn-ink btn-sm" data-action="pay-item" data-id="${esc(item.id)}">Pagar</button>`}
      </span>
    </div>`;
}

/** Fila unificada (periódica o fuerte) para la vista filtrada/plana. */
function unifiedRow(item) {
  return item.kind === KIND.HEAVY ? heavyCard(item) : debtCard(item);
}

function matchesQuery(item, q) {
  if (!q) return true;
  return item.name.toLocaleLowerCase("es").includes(q) ||
    Store.categoryName(item.category).toLocaleLowerCase("es").includes(q);
}

function allDebtItems() {
  return Store.items().filter((i) => i.kind === KIND.DEBT || i.kind === KIND.HEAVY);
}

function summaryCard() {
  const s = Finance.debtsSummary();
  return `
    <section class="card-dark">
      <div class="hero-label" style="text-align:left">Deuda total</div>
      <div class="hero-amount num" style="text-align:left;font-size:32px">${esc(money(s.total))}</div>
      <div class="mini-grid mt-14">
        <div class="mini">
          <div class="k">Deudas fuertes</div>
          <div class="v num">${esc(money(s.heavy))}</div>
        </div>
        <div class="mini">
          <div class="k">Pagos periódicos</div>
          <div class="v num">${esc(money(s.periodic))}</div>
        </div>
        <div class="mini">
          <div class="k">Pagos vencidos</div>
          <div class="v num" style="${s.overdue ? "color:#ff9096" : ""}">${esc(money(s.overdue))}</div>
        </div>
        <div class="mini">
          <div class="k">Pagos pendientes</div>
          <div class="v warn num">${esc(money(s.pending))}</div>
        </div>
        <div class="mini">
          <div class="k">Pagado este mes</div>
          <div class="v lime num">${esc(money(s.paidThisMonth))}</div>
        </div>
        <div class="mini">
          <div class="k">Disponible</div>
          <div class="v lime num">${esc(money(Store.availableMoney()))}</div>
        </div>
      </div>
    </section>`;
}

export default {
  render() {
    const isAdvanced = !Filters.isDefaultFilter(advanced);
    const q = query.trim().toLocaleLowerCase("es");

    const debts = Store.items()
      .filter((i) => i.active && i.kind === KIND.DEBT)
      .filter((i) => matchesQuery(i, q))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    const heavy = Store.items()
      .filter((i) => i.active && i.kind === KIND.HEAVY)
      .filter((i) => matchesQuery(i, q))
      .sort((a, b) => (b.balance || 0) - (a.balance || 0));

    const filteredRows = isAdvanced
      ? Filters.applyAll(allDebtItems().filter((i) => matchesQuery(i, q)).map(Filters.normalizeDebtItem), advanced).map((r) => r.raw)
      : null;

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Deudas</b></div>
          <div class="head-sub">${debts.length} periódicas · ${heavy.length} fuertes</div>
        </div>
        <button class="icon-btn is-lime" data-action="new-debt" aria-label="Nueva deuda">${icon("plus", 20, 2.4)}</button>
      </header>

      ${summaryCard()}

      <div class="flex mt-14" style="gap:8px">
        <div class="search grow" style="margin:0">
          <span class="mag">${icon("search", 16, 2.2)}</span>
          <input type="text" placeholder="Buscar deuda…" data-search value="${esc(query)}">
        </div>
        <button class="icon-btn ${isAdvanced ? "is-dark" : "is-outline"}" data-action="open-filters" aria-label="Filtrar">${icon("filter", 18, 2.2)}</button>
      </div>

      ${isAdvanced
        ? `
          <div class="section-head mt-14">
            <h2 class="section-title">Resultados</h2>
            <span class="section-link num">${filteredRows.length}</span>
          </div>
          ${filteredRows.length
            ? `<div class="list">${filteredRows.map(unifiedRow).join("")}</div>`
            : `<div class="card">${empty("Nada con ese filtro", "Prueba con otros criterios.", "debt")}</div>`}
        `
        : `
          <div class="section-head mt-14">
            <h2 class="section-title">Pagos periódicos</h2>
            <span class="section-link num">${esc(money(Finance.debtsSummary().periodic))}</span>
          </div>
          ${debts.length
            ? `<div class="list">${debts.map(debtCard).join("")}</div>`
            : `<div class="card">${empty(q ? "Sin resultados" : "Sin deudas periódicas", q ? "Prueba con otra búsqueda." : "Agrega una con el botón +.", "debt")}</div>`}

          <div class="section-head">
            <h2 class="section-title">Deudas fuertes</h2>
            <button class="section-link" data-action="new-heavy">Agregar ${icon("plus", 13, 2.4)}</button>
          </div>
          <p class="tiny muted" style="margin:-4px 2px 10px">
            No generan pagos mensuales automáticos: son saldos que se abonan cuando se puede.
          </p>
          ${heavy.length
            ? `<div class="list">${heavy.map(heavyCard).join("")}</div>`
            : `<div class="card">${empty(q ? "Sin resultados" : "Sin deudas fuertes", "", "alert")}</div>`}
        `}`;
  },

  mount(root, ctx) {
    const filterBtn = root.querySelector('[data-action="open-filters"]');
    if (filterBtn) {
      filterBtn.addEventListener("click", () => {
        Filters.openFilterSheet({
          state: advanced,
          categoryType: "expense",
          onApply: (next) => { advanced = next; ctx.rerender(); },
        });
      });
    }

    const search = root.querySelector("[data-search]");
    if (search) {
      let timer = null;
      search.addEventListener("input", () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          query = search.value;
          ctx.rerender(() => {
            const next = document.querySelector("[data-search]");
            if (next) {
              next.focus();
              next.setSelectionRange(next.value.length, next.value.length);
            }
          });
        }, 220);
      });
    }
  },
};
