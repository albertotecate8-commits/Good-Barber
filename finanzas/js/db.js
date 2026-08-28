// Capa de IndexedDB. Sin servidor, sin cuentas: todo vive en el dispositivo.
// Si IndexedDB no está disponible (modo privado antiguo, permisos), la app
// sigue funcionando en memoria y avisa que los datos no se guardarán.

const DB_NAME = "mis-finanzas";
const DB_VERSION = 2; // v2: agrega el store "cuts" (cortes semanales cerrados)

export const STORES = ["items", "occurrences", "movements", "categories", "meta", "cuts"];

let dbPromise = null;
let unavailableReason = null;

export function isUnavailable() {
  return unavailableReason;
}

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined" || !indexedDB) {
      reject(new Error("Este navegador no permite guardar datos localmente."));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = (event) => {
      const db = request.result;

      if (!db.objectStoreNames.contains("items")) {
        const items = db.createObjectStore("items", { keyPath: "id" });
        items.createIndex("kind", "kind", { unique: false });
      }

      if (!db.objectStoreNames.contains("occurrences")) {
        const occ = db.createObjectStore("occurrences", { keyPath: "id" });
        occ.createIndex("itemId", "itemId", { unique: false });
        occ.createIndex("dueDate", "dueDate", { unique: false });
        occ.createIndex("status", "status", { unique: false });
        occ.createIndex("itemDue", ["itemId", "dueDate"], { unique: false });
      }

      if (!db.objectStoreNames.contains("movements")) {
        const mov = db.createObjectStore("movements", { keyPath: "id" });
        mov.createIndex("date", "date", { unique: false });
        mov.createIndex("itemId", "itemId", { unique: false });
        mov.createIndex("occurrenceId", "occurrenceId", { unique: false });
      }

      if (!db.objectStoreNames.contains("categories")) {
        db.createObjectStore("categories", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains("cuts")) {
        const cuts = db.createObjectStore("cuts", { keyPath: "id" });
        cuts.createIndex("startDate", "startDate", { unique: false });
      }

      void event;
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };

    request.onerror = () => reject(request.error || new Error("No se pudo abrir la base local."));
    request.onblocked = () => reject(new Error("Hay otra pestaña de la app abierta. Ciérrala y recarga."));
  }).catch((err) => {
    unavailableReason = err.message || "No se pudo abrir el almacenamiento local.";
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/** Intenta abrir la base. Devuelve true si quedó disponible. */
export async function init() {
  try {
    await openDB();
    unavailableReason = null;
    return true;
  } catch (err) {
    return false;
  }
}

/** Lee todos los registros de un store. */
export async function getAll(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readonly");
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/** Guarda (crea o reemplaza) uno o varios registros. */
export async function put(store, records) {
  const list = Array.isArray(records) ? records : [records];
  if (!list.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    list.forEach((record) => os.put(record));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Borra registros por id. */
export async function remove(store, ids) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    list.forEach((id) => os.delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Vacía varios stores en una sola transacción. */
export async function clearAll(storeNames) {
  const names = storeNames || STORES;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, "readwrite");
    names.forEach((name) => t.objectStore(name).clear());
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/**
 * Reemplaza el contenido completo de la base en UNA sola transacción.
 * Se usa al importar un respaldo: o entra todo, o no entra nada.
 */
export async function replaceAll(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES, "readwrite");
    STORES.forEach((name) => {
      const os = t.objectStore(name);
      os.clear();
      const records = data[name] || [];
      records.forEach((record) => os.put(record));
    });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Espacio usado/disponible aproximado, si el navegador lo reporta. */
export async function storageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      return await navigator.storage.estimate();
    }
  } catch (err) {
    /* ignorado */
  }
  return null;
}

/** Pide al navegador que no borre los datos por falta de espacio. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (err) {
    /* ignorado */
  }
  return false;
}
