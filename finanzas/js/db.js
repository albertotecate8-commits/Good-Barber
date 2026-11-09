// Capa de persistencia de Mis Finanzas — antes IndexedDB (en el dispositivo),
// ahora Supabase (proyecto remoto dedicado solo a Finanzas, separado del de
// la barbería). La API pública es EXACTAMENTE la misma que antes (init,
// getAll, put, remove, clearAll, replaceAll, storageEstimate,
// requestPersistence, isUnavailable) a propósito: store.js y el resto de la
// app no necesitan saber de dónde vienen los datos.
//
// Sin login: el cliente usa la clave pública (anon) de supabase-config.js.
// Las políticas RLS del proyecto permiten acceso completo con esa clave.

export const STORES = ["items", "occurrences", "movements", "categories", "meta", "cuts", "businesses"];

const PRIMARY_KEY = {
  items: "id",
  occurrences: "id",
  movements: "id",
  categories: "id",
  cuts: "id",
  meta: "key",
  businesses: "id",
  profiles: "id",
};

// Solo se listan los campos cuyo nombre cambia entre JS (camelCase) y la
// columna SQL (snake_case). Los que se llaman igual no necesitan entrada.
const FIELD_MAPS = {
  items: {
    startDate: "start_date", anchorDay: "anchor_day", cutBased: "cut_based",
    statusNote: "status_note", canceledAt: "canceled_at", businessId: "business_id",
    createdBy: "created_by", createdAt: "created_at", updatedAt: "updated_at",
  },
  occurrences: {
    itemId: "item_id", dueDate: "due_date", paidAmount: "paid_amount",
    paidDate: "paid_date", movementId: "movement_id", businessId: "business_id",
    createdAt: "created_at",
  },
  movements: {
    itemId: "item_id", occurrenceId: "occurrence_id", businessId: "business_id",
    balanceBefore: "balance_before", balanceAfter: "balance_after",
    createdBy: "created_by", createdAt: "created_at",
  },
  categories: { businessId: "business_id" },
  cuts: { startDate: "start_date", endDate: "end_date", closedAt: "closed_at" },
  businesses: {},
  profiles: { createdAt: "created_at" },
};

// Columnas "numeric" de Postgres: postgrest las devuelve como texto para no
// perder precisión — hay que convertirlas a Number aquí (la app ya redondea
// con round2() en todos lados, igual que hacía con los floats de IndexedDB).
const NUMERIC_FIELDS = {
  items: ["amount", "balance"],
  occurrences: ["amount", "paidAmount"],
  movements: ["amount", "balanceBefore", "balanceAfter"],
  cuts: ["expected", "received", "difference"],
  categories: [],
};

function toRow(store, record) {
  if (store === "meta") return { key: record.key, value: record.value };
  const map = FIELD_MAPS[store] || {};
  const row = {};
  Object.entries(record).forEach(([key, value]) => {
    row[map[key] || key] = value === undefined ? null : value;
  });
  return row;
}

function fromRow(store, row) {
  if (store === "meta") return { key: row.key, value: row.value };
  const map = FIELD_MAPS[store] || {};
  const invert = {};
  Object.entries(map).forEach(([camel, snake]) => { invert[snake] = camel; });

  const record = {};
  Object.entries(row).forEach(([col, value]) => {
    record[invert[col] || col] = value;
  });

  (NUMERIC_FIELDS[store] || []).forEach((field) => {
    if (record[field] != null) record[field] = Number(record[field]);
  });

  return record;
}

let unavailableReason = null;

export function isUnavailable() {
  return unavailableReason;
}

function client() {
  if (typeof window !== "undefined" && window.supabaseClient) return window.supabaseClient;
  throw new Error("No se pudo conectar con Supabase: el cliente no está inicializado.");
}

/** Intenta conectar. Devuelve true si el servidor respondió correctamente. */
export async function init() {
  try {
    const { error } = await client().from("meta").select("key").limit(1);
    if (error) throw error;
    unavailableReason = null;
    return true;
  } catch (err) {
    unavailableReason = err.message || "No se pudo conectar con el servidor.";
    return false;
  }
}

/** Lee todos los registros de una tabla. */
export async function getAll(store) {
  const { data, error } = await client().from(store).select("*");
  if (error) throw error;
  return (data || []).map((row) => fromRow(store, row));
}

/** Guarda (crea o reemplaza) uno o varios registros. */
export async function put(store, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return;
  const rows = list.map((r) => toRow(store, r));
  const { error } = await client().from(store).upsert(rows, { onConflict: PRIMARY_KEY[store] });
  if (error) throw error;
}

/** Borra registros por id (o por "key" en meta). */
export async function remove(store, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  const { error } = await client().from(store).delete().in(PRIMARY_KEY[store], list);
  if (error) throw error;
}

/** Vacía una o varias tablas. */
export async function clearAll(storeNames) {
  const names = storeNames || STORES;
  for (const name of names) {
    const { error } = await client().from(name).delete().not(PRIMARY_KEY[name], "is", null);
    if (error) throw error;
  }
}

/**
 * Reemplaza el contenido completo de la base. Se usa al importar un
 * respaldo. Supabase no ofrece transacciones multi-tabla desde el cliente
 * (a diferencia de la IndexedDB original), así que esto vacía y vuelve a
 * llenar tabla por tabla — no es 100% atómico, pero es una acción explícita
 * y poco frecuente del usuario (importar un .json), nunca automática.
 */
export async function replaceAll(data) {
  await clearAll();
  for (const name of STORES) {
    const records = data[name] || [];
    if (records.length) await put(name, records);
  }
}

/** No aplica con un backend remoto (ya no hay cuota de almacenamiento local que medir). */
export async function storageEstimate() {
  return null;
}

/** Los datos ya viven en un servidor, no en el navegador — nada que persistir aquí. */
export async function requestPersistence() {
  return true;
}
