// Filtro universal: un solo componente reutilizable en Gastos, Ingresos,
// Deudas, Historial, Movimientos y Categorías. Convierte cada tipo de
// registro (vencimiento, movimiento, concepto) a una forma común para poder
// filtrar y ordenar todo de la misma manera.

import * as Store from "./store.js";
import * as Finance from "./finance.js";
import { esc } from "./format.js";
import { sheet, icon } from "./ui.js";
import { todayISO, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isValidISO } from "./dates.js";

export const DEFAULT_FILTER = {
  category: "all",
  type: "all",     // all | income | expense | debt
  status: "all",   // all | pending | overdue | paid | received
  period: "all",   // all | today | week | month | last7 | last30 | custom
  from: "",
  to: "",
  sort: "date-desc",
};

export function isDefaultFilter(state) {
  return Object.keys(DEFAULT_FILTER).every((k) => (state[k] || "") === (DEFAULT_FILTER[k] || ""));
}

/* ==================================================== Normalización ====== */

export function normalizeOccurrence(occ) {
  const status = Finance.statusOf(occ);
  const isPartial = status === "pending" && Finance.occurrenceProgress(occ).paid > 0;
  return {
    raw: occ, kind: "occurrence",
    id: occ.id, name: occ.name, category: occ.category,
    recordKind: occ.kind, amount: occ.amount, date: occ.dueDate,
    status: isPartial ? "partial" : status,
  };
}

export function normalizeMovement(m) {
  return {
    raw: m, kind: "movement",
    id: m.id, name: m.concept, category: m.category,
    recordKind: m.kind || (m.type === "income" ? "income" : "expense"),
    amount: m.amount, date: m.date,
    status: m.partial ? "pending" : (m.type === "income" ? "received" : "paid"),
  };
}

export function normalizeItem(item) {
  return {
    raw: item, kind: "item",
    id: item.id, name: item.name, category: item.category,
    recordKind: item.kind, amount: item.kind === "heavy" ? item.balance || 0 : item.amount,
    date: item.startDate || "",
    status: "all",
  };
}

/**
 * Estado agregado de un concepto (no de un vencimiento suelto): para deudas
 * periódicas, el de su vencimiento real más próximo; para deudas fuertes,
 * pagada si el saldo llegó a cero. Cancelada siempre gana sobre lo demás.
 */
export function normalizeDebtItem(item) {
  let status = "pending";
  let date = item.startDate || "";
  let amount = item.amount;

  if (item.kind === "heavy") {
    amount = item.balance || 0;
    status = amount <= 0 ? "paid" : "pending";
    date = "";
  } else {
    const next = Store.occurrencesOf(item.id).find((o) => o.status === "pending");
    if (next) {
      const norm = normalizeOccurrence(next);
      status = norm.status;
      date = next.dueDate;
      amount = next.amount;
    } else {
      status = "paid";
    }
  }

  if (item.active === false) status = "cancelled";

  return {
    raw: item, kind: "item",
    id: item.id, name: item.name, category: item.category,
    recordKind: item.kind, amount, date, status,
  };
}

/* ========================================================= Filtrado ====== */

function periodRange(state) {
  const today = todayISO();
  switch (state.period) {
    case "today": return { from: today, to: today };
    case "week": return { from: startOfWeek(today), to: endOfWeek(today) };
    case "month": return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last7": return { from: addDays(today, -7), to: today };
    case "last30": return { from: addDays(today, -30), to: today };
    case "custom": return { from: isValidISO(state.from) ? state.from : null, to: isValidISO(state.to) ? state.to : null };
    default: return { from: null, to: null };
  }
}

function matchesType(record, type) {
  if (type === "all") return true;
  if (type === "income") return record.recordKind === "income";
  if (type === "expense") return record.recordKind === "expense";
  if (type === "debt") return record.recordKind === "debt" || record.recordKind === "heavy";
  return true;
}

function matchesStatus(record, status) {
  if (status === "all") return true;
  // Los conceptos genéricos (normalizeItem) no tienen un estado real: status
  // siempre es "all". Los conceptos de deuda (normalizeDebtItem) sí lo tienen
  // y deben poder filtrarse aunque no tengan fecha (deudas fuertes, por ejemplo).
  if (!record.date && record.kind === "item" && record.status === "all") return true;
  return record.status === status;
}

/** Filtra una lista ya normalizada. */
export function applyFilter(records, state) {
  const range = periodRange(state);
  return records.filter((r) => {
    if (state.category !== "all" && r.category !== state.category) return false;
    if (!matchesType(r, state.type)) return false;
    if (!matchesStatus(r, state.status)) return false;
    if (range.from && r.date && r.date < range.from) return false;
    if (range.to && r.date && r.date > range.to) return false;
    return true;
  });
}

export function sortRecords(records, sort) {
  const list = [...records];
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const byAmount = (a, b) => a.amount - b.amount;
  const byName = (a, b) => a.name.localeCompare(b.name, "es");

  switch (sort) {
    case "date-asc": return list.sort(byDate);
    case "amount-asc": return list.sort(byAmount);
    case "amount-desc": return list.sort((a, b) => -byAmount(a, b));
    case "name-asc": return list.sort(byName);
    case "name-desc": return list.sort((a, b) => -byName(a, b));
    case "date-desc":
    default:
      return list.sort((a, b) => -byDate(a, b));
  }
}

/** Filtra + ordena en un solo paso. */
export function applyAll(records, state) {
  return sortRecords(applyFilter(records, state), state.sort);
}

/* ============================================================== Hoja ====== */

const TYPE_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "income", label: "Ingreso" },
  { id: "expense", label: "Gasto" },
  { id: "debt", label: "Deuda" },
];

const STATUS_OPTIONS = [
  { id: "all", label: "Todos" },
  { id: "pending", label: "Pendiente" },
  { id: "overdue", label: "Vencido" },
  { id: "partial", label: "Parcial" },
  { id: "paid", label: "Pagado" },
  { id: "received", label: "Recibido" },
  { id: "cancelled", label: "Cancelada" },
];

const PERIOD_OPTIONS = [
  { id: "all", label: "Todo" },
  { id: "today", label: "Hoy" },
  { id: "week", label: "Esta semana" },
  { id: "month", label: "Este mes" },
  { id: "last7", label: "Últimos 7 días" },
  { id: "last30", label: "Últimos 30 días" },
  { id: "custom", label: "Personalizado" },
];

const SORT_OPTIONS = [
  { id: "date-desc", label: "Fecha más reciente" },
  { id: "date-asc", label: "Fecha más antigua" },
  { id: "amount-desc", label: "Monto mayor → menor" },
  { id: "amount-asc", label: "Monto menor → mayor" },
  { id: "name-asc", label: "Nombre A → Z" },
  { id: "name-desc", label: "Nombre Z → A" },
];

function chipsRow(name, options, current) {
  return `
    <div class="chips-pick" data-group="${name}">
      ${options.map((o) => `<button type="button" data-value="${esc(o.id)}" class="${o.id === current ? "is-on" : ""}">${esc(o.label)}</button>`).join("")}
    </div>`;
}

/**
 * Abre la hoja de filtro universal. `state` es el filtro actual;
 * `onApply(nextState)` se llama al presionar Aplicar.
 */
export function openFilterSheet({ state, categoryType, onApply }) {
  const working = { ...DEFAULT_FILTER, ...state };
  const categories = Store.categories().filter((c) => !categoryType || c.type === categoryType);

  sheet({
    title: "Filtrar",
    subtitle: "Combina categoría, tipo, estado, periodo y orden",
    body: `
      <div class="field">
        <label>Categoría</label>
        <select class="select" data-field="category">
          <option value="all">Todas</option>
          ${categories.map((c) => `<option value="${esc(c.id)}" ${c.id === working.category ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Tipo</label>
        ${chipsRow("type", TYPE_OPTIONS, working.type)}
      </div>

      <div class="field">
        <label>Estado</label>
        ${chipsRow("status", STATUS_OPTIONS, working.status)}
      </div>

      <div class="field">
        <label>Periodo</label>
        ${chipsRow("period", PERIOD_OPTIONS, working.period)}
      </div>

      <div data-custom-dates ${working.period === "custom" ? "" : "hidden"}>
        <div class="field">
          <label>Desde</label>
          <input class="input" type="date" data-field="from" value="${esc(working.from || "")}">
        </div>
        <div class="field">
          <label>Hasta</label>
          <input class="input" type="date" data-field="to" value="${esc(working.to || "")}">
        </div>
      </div>

      <div class="field">
        <label>Ordenar por</label>
        <select class="select" data-field="sort">
          ${SORT_OPTIONS.map((o) => `<option value="${o.id}" ${o.id === working.sort ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select>
      </div>

      <div class="sheet-actions">
        <button class="btn btn-ink" data-apply>${icon("filter", 17, 2.2)} Aplicar filtros</button>
        <button class="btn btn-outline" data-reset>Reiniciar</button>
      </div>`,
    onMount: (panel, close) => {
      panel.querySelectorAll("[data-group]").forEach((group) => {
        group.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-value]");
          if (!btn) return;
          working[group.dataset.group] = btn.dataset.value;
          group.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b === btn));
          if (group.dataset.group === "period") {
            const box = panel.querySelector("[data-custom-dates]");
            box.hidden = btn.dataset.value !== "custom";
          }
        });
      });

      panel.querySelectorAll("[data-field]").forEach((el) => {
        el.addEventListener("change", () => { working[el.dataset.field] = el.value; });
      });

      panel.querySelector("[data-apply]").addEventListener("click", () => {
        close();
        onApply({ ...working });
      });

      panel.querySelector("[data-reset]").addEventListener("click", () => {
        close();
        onApply({ ...DEFAULT_FILTER });
      });
    },
  });
}
