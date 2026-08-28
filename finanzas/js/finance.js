// Cálculos derivados. Regla base:
//
//   Dinero disponible = ingresos RECIBIDOS − gastos PAGADOS
//
// Un ingreso esperado no suma hasta marcarse recibido, y un gasto pendiente
// no resta hasta pagarse: aparece aparte como dinero comprometido.

import * as Store from "./store.js";
import { KIND, STATUS } from "./model.js";
import {
  todayISO, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  addMonths, parseISO, MONTHS_SHORT, DOW_SHORT, monthKey,
} from "./dates.js";
import { round2 } from "./format.js";

const EXPENSE_KINDS = [KIND.EXPENSE, KIND.DEBT];

export function isExpenseKind(kind) {
  return EXPENSE_KINDS.includes(kind);
}

/** Estado visual de un vencimiento: paid | received | overdue | pending. */
export function statusOf(occ, today) {
  const ref = today || todayISO();
  if (occ.status === STATUS.PAID) return "paid";
  if (occ.status === STATUS.RECEIVED) return "received";
  if (occ.dueDate < ref) return "overdue";
  return "pending";
}

export function statusLabel(key) {
  return { paid: "Pagado", received: "Recibido", overdue: "Vencido", pending: "Pendiente" }[key] || "Pendiente";
}

/** Vencimientos pendientes de pago (gastos y deudas), ordenados por fecha. */
export function pendingPayments({ until, from } = {}) {
  return Store.occurrences()
    .filter((o) => o.status === STATUS.PENDING && isExpenseKind(o.kind))
    .filter((o) => (until ? o.dueDate <= until : true))
    .filter((o) => (from ? o.dueDate >= from : true))
    .sort((a, b) => (a.dueDate === b.dueDate ? a.name.localeCompare(b.name, "es") : a.dueDate < b.dueDate ? -1 : 1));
}

/** Ingresos esperados todavía no recibidos. */
export function pendingIncomes({ until, from } = {}) {
  return Store.occurrences()
    .filter((o) => o.status === STATUS.PENDING && o.kind === KIND.INCOME)
    .filter((o) => (until ? o.dueDate <= until : true))
    .filter((o) => (from ? o.dueDate >= from : true))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

export function overduePayments() {
  const today = todayISO();
  return pendingPayments({ until: addDays(today, -1) });
}

/** Movimientos dentro de un rango de fechas (inclusive). */
export function movementsBetween(from, to) {
  return Store.movements()
    .filter((m) => m.date >= from && m.date <= to)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

/** Resumen de un periodo: recibido, pagado, comprometido y saldo del periodo. */
export function summaryBetween(from, to) {
  let income = 0;
  let paid = 0;

  movementsBetween(from, to).forEach((m) => {
    if (m.type === "income") income += m.amount;
    else paid += m.amount;
  });

  const pending = pendingPayments({ from, until: to }).reduce((sum, o) => sum + o.amount, 0);
  const expectedIncome = pendingIncomes({ from, until: to }).reduce((sum, o) => sum + o.amount, 0);

  return {
    from,
    to,
    income: round2(income),
    paid: round2(paid),
    pending: round2(pending),
    expectedIncome: round2(expectedIncome),
    net: round2(income - paid),
  };
}

export function weekSummary(iso) {
  const ref = iso || todayISO();
  return summaryBetween(startOfWeek(ref), endOfWeek(ref));
}

export function monthSummary(iso) {
  const ref = iso || todayISO();
  return summaryBetween(startOfMonth(ref), endOfMonth(ref));
}

/**
 * Pendiente del mes: incluye lo vencido de antes que sigue sin pagarse, porque
 * ese dinero también está comprometido.
 */
export function committedThisMonth(iso) {
  const ref = iso || todayISO();
  const list = pendingPayments({ until: endOfMonth(ref) });
  return { total: round2(list.reduce((s, o) => s + o.amount, 0)), list };
}

/** Tarjeta "Próximos 7 días": cuánto se necesita y si alcanza. */
export function next7Days() {
  const today = todayISO();
  const until = addDays(today, 7);
  const list = pendingPayments({ until });
  const needed = round2(list.reduce((sum, o) => sum + o.amount, 0));
  const available = Store.availableMoney();
  const expected = round2(pendingIncomes({ until }).reduce((s, o) => s + o.amount, 0));

  return {
    from: today,
    until,
    list,
    needed,
    available,
    expected,
    isEnough: available >= needed,
    missing: round2(Math.max(0, needed - available)),
  };
}

/** Próximos pagos ordenados cronológicamente (incluye vencidos primero). */
export function upcomingPayments(limit) {
  const list = pendingPayments({});
  return limit ? list.slice(0, limit) : list;
}

/** Gastos pagados agrupados por categoría en un rango. */
export function categoryBreakdown(from, to) {
  const totals = new Map();
  movementsBetween(from, to).forEach((m) => {
    if (m.type !== "expense") return;
    totals.set(m.category, round2((totals.get(m.category) || 0) + m.amount));
  });

  const rows = [...totals.entries()]
    .map(([id, amount]) => ({
      id,
      name: Store.categoryName(id),
      color: Store.categoryColor(id),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  rows.forEach((r) => { r.percent = total ? Math.round((r.amount / total) * 100) : 0; });
  return { rows, total };
}

/** Ingresos recibidos agrupados por categoría en un rango. */
export function incomeBreakdown(from, to) {
  const totals = new Map();
  movementsBetween(from, to).forEach((m) => {
    if (m.type !== "income") return;
    totals.set(m.category, round2((totals.get(m.category) || 0) + m.amount));
  });

  const rows = [...totals.entries()]
    .map(([id, amount]) => ({ id, name: Store.categoryName(id), color: Store.categoryColor(id), amount }))
    .sort((a, b) => b.amount - a.amount);

  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  return { rows, total };
}

/**
 * Serie para la gráfica ingresos vs gastos.
 * week  -> 7 días · month -> semanas del mes · quarter -> 3 meses
 */
export function series(period) {
  const today = todayISO();
  const groups = [];

  if (period === "week") {
    const start = startOfWeek(today);
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(start, i);
      const s = summaryBetween(day, day);
      groups.push({ label: DOW_SHORT[i], income: s.income, expense: s.paid });
    }
  } else if (period === "quarter") {
    for (let i = 2; i >= 0; i -= 1) {
      const ref = addMonths(today, -i, 1);
      const s = summaryBetween(startOfMonth(ref), endOfMonth(ref));
      groups.push({ label: MONTHS_SHORT[parseISO(ref).getMonth()], income: s.income, expense: s.paid });
    }
  } else {
    const first = startOfMonth(today);
    const last = endOfMonth(today);
    let cursor = first;
    let week = 1;
    while (cursor <= last) {
      const end = [addDays(cursor, 6), last].sort()[0];
      const s = summaryBetween(cursor, end);
      groups.push({ label: `S${week}`, income: s.income, expense: s.paid });
      cursor = addDays(end, 1);
      week += 1;
    }
  }

  const max = Math.max(1, ...groups.map((g) => Math.max(g.income, g.expense)));
  groups.forEach((g) => {
    g.incomePct = Math.round((g.income / max) * 100);
    g.expensePct = Math.round((g.expense / max) * 100);
  });
  return groups;
}

/** Eventos por día para el calendario: { "YYYY-MM-DD": {...} } */
export function calendarIndex(fromISO, toISO_) {
  const index = new Map();

  const touch = (date) => {
    if (!index.has(date)) {
      index.set(date, { income: false, expense: false, pending: false, paid: false, events: [] });
    }
    return index.get(date);
  };

  Store.movements().forEach((m) => {
    if (m.date < fromISO || m.date > toISO_) return;
    const day = touch(m.date);
    if (m.type === "income") day.income = true;
    else { day.expense = true; day.paid = true; }
    day.events.push({
      type: m.type === "income" ? "income" : "payment",
      title: m.concept,
      amount: m.amount,
      movementId: m.id,
      itemId: m.itemId,
      note: m.note,
    });
  });

  Store.occurrences().forEach((o) => {
    if (o.status !== STATUS.PENDING) return;
    if (o.dueDate < fromISO || o.dueDate > toISO_) return;
    const day = touch(o.dueDate);
    day.pending = true;
    day.events.push({
      type: o.kind === KIND.INCOME ? "expected" : "due",
      title: o.name,
      amount: o.amount,
      occurrenceId: o.id,
      itemId: o.itemId,
    });
  });

  index.forEach((day) => {
    day.events.sort((a, b) => b.amount - a.amount);
  });
  return index;
}

/** Búsqueda global sobre items, vencimientos y movimientos. */
export function search(query, filter) {
  const q = String(query || "").trim().toLocaleLowerCase("es");
  const today = todayISO();

  const matches = (text) => !q || String(text || "").toLocaleLowerCase("es").includes(q);

  let occs = Store.occurrences().filter((o) => matches(o.name) || matches(Store.categoryName(o.category)));
  let movs = Store.movements().filter((m) => matches(m.concept) || matches(m.note) || matches(Store.categoryName(m.category)));

  switch (filter) {
    case "pending":
      occs = occs.filter((o) => o.status === STATUS.PENDING);
      movs = [];
      break;
    case "paid":
      occs = occs.filter((o) => o.status === STATUS.PAID || o.status === STATUS.RECEIVED);
      break;
    case "overdue":
      occs = occs.filter((o) => o.status === STATUS.PENDING && o.dueDate < today);
      movs = [];
      break;
    case "income":
      occs = occs.filter((o) => o.kind === KIND.INCOME);
      movs = movs.filter((m) => m.type === "income");
      break;
    case "expense":
      occs = occs.filter((o) => o.kind === KIND.EXPENSE);
      movs = movs.filter((m) => m.type === "expense" && m.kind !== KIND.DEBT && m.kind !== KIND.HEAVY);
      break;
    case "debt":
      occs = occs.filter((o) => o.kind === KIND.DEBT);
      movs = movs.filter((m) => m.kind === KIND.DEBT || m.kind === KIND.HEAVY);
      break;
    default:
      break;
  }

  const items = q
    ? Store.items().filter((i) => i.active && (matches(i.name) || matches(Store.categoryName(i.category))))
    : [];

  return {
    items,
    occurrences: occs.sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1)).slice(0, 60),
    movements: movs.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60),
  };
}

/** Resumen mensual por concepto para la pantalla de "Resumen del mes". */
export function monthDetail(iso) {
  const ref = iso || todayISO();
  const from = startOfMonth(ref);
  const to = endOfMonth(ref);
  return {
    key: monthKey(ref),
    from,
    to,
    income: incomeBreakdown(from, to),
    expense: categoryBreakdown(from, to),
    summary: summaryBetween(from, to),
  };
}
