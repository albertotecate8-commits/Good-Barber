// Datos iniciales — exactamente los que se proporcionaron, sin agregar nada.
//
// Reglas seguidas:
//  · Los conceptos que traían fecha explícita la conservan tal cual.
//  · Los que solo traían una regla ("día 6 de cada mes") se anclan a partir
//    de hoy, sin inventar una fecha del pasado.
//  · Los que NO traían día (Internet, Luz y Comida de la casa) quedan SIN
//    fecha: la app los muestra como "sin programar" y se puede fijar después.
//  · Barbería y Uñas no son conceptos fijos: cada entrada se registra con su
//    total en el momento (Inicio → Barbería / Uñas).

import { KIND, makeItem } from "./model.js";
import { todayISO, parseISO, toISO, daysInMonth, addMonths, addDays } from "./dates.js";

/**
 * Ingresos que pertenecen al corte semanal (domingo a sábado) en vez de a un
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

  // ----------------------------------------------------------------- LOCAL --
  // Suman ≈ $4,755 al mes (renta + internet + la mitad de luz y de agua,
  // que son cada 2 meses) — por eso hay que apartar $1,100 por semana.
  add({ id: "local-renta", kind: KIND.EXPENSE, name: "Renta", category: "local",
        amount: 3500, recurrence: "monthly", startDate: nextMonthDayFrom(today, 6), anchorDay: 6 });
  add({ id: "local-luz", kind: KIND.EXPENSE, name: "Luz", category: "local",
        amount: 1000, recurrence: "bimonthly", startDate: "2027-01-01", anchorDay: 1 });
  add({ id: "local-agua", kind: KIND.EXPENSE, name: "Agua", category: "local",
        amount: 350, recurrence: "bimonthly", startDate: "2026-12-21", anchorDay: 21 });
  add({ id: "local-internet", kind: KIND.EXPENSE, name: "Internet", category: "local",
        amount: 580, recurrence: "monthly", startDate: nextMonthDayFrom(today, 24), anchorDay: 24 });

  // ------------------------------------------------------------------ CASA --
  add({ id: "casa-internet", kind: KIND.EXPENSE, name: "Internet", category: "casa",
        amount: 300, recurrence: "monthly", startDate: null });
  add({ id: "casa-luz", kind: KIND.EXPENSE, name: "Luz", category: "casa",
        amount: 400, recurrence: "monthly", startDate: null });
  add({ id: "casa-comida", kind: KIND.EXPENSE, name: "Comida", category: "casa",
        amount: 2000, recurrence: "weekly", startDate: null });

  // -------------------------------------------------------------- AFORES --
  // El monto se escribe desde Inicio cuando se sepa cuánto se va a recibir.
  add({ id: "ing-afores", kind: KIND.INCOME, name: "Afores", category: "afores", businessId: "afores",
        amount: 0, recurrence: "once", startDate: null });

  return items;
}
