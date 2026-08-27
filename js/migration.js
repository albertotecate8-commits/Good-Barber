// Migración de datos antiguos guardados en localStorage (goodbarber_datos_v1)
// hacia Supabase. No borra nada automáticamente ni corre sola: el admin
// la dispara manualmente desde el panel y ve un resumen antes de confirmar.

import * as data from "./data.js";
import { toCents } from "./money.js";
import { toISODate, parseISODate, DIAS } from "./dates.js";

const STORAGE_KEY = "goodbarber_datos_v1";

const LEGACY_SERVICES = [
  { id: "corte", nombre: "Corte de cabello", precio: 120 },
  { id: "barba", nombre: "Arreglo de barba", precio: 50 },
  { id: "ceja", nombre: "Arreglo de ceja", precio: 30 },
  { id: "corte_barba", nombre: "Corte + barba", precio: 170 },
  { id: "corte_cejas", nombre: "Corte + cejas", precio: 150 },
  { id: "corte_barba_cejas", nombre: "Corte + barba + cejas", precio: 199 },
];

const DIA_OFFSET = { Lunes: 0, Martes: 1, Miércoles: 2, Jueves: 3, Viernes: 4, Sábado: 5 };

export function readLegacyData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function summarizeLegacyData(db) {
  if (!db) return { weeks: 0, cuts: 0 };
  return {
    weeks: Object.keys(db.semanas || {}).length,
    cuts: Object.keys(db.cortes || {}).length,
  };
}

// barberNameToId: { "Alberto": barberUuid, "Joaquín": barberUuid }
export async function migrateLegacyData(db, barberNameToId, { createdBy } = {}) {
  const report = { weeksImported: 0, recordsCreated: 0, cutsImported: 0, skipped: [] };

  for (const [key, weekData] of Object.entries(db.semanas || {})) {
    const [barberName, weekStartISO] = key.split("|");
    const barberId = barberNameToId[barberName];
    if (!barberId) {
      report.skipped.push(`Semana ${key}: barbero "${barberName}" no mapeado.`);
      continue;
    }
    const weekStart = parseISODate(weekStartISO);

    for (const dia of DIAS) {
      const dayData = weekData[dia];
      if (!dayData) continue;
      const offset = DIA_OFFSET[dia] ?? 0;
      const recordDate = new Date(weekStart);
      recordDate.setDate(recordDate.getDate() + offset);
      const recordDateISO = toISODate(recordDate);

      for (const legacyService of LEGACY_SERVICES) {
        const qty = Number(dayData.servicios?.[legacyService.id] || 0);
        for (let i = 0; i < qty; i++) {
          try {
            await data.createServiceRecord({
              barberId,
              clientId: null,
              service: { id: null, name: legacyService.nombre, price_cents: toCents(legacyService.precio) },
              discountCents: 0,
              notes: `Migrado automáticamente (semana ${weekStartISO}, ${dia})`,
              createdBy,
            });
            report.recordsCreated++;
          } catch (error) {
            report.skipped.push(`${key} ${dia} ${legacyService.nombre}: ${error.message}`);
          }
        }
      }

      const promo = Number(dayData.promocion || 0);
      if (promo > 0) {
        try {
          await data.upsertDailyPromotion(barberId, recordDateISO, toCents(promo));
        } catch (error) {
          report.skipped.push(`Promoción ${key} ${dia}: ${error.message}`);
        }
      }
    }
    report.weeksImported++;
  }

  for (const [key, corte] of Object.entries(db.cortes || {})) {
    const barberId = barberNameToId[corte.barbero];
    if (!barberId) {
      report.skipped.push(`Corte ${key}: barbero "${corte.barbero}" no mapeado.`);
      continue;
    }
    const weekStart = parseISODate(corte.semana_inicio);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 5);
    try {
      const period = await data.getOrCreateWeeklyPeriod(barberId, corte.semana_inicio, toISODate(weekEnd));
      await data.setWeeklyPeriodStatus(period.id, "closed");
      await data.upsertSettlement({
        weekly_period_id: period.id,
        barber_id: barberId,
        week_start_date: corte.semana_inicio,
        week_end_date: toISODate(weekEnd),
        total_cents: toCents(corte.total_semanal),
        extra_adjustment_cents: toCents(corte.pago_extra || 0),
        barber_percentage: 60,
        barber_share_cents: toCents(corte.trabajador_60),
        business_share_cents: toCents(corte.good_barber_40),
        status: "completed",
      });
      report.cutsImported++;
    } catch (error) {
      report.skipped.push(`Corte ${key}: ${error.message}`);
    }
  }

  return report;
}
