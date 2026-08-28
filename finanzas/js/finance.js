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
  addMonths, parseISO, MONTHS_SHORT, DOW_SHORT, monthKey, startOfCut, endOfCut,
} from "./dates.js";
import { round2 } from "./format.js";

const EXPENSE_KINDS = [KIND.EXPENSE, KIND.DEBT];

export function isExpenseKind(kind) {
  return EXPENSE_KINDS.includes(kind);
}

/**
 * Estado visual de un vencimiento: paid | received | overdue | pending.
 * Un vencimiento que vence HOY ya cuenta como vencido (urgente, hay que
 * cubrirlo ya) — por eso "Próximos 7 días" empieza mañana, no hoy.
 */
export function statusOf(occ, today) {
  const ref = today || todayISO();
  if (occ.status === STATUS.PAID) return "paid";
  if (occ.status === STATUS.RECEIVED) return "received";
  if (occ.dueDate <= ref) return "overdue";
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

/** Pagos vencidos: su fecha ya llegó (hoy incluido) y siguen sin pagarse. */
export function overduePayments() {
  return pendingPayments({ until: todayISO() });
}

/**
 * Cuánto se ha abonado ya a un vencimiento pendiente y cuánto falta —
 * soporte de pagos parciales. Para uno ya resuelto, "pagado" es lo que
 * realmente se pagó y no queda nada pendiente.
 */
export function occurrenceProgress(occ) {
  if (occ.status !== STATUS.PENDING) {
    return { paid: occ.paidAmount != null ? occ.paidAmount : occ.amount, remaining: 0 };
  }
  const paid = Store.paidSoFar(occ.id);
  return { paid, remaining: round2(Math.max(0, occ.amount - paid)) };
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

/**
 * Tarjeta "Próximos 7 días": del día de mañana al séptimo día contando desde
 * hoy. NUNCA incluye vencidos — esos van aparte, en "Pagos vencidos".
 */
export function next7Days() {
  const today = todayISO();
  const from = addDays(today, 1);
  const until = addDays(today, 7);
  const list = pendingPayments({ from, until });
  const needed = round2(list.reduce((sum, o) => sum + o.amount, 0));
  const available = Store.availableMoney();
  const expected = round2(pendingIncomes({ from, until }).reduce((s, o) => s + o.amount, 0));

  return {
    from,
    until,
    list,
    needed,
    available,
    expected,
    isEnough: available >= needed,
    missing: round2(Math.max(0, needed - available)),
  };
}

/**
 * Fotografía de lo pendiente para el dashboard: vencido (hoy incluido) +
 * próximos 7 días. No mezcla con lo que vence más adelante en el mes.
 */
export function pendingSnapshot() {
  const overdue = overduePayments();
  const upcoming = next7Days();
  const overdueTotal = round2(overdue.reduce((s, o) => s + o.amount, 0));
  return {
    overdue,
    overdueTotal,
    upcoming: upcoming.list,
    upcomingTotal: upcoming.needed,
    total: round2(overdueTotal + upcoming.needed),
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

/**
 * Cuánto hay comprometido por categoría ahora mismo: la suma de los montos
 * configurados de los conceptos activos (el saldo, para deudas fuertes). No
 * es historial pagado — es "cuánto tengo comprometido", útil para planear.
 */
export function categoryCommitment() {
  const totals = new Map();
  const counts = new Map();

  Store.items().forEach((item) => {
    if (!item.active) return;
    const amount = item.kind === KIND.HEAVY ? item.balance || 0 : item.amount;
    totals.set(item.category, round2((totals.get(item.category) || 0) + amount));
    counts.set(item.category, (counts.get(item.category) || 0) + 1);
  });

  return Store.categories()
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      type: c.type,
      total: totals.get(c.id) || 0,
      count: counts.get(c.id) || 0,
    }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total);
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
      occs = occs.filter((o) => o.status === STATUS.PENDING && o.dueDate <= today);
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

/* ==================================================== Cortes semanales ==== */

/** Ingresos que pertenecen al corte sábado-viernes (sin fecha fija propia). */
export function cutIncomeItems() {
  return Store.items().filter((i) => i.active && i.kind === KIND.INCOME && i.cutBased);
}

/**
 * Ventana del corte activo: la que contiene a hoy, salvo que ya se haya
 * cerrado por adelantado — en ese caso el corte activo es el siguiente.
 */
export function activeCutRange() {
  let start = startOfCut(todayISO());
  Store.closedCuts().forEach((c) => {
    if (c.startDate >= start) {
      const after = addDays(c.endDate, 1);
      if (after > start) start = after;
    }
  });
  return { start, end: endOfCut(start) };
}

/**
 * Esperado y recibido de los ingresos de corte dentro de un rango de fechas.
 * Solo cuenta lo registrado explícitamente contra ese concepto (itemId) —
 * un ingreso rápido suelto, aunque comparta categoría, no se mete al corte
 * por accidente.
 */
export function cutBreakdown(range) {
  const incomeItems = cutIncomeItems();
  const inRange = (m) => m.type === "income" && m.date >= range.start && m.date <= range.end;

  const rows = incomeItems.map((item) => {
    const received = round2(
      Store.movements()
        .filter(inRange)
        .filter((m) => m.itemId === item.id)
        .reduce((s, m) => s + m.amount, 0)
    );
    return { item, expected: item.amount, received };
  });

  const expected = round2(rows.reduce((s, r) => s + r.expected, 0));
  const received = round2(rows.reduce((s, r) => s + r.received, 0));
  return { range, rows, expected, received, missing: round2(Math.max(0, expected - received)) };
}

/** Cortes cerrados, del más reciente al más antiguo. */
export function cutHistory() {
  return Store.closedCuts();
}

/** Resumen semanal — Inicio y la pantalla de corte comparten la lógica. */
export function activeCutSummary() {
  const range = activeCutRange();
  const breakdown = cutBreakdown(range);
  const period = summaryBetween(range.start, range.end);
  return { ...breakdown, period };
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
