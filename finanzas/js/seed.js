// Datos iniciales — exactamente los que se proporcionaron, sin agregar nada.
//
// Reglas seguidas:
//  · Los conceptos que traían fecha explícita la conservan tal cual.
//  · Los que solo traían una regla ("día 23 de cada mes", "por semana",
//    "por mes") se anclan a partir de hoy, sin inventar una fecha del pasado.
//  · Los que NO traían fecha (Gas, Comida, Gasolina, Afores) quedan SIN fecha:
//    la app los muestra como "sin programar" y se puede fijar la fecha después.

import { KIND, makeItem } from "./model.js";
import { todayISO, parseISO, toISO, daysInMonth, addMonths, addDays } from "./dates.js";

/**
 * Ingresos que pertenecen al corte semanal (sábado a viernes) en vez de a un
 * día fijo del calendario: no tienen "startDate" ni vencimiento propio.
 */
export const CUT_BASED_ITEM_IDS = ["ing-barberia", "ing-unas"];

/** Primer día `day` del mes que caiga en hoy o después. */
function nextMonthDayFrom(today, day) {
  const d = parseISO(today);
  const max = daysInMonth(d.getFullYear(), d.getMonth());
  const candidate = new Date(d.getFullYear(), d.getMonth(), Math.min(day, max), 12);
  if (toISO(candidate) >= today) return toISO(candidate);
  const nm = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
  const max2 = daysInMonth(nm.getFullYear(), nm.getMonth());
  return toISO(new Date(nm.getFullYear(), nm.getMonth(), Math.min(day, max2), 12));
}

/**
 * Evita arrastrar decenas de vencimientos vencidos si la app se estrena mucho
 * después de la fecha configurada: adelanta la fecha por periodos completos
 * hasta dejar como máximo un vencimiento vencido reciente.
 */
function notTooOld(date, recurrence, today) {
  if (!date) return null;
  const limit = addDays(today, -45);
  if (date >= limit) return date;
  const anchor = parseISO(date) ? parseISO(date).getDate() : null;
  let cursor = date;
  let guard = 0;
  while (cursor < limit && guard < 400) {
    const rec = { weekly: 7, biweekly: 14, triweekly: 21 }[recurrence];
    if (rec) cursor = addDays(cursor, rec);
    else if (recurrence === "monthly") cursor = addMonths(cursor, 1, anchor);
    else if (recurrence === "bimonthly") cursor = addMonths(cursor, 2, anchor);
    else if (recurrence === "quarterly") cursor = addMonths(cursor, 3, anchor);
    else return date; // "una sola vez": no se mueve
    guard += 1;
  }
  return cursor;
}

export function buildSeed(todayOverride) {
  const today = todayOverride || todayISO();
  const items = [];

  const add = (data) => {
    const startDate = notTooOld(data.startDate || null, data.recurrence, today);
    const anchor = data.anchorDay || (startDate ? parseISO(startDate).getDate() : null);
    items.push(makeItem({ ...data, startDate, anchorDay: anchor, seeded: true }));
  };

  // ------------------------------------------------------------------ CASA --
  add({ id: "casa-internet", kind: KIND.EXPENSE, name: "Internet", category: "casa",
        amount: 300, recurrence: "monthly", startDate: "2026-08-10", reference: "0320443116" });
  add({ id: "casa-luz", kind: KIND.EXPENSE, name: "Luz", category: "casa",
        amount: 399, recurrence: "monthly", startDate: "2026-09-04" });
  add({ id: "casa-gas", kind: KIND.EXPENSE, name: "Gas", category: "casa",
        amount: 100, recurrence: "triweekly", startDate: null });
  add({ id: "casa-comida", kind: KIND.EXPENSE, name: "Comida", category: "casa",
        amount: 6000, recurrence: "monthly", startDate: null });
  add({ id: "casa-gasolina", kind: KIND.EXPENSE, name: "Gasolina", category: "casa",
        amount: 1000, recurrence: "monthly", startDate: null });

  // ----------------------------------------------------------------- LOCAL --
  add({ id: "local-agua", kind: KIND.EXPENSE, name: "Agua", category: "local",
        amount: 175, recurrence: "monthly", startDate: "2026-09-21" });
  add({ id: "local-luz", kind: KIND.EXPENSE, name: "Luz", category: "local",
        amount: 1244, recurrence: "bimonthly", startDate: "2026-08-31", anchorDay: 31 });
  add({ id: "local-renta", kind: KIND.EXPENSE, name: "Renta", category: "local",
        amount: 3500, recurrence: "monthly", startDate: "2026-09-06" });
  add({ id: "local-internet", kind: KIND.EXPENSE, name: "Internet", category: "local",
        amount: 400, recurrence: "monthly", startDate: nextMonthDayFrom(today, 23), anchorDay: 23 });

  // ---------------------------------------------------------------- DEUDAS --
  add({ id: "deuda-vexi", kind: KIND.DEBT, name: "Vexi", category: "deudas",
        amount: 1429, recurrence: "monthly", startDate: "2026-09-18", variable: true });
  add({ id: "deuda-plata", kind: KIND.DEBT, name: "Plata", category: "deudas",
        amount: 810, recurrence: "monthly", startDate: "2026-09-23", variable: true });
  add({ id: "deuda-carro", kind: KIND.DEBT, name: "Carro", category: "deudas",
        amount: 5538, recurrence: "monthly", startDate: "2026-09-16" });
  add({ id: "deuda-mercadolibre", kind: KIND.DEBT, name: "Mercado Libre", category: "deudas",
        amount: 2789, recurrence: "monthly", startDate: "2026-09-01", variable: true });
  add({ id: "deuda-open", kind: KIND.DEBT, name: "Open", category: "deudas",
        amount: 1172, recurrence: "monthly", startDate: "2026-09-02", variable: true });

  // -------------------------------------------------------- SUSCRIPCIONES --
  add({ id: "sus-claude", kind: KIND.EXPENSE, name: "Claude", category: "suscripciones",
        amount: 349, recurrence: "monthly", startDate: "2026-08-20" });
  add({ id: "sus-gemini", kind: KIND.EXPENSE, name: "Gemini", category: "suscripciones",
        amount: 99, recurrence: "monthly", startDate: "2026-09-04" });
  add({ id: "sus-chatgpt", kind: KIND.EXPENSE, name: "ChatGPT", category: "suscripciones",
        amount: 129, recurrence: "monthly", startDate: "2026-09-05" });
  add({ id: "sus-youtube", kind: KIND.EXPENSE, name: "YouTube", category: "suscripciones",
        amount: 160, recurrence: "monthly", startDate: "2026-09-24" });
  add({ id: "sus-netflix", kind: KIND.EXPENSE, name: "Netflix", category: "suscripciones",
        amount: 130, recurrence: "monthly", startDate: "2026-09-12" });
  add({ id: "sus-gamepass", kind: KIND.EXPENSE, name: "Game Pass", category: "suscripciones",
        amount: 160, recurrence: "monthly", startDate: "2026-09-25" });

  // -------------------------------------------------------- DEUDAS FUERTES --
  // No generan pagos mensuales automáticos: son saldos que se abonan cuando se puede.
  add({ id: "fuerte-denisse", kind: KIND.HEAVY, name: "Denisse", category: "fuertes",
        amount: 0, balance: 35800, recurrence: "once", startDate: null,
        statusNote: "Esperando Afores" });
  add({ id: "fuerte-bbva", kind: KIND.HEAVY, name: "BBVA", category: "fuertes",
        amount: 0, balance: 18835, recurrence: "once", startDate: null,
        statusNote: "Esperando la quita" });

  // -------------------------------------------------------------- INGRESOS --
  // Barbería y Uñas son ingresos del corte semanal (sábado a viernes): no
  // tienen un día fijo inventado, se registran dentro de la semana que caiga.
  add({ id: "ing-barberia", kind: KIND.INCOME, name: "Barbería", category: "barberia",
        amount: 300, recurrence: "weekly", startDate: null, variable: true, cutBased: true });
  add({ id: "ing-unas", kind: KIND.INCOME, name: "Uñas", category: "unas",
        amount: 5400, recurrence: "weekly", startDate: null, variable: true, cutBased: true });
  add({ id: "ing-rentas", kind: KIND.INCOME, name: "Rentas", category: "rentas",
        amount: 5000, recurrence: "monthly", startDate: nextMonthDayFrom(today, 1), anchorDay: 1 });
  add({ id: "ing-afores", kind: KIND.INCOME, name: "Afores", category: "afores",
        amount: 26051, recurrence: "once", startDate: null,
        statusNote: "Cobrar en septiembre" });

  return items;
}
