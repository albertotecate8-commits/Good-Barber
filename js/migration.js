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

// Antes de migrar hay que avisar si ya se importó esto mismo (evita duplicar
// servicios si el admin ejecuta la migración dos veces por error).
export async function checkAlreadyMigrated(barberIds) {
  const count = await data.countMigratedRecords(barberIds);
  return count > 0 ? count : 0;
}

// barberNameToId: { "Alberto": barberUuid, "Joaquín": barberUuid }
// liveServices: catálogo real ya creado en Supabase (data.listServices(false)),
// usado para resolver el service_id real de cada servicio del catálogo legado
// por nombre — service_records.service_id es NOT NULL, así que un servicio sin
// coincidencia en el catálogo actual se omite en vez de fallar la inserción.
export async function migrateLegacyData(db, barberNameToId, liveServices) {
  const report = { weeksImported: 0, recordsCreated: 0, cutsImported: 0, skipped: [] };

  const serviceIdByName = {};
  for (const s of liveServices) serviceIdByName[s.name] = s.id;

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
        if (qty <= 0) continue;

        const realServiceId = serviceIdByName[legacyService.nombre];
        if (!realServiceId) {
          report.skipped.push(
            `${key} ${dia} ${legacyService.nombre}: no se encontró ese servicio en el catálogo actual (¿fue renombrado o eliminado?). Se omitieron ${qty} registro(s).`
          );
          continue;
        }

        for (let i = 0; i < qty; i++) {
          try {
            await data.createServiceRecord({
              barberId,
              clientId: null,
              service: { id: realServiceId, name: legacyService.nombre, price_cents: toCents(legacyService.precio) },
              discountCents: 0,
              notes: `Migrado automáticamente (semana ${weekStartISO}, ${dia})`,
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
      await data.closeWeeklySettlement({
        barberId,
        weekStart: corte.semana_inicio,
        weekEnd: toISODate(weekEnd),
        totalCents: toCents(corte.total_semanal),
        extraAdjustmentCents: toCents(corte.pago_extra || 0),
        barberPercentage: 60,
        barberShareCents: toCents(corte.trabajador_60),
        businessShareCents: toCents(corte.good_barber_40),
      });
      report.cutsImported++;
    } catch (error) {
      report.skipped.push(`Corte ${key}: ${error.message}`);
    }
  }

  return report;
}
