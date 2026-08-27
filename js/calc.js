// Reglas de negocio: cálculo de totales, reparto 60/40 y cortes.
// Conserva exactamente la lógica original: suma de servicios del día,
// menos un descuento plano del día, sin bajar de $0; reparto configurable
// (60% barbero / 40% Good Barber por defecto).

import { clampNonNegative, splitCents } from "./money.js";

export function recordLineTotalCents(record) {
  return record.price_cents * (record.quantity || 1) - (record.discount_cents || 0);
}

export function recordsTotalCents(records) {
  return records.filter((r) => r.status === "completed").reduce((sum, r) => sum + recordLineTotalCents(r), 0);
}

export function dayTotalCents(records, dailyPromotionCents = 0) {
  const gross = recordsTotalCents(records);
  return clampNonNegative(gross - dailyPromotionCents);
}

export function weekTotalCents(recordsByDay, promotionsByDay) {
  return Object.keys(recordsByDay).reduce((sum, dateISO) => {
    const promo = promotionsByDay[dateISO] || 0;
    return sum + dayTotalCents(recordsByDay[dateISO], promo);
  }, 0);
}

export function groupRecordsByDate(records) {
  const map = {};
  for (const r of records) {
    if (!map[r.record_date]) map[r.record_date] = [];
    map[r.record_date].push(r);
  }
  return map;
}

export function settlementBreakdown({ totalCents, extraAdjustmentCents = 0, barberPercentage = 60 }) {
  const finalTotal = totalCents + extraAdjustmentCents;
  const { barberShare, businessShare } = splitCents(finalTotal, barberPercentage);
  return { finalTotal, barberShare, businessShare };
}
