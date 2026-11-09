// Estado de la aplicación y toda la lógica de negocio.
// Los datos viven en Supabase (proyecto remoto dedicado a Finanzas); aquí se
// mantiene una copia en memoria para que la interfaz pueda leerlos de forma
// síncrona (el volumen es pequeño).

import * as db from "./db.js";
import {
  KIND, STATUS, DEFAULT_CATEGORIES, DEFAULT_BUSINESSES,
  makeItem, makeOccurrence, makeMovement, makeProfile, signedAmount,
} from "./model.js";
import { buildSeed, CUT_BASED_ITEM_IDS } from "./seed.js";
import { todayISO, addDays, addMonths, isValidISO, RECURRENCES } from "./dates.js";
import { round2 } from "./format.js";

const state = {
  items: new Map(),
  occurrences: new Map(),
  movements: new Map(),
  categories: new Map(),
  businesses: new Map(),
  profiles: new Map(),
  meta: new Map(),
  cuts: new Map(),
  session: null, // sesión de Supabase Auth (null = no hay login)
  ready: false,
  persistent: true, // false = no hay conexión con Supabase, se trabaja solo en memoria
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error("Error al refrescar la vista:", err);
    }
  });
}

export function isPersistent() {
  return state.persistent;
}

function uid(prefix) {
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return `${prefix}_${rand}`;
}

/* ====================================================== Autenticación ==== */
// Dos perfiles: Administrador y Colaborador (p. ej. tú y tu pareja), cada
// quien entra desde su propio teléfono con su correo. El primero que se
// registra queda como admin automáticamente (lo hace un trigger en la base);
// el resto, colaborador. Ambos ven exactamente los mismos datos.

function sb() {
  if (typeof window !== "undefined" && window.supabaseClient) return window.supabaseClient;
  throw new Error("No se pudo conectar con Supabase.");
}

function currentUserId() {
  return state.session ? state.session.user.id : null;
}

export function currentUser() {
  return state.session ? state.session.user : null;
}

export function currentProfile() {
  const id = currentUserId();
  return id ? state.profiles.get(id) || null : null;
}

export function isAdmin() {
  const p = currentProfile();
  return !!p && p.role === "admin";
}

/** Nombre a mostrar de quién registró algo ("Registrado por…"). */
export function profileName(userId) {
  if (!userId) return "";
  const p = state.profiles.get(userId);
  if (p && p.name) return p.name;
  if (p && p.email) return p.email;
  return "Alguien";
}

async function loadProfiles() {
  try {
    const rows = await db.getAll("profiles");
    state.profiles = new Map(
      rows.filter((r) => !r.isTest).map((r) => [r.id, makeProfile(r)])
    );
  } catch (err) {
    console.error("No se pudieron leer los perfiles:", err);
  }
}

/**
 * Arranca la escucha de sesión. Se llama SIEMPRE al abrir la app, antes de
 * decidir si se muestra el login o la app — por eso vive aparte de init().
 */
export async function initAuth(onChange) {
  const { data } = await sb().auth.getSession();
  state.session = data.session || null;

  sb().auth.onAuthStateChange((_event, session) => {
    const had = !!state.session;
    state.session = session || null;
    if (onChange) onChange(state.session, had);
    emit();
  });

  return state.session;
}

export async function signUp({ email, password, name }) {
  const { error } = await sb().auth.signUp({
    email: String(email || "").trim(),
    password,
    options: { data: { name: String(name || "").trim() } },
  });
  if (error) throw new Error(traducirErrorAuth(error));
}

export async function signIn({ email, password }) {
  const { error } = await sb().auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });
  if (error) throw new Error(traducirErrorAuth(error));
}

export async function signOut() {
  await sb().auth.signOut();
}

function traducirErrorAuth(error) {
  const msg = String(error && error.message || "");
  if (/invalid login credentials/i.test(msg)) return "Correo o contraseña incorrectos.";
  if (/already registered|already exists/i.test(msg)) return "Ya existe una cuenta con ese correo.";
  if (/password.*(least|short|6 characters)/i.test(msg)) return "La contraseña debe tener al menos 6 caracteres.";
  if (/rate limit/i.test(msg)) return "Demasiados intentos. Espera un momento.";
  return msg || "No se pudo completar la operación.";
}

/** Guarda en Supabase sin romper la app si falla (los datos siguen en memoria). */
async function persist(store, records) {
  if (!state.persistent) return;
  try {
    await db.put(store, records);
  } catch (err) {
    console.error(`No se pudo guardar en ${store}:`, err);
    state.persistent = false;
    emit();
    throw new Error("No se pudo guardar en el dispositivo.");
  }
}

async function persistRemove(store, ids) {
  if (!state.persistent) return;
  try {
    await db.remove(store, ids);
  } catch (err) {
    console.error(`No se pudo borrar de ${store}:`, err);
  }
}

/* ============================================================ Arranque === */

/**
 * Carga los datos financieros. Requiere una sesión ya iniciada (initAuth()
 * primero) — sin login, las políticas de la base no dejan leer nada, así
 * que ni se intenta.
 */
export async function init() {
  if (!state.session) {
    state.ready = true;
    emit();
    return false;
  }

  state.persistent = await db.init();

  if (state.persistent) {
    try {
      const [items, occurrences, movements, categories, meta, cuts, businesses] = await Promise.all([
        db.getAll("items"),
        db.getAll("occurrences"),
        db.getAll("movements"),
        db.getAll("categories"),
        db.getAll("meta"),
        db.getAll("cuts"),
        db.getAll("businesses"),
      ]);
      items.forEach((r) => state.items.set(r.id, r));
      occurrences.forEach((r) => state.occurrences.set(r.id, r));
      movements.forEach((r) => state.movements.set(r.id, r));
      categories.forEach((r) => state.categories.set(r.id, r));
      meta.forEach((r) => state.meta.set(r.key, r.value));
      cuts.forEach((r) => state.cuts.set(r.id, r));
      businesses.forEach((r) => state.businesses.set(r.id, r));
      await loadProfiles();
    } catch (err) {
      console.error("No se pudieron leer los datos locales:", err);
      state.persistent = false;
    }
  }

  if (!state.categories.size) {
    DEFAULT_CATEGORIES.forEach((c) => state.categories.set(c.id, c));
    await persist("categories", DEFAULT_CATEGORIES).catch(() => {});
  }

  if (!state.businesses.size) {
    DEFAULT_BUSINESSES.forEach((b) => state.businesses.set(b.id, b));
    await persist("businesses", DEFAULT_BUSINESSES).catch(() => {});
  }

  // Solo se siembran los datos iniciales la primera vez.
  if (!state.meta.get("seeded")) {
    buildSeed().forEach((item) => state.items.set(item.id, item));
    await persist("items", [...state.items.values()]).catch(() => {});
    await setMeta("seeded", new Date().toISOString());
  }

  await migrateCutBasedIncomes();
  await ensureOccurrences();
  state.ready = true;
  emit();
  return state.persistent;
}

/** Vuelve al estado "sin sesión": limpia todo lo cargado en memoria. */
export function resetInMemoryState() {
  state.items.clear();
  state.occurrences.clear();
  state.movements.clear();
  state.categories.clear();
  state.businesses.clear();
  state.profiles.clear();
  state.meta.clear();
  state.cuts.clear();
  state.ready = false;
  emit();
}

/**
 * Migración idempotente: los ingresos semanales (Barbería, Uñas) ya no tienen
 * un día fijo inventado — pertenecen al corte semanal (domingo a sábado). Si vienen de una
 * versión anterior con fecha y vencimientos fechados, se limpia aquí una sola
 * vez (los movimientos ya recibidos, que son historial real, no se tocan).
 */
async function migrateCutBasedIncomes() {
  const touchedItems = [];
  const removedOccurrences = [];

  CUT_BASED_ITEM_IDS.forEach((id) => {
    const item = state.items.get(id);
    if (!item || item.cutBased) return;
    item.cutBased = true;
    item.startDate = null;
    item.anchorDay = null;
    item.updatedAt = new Date().toISOString();
    state.items.set(id, item);
    touchedItems.push(item);

    occurrences()
      .filter((o) => o.itemId === id && o.status === STATUS.PENDING)
      .forEach((o) => {
        state.occurrences.delete(o.id);
        removedOccurrences.push(o.id);
      });
  });

  if (touchedItems.length) await persist("items", touchedItems).catch(() => {});
  if (removedOccurrences.length) await persistRemove("occurrences", removedOccurrences).catch(() => {});
}

export async function setMeta(key, value) {
  state.meta.set(key, value);
  await persist("meta", { key, value }).catch(() => {});
  emit();
}

export function getMeta(key, fallback) {
  return state.meta.has(key) ? state.meta.get(key) : fallback;
}

/* ============================================================= Lectura === */

export const items = () => [...state.items.values()];
export const occurrences = () => [...state.occurrences.values()];
export const movements = () => [...state.movements.values()];
export const categories = () => [...state.categories.values()].sort((a, b) => (a.order || 99) - (b.order || 99));

export const getItem = (id) => state.items.get(id) || null;
export const getOccurrence = (id) => state.occurrences.get(id) || null;
export const getMovement = (id) => state.movements.get(id) || null;
export const getCategory = (id) => state.categories.get(id) || null;

export function categoryName(id) {
  const c = state.categories.get(id);
  return c ? c.name : "Otros";
}

export function categoryColor(id) {
  const c = state.categories.get(id);
  return c ? c.color : "#8a8f94";
}

/** Categorías utilizables en un negocio: las suyas propias + las generales. */
export function categoriesForBusiness(businessId, type) {
  return categories().filter((c) => {
    if (type && c.type !== type) return false;
    return !c.businessId || c.businessId === businessId;
  });
}

export const businesses = () => [...state.businesses.values()].sort((a, b) => (a.order || 99) - (b.order || 99));
export const getBusiness = (id) => state.businesses.get(id) || null;

export function businessName(id) {
  const b = state.businesses.get(id);
  return b ? b.name : "General";
}

export function businessColor(id) {
  const b = state.businesses.get(id);
  return b ? b.color : "#8a8f94";
}

/** Vencimientos de un item, del más reciente al más antiguo. */
export function occurrencesOf(itemId) {
  return occurrences()
    .filter((o) => o.itemId === itemId)
    .sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
}

/** Movimientos ligados a un item, del más reciente al más antiguo. */
export function movementsOf(itemId) {
  return movements()
    .filter((m) => m.itemId === itemId)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
}

/* =================================================== Generación de fechas = */

function occurrenceId(itemId, dueDate) {
  // Id determinista: imposible duplicar el mismo vencimiento del mismo item.
  return `oc_${itemId}_${dueDate}`;
}

function stepDate(date, recurrence, anchorDay) {
  const rec = RECURRENCES.find((r) => r.id === recurrence);
  if (!rec || rec.id === "once") return null;
  if (rec.days) return addDays(date, rec.days);
  return addMonths(date, rec.months, anchorDay);
}

/**
 * Cada concepto recurrente tiene, como máximo, UN vencimiento pendiente a la
 * vez ("el próximo compromiso"). No se generan meses hacia adelante: cuando
 * ese vencimiento se paga, esta función calcula y crea el siguiente. Es
 * idempotente y también actúa como saneador — si por cualquier motivo hay más
 * de un pendiente para el mismo concepto, deja solo el más próximo.
 */
export async function ensureOccurrences() {
  const created = [];
  const removed = [];

  items().forEach((item) => {
    if (!item.active) return;
    if (item.kind === KIND.HEAVY) return;   // las deudas fuertes no vencen solas
    if (item.cutBased) return;              // ingresos del corte semanal: sin fecha fija
    if (!item.startDate) return;            // fecha por configurar

    const existing = occurrences()
      .filter((o) => o.itemId === item.id)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));

    if (!existing.length) {
      const id = occurrenceId(item.id, item.startDate);
      const occ = makeOccurrence({
        id, itemId: item.id, kind: item.kind, name: item.name,
        category: item.category, businessId: item.businessId, dueDate: item.startDate, amount: item.amount,
      });
      state.occurrences.set(id, occ);
      created.push(occ);
      return;
    }

    const pending = existing.filter((o) => o.status === STATUS.PENDING);

    if (pending.length > 1) {
      // Sobrantes de una versión anterior (o de un cambio de periodicidad):
      // se conserva solo el más próximo, el resto se retira.
      pending.slice(1).forEach((o) => {
        state.occurrences.delete(o.id);
        removed.push(o.id);
      });
    }

    if (pending.length >= 1) return; // ya hay un compromiso activo
    if (item.recurrence === "once") return; // no se repite

    const last = existing[existing.length - 1];
    const next = stepDate(last.dueDate, item.recurrence, item.anchorDay);
    if (!next) return;
    const id = occurrenceId(item.id, next);
    if (!state.occurrences.has(id)) {
      const occ = makeOccurrence({
        id, itemId: item.id, kind: item.kind, name: item.name,
        category: item.category, businessId: item.businessId, dueDate: next, amount: item.amount,
      });
      state.occurrences.set(id, occ);
      created.push(occ);
    }
  });

  if (created.length) await persist("occurrences", created).catch(() => {});
  if (removed.length) await persistRemove("occurrences", removed).catch(() => {});
  return created.length;
}

/* ================================================== Dinero disponible ==== */

/**
 * Saldo inicial: lo que había antes de empezar a usar la app (efectivo en
 * mano, cuenta bancaria, etc.). $0 si el usuario nunca lo configuró — NUNCA
 * se inventa un valor. Editable desde Más.
 */
export function initialBalance() {
  return Number(getMeta("initialBalance", 0)) || 0;
}

export async function setInitialBalance(value) {
  const n = Number(value);
  if (!isFinite(n)) throw new Error("El saldo inicial debe ser un número.");
  await setMeta("initialBalance", round2(n));
}

/** Suma de todos los ingresos realmente recibidos (movimientos tipo income), histórico completo. */
export function totalReceived() {
  let total = 0;
  state.movements.forEach((m) => { if (m.type === "income") total += m.amount; });
  return round2(total);
}

/** Suma de todos los gastos/pagos realmente pagados (movimientos tipo expense), histórico completo. */
export function totalPaid() {
  let total = 0;
  state.movements.forEach((m) => { if (m.type === "expense") total += m.amount; });
  return round2(total);
}

/**
 * Dinero disponible real = saldo inicial + ingresos realmente recibidos −
 * gastos realmente pagados (histórico completo). Los pendientes NUNCA se
 * suman ni se restan aquí — aparecen aparte, como dinero comprometido o
 * esperado. Cada cifra de esta fórmula puede auditarse con Store.moneyBreakdown().
 */
export function availableMoney() {
  return round2(initialBalance() + totalReceived() - totalPaid());
}

/** Desglose completo y auditable del dinero disponible. */
export function moneyBreakdown() {
  const initial = initialBalance();
  const received = totalReceived();
  const paid = totalPaid();
  return { initial, received, paid, total: round2(initial + received - paid) };
}

/* ================================================== Altas y ediciones ==== */

export async function saveItem(data) {
  const existing = data.id ? state.items.get(data.id) : null;
  const item = makeItem({
    ...(existing || {}),
    ...data,
    id: data.id || uid("it"),
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seeded: existing ? existing.seeded : false,
  });

  if (!item.name) throw new Error("El nombre no puede quedar vacío.");
  if (item.startDate && !isValidISO(item.startDate)) throw new Error("La fecha no es válida.");
  if (item.amount < 0) throw new Error("El monto no puede ser negativo.");

  // Registra automáticamente cuándo se canceló (o se reactivó) el concepto.
  if (existing && existing.active !== item.active) {
    item.canceledAt = item.active ? null : todayISO();
  }

  // Evita duplicados exactos al crear (mismo nombre, tipo y categoría).
  if (!existing) {
    const dup = items().find(
      (i) => i.active && i.kind === item.kind && i.category === item.category &&
             i.name.toLocaleLowerCase("es") === item.name.toLocaleLowerCase("es")
    );
    if (dup) throw new Error(`Ya existe "${item.name}" en esa categoría.`);
  }

  state.items.set(item.id, item);
  await persist("items", item);

  if (existing) await syncPendingOccurrences(item, existing);
  await ensureOccurrences();
  emit();
  return item;
}

/**
 * Al editar un item se actualizan sus vencimientos PENDIENTES (nombre, monto,
 * categoría). Los ya pagados nunca se tocan: son historial.
 */
async function syncPendingOccurrences(item, previous) {
  const dateChanged = previous.startDate !== item.startDate;
  const recurrenceChanged = previous.recurrence !== item.recurrence;
  const touched = [];
  const removed = [];

  occurrences().forEach((occ) => {
    if (occ.itemId !== item.id) return;
    if (occ.status !== STATUS.PENDING) return;

    if (dateChanged || recurrenceChanged) {
      // El calendario cambió: se rehacen los pendientes desde cero.
      state.occurrences.delete(occ.id);
      removed.push(occ.id);
      return;
    }
    occ.name = item.name;
    occ.category = item.category;
    occ.businessId = item.businessId;
    occ.amount = item.amount;
    touched.push(occ);
  });

  if (removed.length) await persistRemove("occurrences", removed);
  if (touched.length) await persist("occurrences", touched).catch(() => {});
}

/** Desactiva o elimina un item. El historial de pagos SIEMPRE se conserva. */
export async function deleteItem(id) {
  const item = state.items.get(id);
  if (!item) return;

  const pending = occurrences().filter((o) => o.itemId === id && o.status === STATUS.PENDING);
  pending.forEach((o) => state.occurrences.delete(o.id));
  if (pending.length) await persistRemove("occurrences", pending.map((o) => o.id));

  const hasHistory = occurrences().some((o) => o.itemId === id) || movements().some((m) => m.itemId === id);

  if (hasHistory) {
    // Se archiva para no romper los movimientos que lo referencian.
    item.active = false;
    item.updatedAt = new Date().toISOString();
    state.items.set(id, item);
    await persist("items", item);
  } else {
    state.items.delete(id);
    await persistRemove("items", id);
  }
  emit();
}

/** Cambia el monto esperado de UN vencimiento sin tocar los demás. */
export async function setOccurrenceAmount(occId, amount) {
  const occ = state.occurrences.get(occId);
  if (!occ) throw new Error("No se encontró ese vencimiento.");
  if (occ.status !== STATUS.PENDING) throw new Error("Ese vencimiento ya fue registrado.");
  occ.amount = round2(amount);
  state.occurrences.set(occId, occ);
  await persist("occurrences", occ);
  emit();
  return occ;
}

/** Cambia la fecha de UN vencimiento pendiente. */
export async function setOccurrenceDate(occId, dueDate) {
  const occ = state.occurrences.get(occId);
  if (!occ) throw new Error("No se encontró ese vencimiento.");
  if (!isValidISO(dueDate)) throw new Error("La fecha no es válida.");
  const newId = occurrenceId(occ.itemId, dueDate);
  if (newId !== occ.id && state.occurrences.has(newId)) {
    throw new Error("Ya existe un vencimiento en esa fecha.");
  }
  const oldId = occ.id;
  state.occurrences.delete(oldId);
  occ.id = newId;
  occ.dueDate = dueDate;
  state.occurrences.set(newId, occ);
  await persistRemove("occurrences", oldId);
  await persist("occurrences", occ);
  emit();
  return occ;
}

/* ========================================================== Movimientos == */

function buildMovement(data) {
  const before = availableMoney();
  const amount = round2(data.amount);
  const after = round2(data.type === "income" ? before + amount : before - amount);
  return makeMovement({
    ...data, id: uid("mv"), amount, balanceBefore: before, balanceAfter: after,
    createdBy: data.createdBy || currentUserId(),
  });
}

function validatePayload({ amount, date }) {
  const value = Number(amount);
  if (!isFinite(value) || value <= 0) throw new Error("Escribe un monto mayor a cero.");
  if (value > 100000000) throw new Error("Ese monto es demasiado grande.");
  if (!isValidISO(date)) throw new Error("La fecha no es válida.");
}

/** Cuánto se ha abonado ya a un vencimiento pendiente (para pagos parciales). */
export function paidSoFar(occId) {
  return round2(
    movements()
      .filter((m) => m.occurrenceId === occId)
      .reduce((s, m) => s + m.amount, 0)
  );
}

/**
 * Registra el pago de un vencimiento. El monto puede ser distinto al esperado.
 *
 * Si `partial` es true y lo pagado no cubre el monto restante, el vencimiento
 * NO se marca como pagado: sigue pendiente por la diferencia, y se puede
 * seguir abonando después (pago parcial). Si cubre el total (o no se marcó
 * como parcial), el vencimiento se resuelve, y si el item es de monto
 * variable, el importe de este pago queda como referencia para el siguiente
 * periodo — los pagos anteriores del historial nunca se modifican.
 */
export async function payOccurrence(occId, { amount, date, note, partial } = {}) {
  const occ = state.occurrences.get(occId);
  if (!occ) throw new Error("No se encontró ese pago.");
  if (occ.status !== STATUS.PENDING) throw new Error("Ese pago ya estaba registrado.");

  const item = state.items.get(occ.itemId);
  const payload = { amount: round2(amount), date: date || todayISO(), note: note || "" };
  validatePayload(payload);

  const isIncome = occ.kind === KIND.INCOME;
  const prior = paidSoFar(occ.id);
  const remaining = round2(occ.amount - prior - payload.amount);
  const isPartial = !isIncome && !!partial && remaining > 0;

  const movement = buildMovement({
    type: isIncome ? "income" : "expense",
    concept: occ.name,
    category: occ.category,
    businessId: occ.businessId,
    kind: occ.kind,
    amount: payload.amount,
    date: payload.date,
    note: payload.note,
    itemId: occ.itemId,
    occurrenceId: occ.id,
    partial: isPartial,
  });

  state.movements.set(movement.id, movement);
  await persist("movements", movement);

  if (isPartial) {
    if (payload.note) occ.note = occ.note ? `${occ.note} · ${payload.note}` : payload.note;
    state.occurrences.set(occ.id, occ);
    await persist("occurrences", occ);
    emit();
    return { occurrence: occ, movement, partial: true, remaining: round2(Math.max(0, remaining)) };
  }

  occ.status = isIncome ? STATUS.RECEIVED : STATUS.PAID;
  occ.paidAmount = round2(prior + payload.amount);
  occ.paidDate = payload.date;
  occ.note = payload.note || occ.note;
  occ.movementId = movement.id;
  state.occurrences.set(occ.id, occ);
  await persist("occurrences", occ);

  // Monto variable: el importe pagado queda como referencia hacia adelante.
  if (item && item.variable && payload.amount !== item.amount) {
    item.amount = payload.amount;
    item.updatedAt = new Date().toISOString();
    state.items.set(item.id, item);
    await persist("items", item);
  }

  // Genera el siguiente vencimiento del periodo (uno solo, no meses enteros).
  await ensureOccurrences();
  emit();
  return { occurrence: occ, movement, partial: false };
}

/**
 * Registra un pago/cobro de un item que no tiene vencimiento programado
 * (por ejemplo Afores, o un gasto sin fecha configurada).
 */
export async function payItemDirect(itemId, { amount, date, note } = {}) {
  const item = state.items.get(itemId);
  if (!item) throw new Error("No se encontró el registro.");
  const payload = { amount: round2(amount), date: date || todayISO(), note: note || "" };
  validatePayload(payload);

  const isIncome = item.kind === KIND.INCOME;
  const movement = buildMovement({
    type: isIncome ? "income" : "expense",
    concept: item.name,
    category: item.category,
    businessId: item.businessId,
    kind: item.kind,
    amount: payload.amount,
    date: payload.date,
    note: payload.note,
    itemId: item.id,
  });

  state.movements.set(movement.id, movement);
  await persist("movements", movement);

  if (item.kind === KIND.HEAVY) {
    item.balance = round2(Math.max(0, (item.balance || 0) - payload.amount));
    item.updatedAt = new Date().toISOString();
    state.items.set(item.id, item);
    await persist("items", item);
  } else if (item.recurrence === "once") {
    item.active = false; // ingreso o gasto único ya cobrado/pagado
    item.updatedAt = new Date().toISOString();
    state.items.set(item.id, item);
    await persist("items", item);
  }

  emit();
  return movement;
}

/** Ingreso o gasto suelto, sin item asociado (acciones rápidas). */
export async function addQuickMovement({ type, concept, amount, date, category, note, businessId }) {
  const payload = { amount: round2(amount), date: date || todayISO() };
  validatePayload(payload);
  const name = String(concept || "").trim();
  if (!name) throw new Error("Escribe un concepto.");

  const movement = buildMovement({
    type: type === "income" ? "income" : "expense",
    concept: name,
    category: category || (type === "income" ? "otros-ingresos" : "otros"),
    businessId: businessId || null,
    kind: type === "income" ? KIND.INCOME : KIND.EXPENSE,
    amount: payload.amount,
    date: payload.date,
    note: note || "",
  });

  state.movements.set(movement.id, movement);
  await persist("movements", movement);
  emit();
  return movement;
}

/** Deshace un pago: borra el movimiento y devuelve el vencimiento a pendiente. */
export async function undoMovement(movementId) {
  const movement = state.movements.get(movementId);
  if (!movement) throw new Error("No se encontró ese movimiento.");

  if (movement.occurrenceId) {
    const occ = state.occurrences.get(movement.occurrenceId);
    if (occ) {
      occ.status = STATUS.PENDING;
      occ.paidAmount = null;
      occ.paidDate = null;
      occ.movementId = null;
      state.occurrences.set(occ.id, occ);
      await persist("occurrences", occ).catch(() => {});
    }
  }

  // Si era abono a una deuda fuerte, se devuelve al saldo.
  const item = movement.itemId ? state.items.get(movement.itemId) : null;
  if (item && item.kind === KIND.HEAVY && movement.type === "expense") {
    item.balance = round2((item.balance || 0) + movement.amount);
    item.updatedAt = new Date().toISOString();
    state.items.set(item.id, item);
    await persist("items", item).catch(() => {});
  }
  if (item && item.recurrence === "once" && !item.active) {
    item.active = true;
    state.items.set(item.id, item);
    await persist("items", item).catch(() => {});
  }

  state.movements.delete(movementId);
  await persistRemove("movements", movementId);
  emit();
}

/** Ajusta directamente el saldo de una deuda fuerte (sin mover el disponible). */
export async function setHeavyBalance(itemId, balance, note) {
  const item = state.items.get(itemId);
  if (!item || item.kind !== KIND.HEAVY) throw new Error("No es una deuda fuerte.");
  const value = Number(balance);
  if (!isFinite(value) || value < 0) throw new Error("El saldo no es válido.");
  item.balance = round2(value);
  if (note != null) item.statusNote = note;
  item.updatedAt = new Date().toISOString();
  state.items.set(itemId, item);
  await persist("items", item);
  emit();
  return item;
}

/* ==================================================== Cortes semanales ==== */

export const closedCuts = () => [...state.cuts.values()].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
export const getCut = (id) => state.cuts.get(id) || null;

/**
 * Cierra el corte semanal actual: guarda una fotografía (esperado, recibido,
 * diferencia) que ya no cambia aunque después se editen los ingresos. NUNCA
 * borra movimientos ni ingresos: solo registra el cierre del periodo.
 */
export async function closeCut({ start, end, expected, received }) {
  if (!start || !end) throw new Error("Faltan las fechas del corte.");
  const id = `cut_${start}`;
  if (state.cuts.has(id)) throw new Error("Ese corte ya estaba cerrado.");
  const record = {
    id,
    startDate: start,
    endDate: end,
    expected: round2(expected || 0),
    received: round2(received || 0),
    difference: round2((received || 0) - (expected || 0)),
    status: "closed",
    closedAt: new Date().toISOString(),
  };
  state.cuts.set(id, record);
  await persist("cuts", record);
  emit();
  return record;
}

/* ======================================================== Categorías ===== */

export async function saveCategory({ id, name, type, color, businessId }) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("Escribe un nombre de categoría.");
  const slug =
    id ||
    clean
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Ese nombre no es válido.");
  if (!id && state.categories.has(slug)) throw new Error("Ya existe una categoría con ese nombre.");
  const category = {
    id: slug,
    name: clean,
    type: type || "expense",
    color: color || "#8a8f94",
    order: state.categories.size + 1,
    businessId: businessId || null,
  };
  state.categories.set(slug, category);
  await persist("categories", category);
  emit();
  return category;
}

export async function deleteCategory(id) {
  const inUse = items().some((i) => i.category === id) || movements().some((m) => m.category === id);
  if (inUse) throw new Error("Esa categoría está en uso; primero cambia los registros que la usan.");
  state.categories.delete(id);
  await persistRemove("categories", id);
  emit();
}

/* ====================================================== Respaldo JSON ==== */

export function exportData() {
  return {
    app: "mis-finanzas",
    version: 3,
    exportedAt: new Date().toISOString(),
    counts: {
      items: state.items.size,
      occurrences: state.occurrences.size,
      movements: state.movements.size,
      categories: state.categories.size,
      businesses: state.businesses.size,
      cuts: state.cuts.size,
    },
    items: items(),
    occurrences: occurrences(),
    movements: movements(),
    categories: categories(),
    businesses: businesses(),
    cuts: closedCuts(),
    meta: [...state.meta.entries()].map(([key, value]) => ({ key, value })),
  };
}

function validateBackup(data) {
  if (!data || typeof data !== "object") throw new Error("El archivo no es un respaldo válido.");
  if (data.app && data.app !== "mis-finanzas") throw new Error("Ese respaldo es de otra aplicación.");
  ["items", "occurrences", "movements", "categories", "businesses", "cuts"].forEach((key) => {
    if (data[key] != null && !Array.isArray(data[key])) throw new Error(`El campo "${key}" está dañado.`);
  });
  if (!Array.isArray(data.items) && !Array.isArray(data.movements)) {
    throw new Error("El respaldo no contiene datos que importar.");
  }
  (data.items || []).forEach((i) => {
    if (!i || !i.id || !i.kind) throw new Error("Hay registros dañados en el respaldo.");
  });
  (data.movements || []).forEach((m) => {
    if (!m || !m.id || !m.date || typeof m.amount !== "number") {
      throw new Error("Hay movimientos dañados en el respaldo.");
    }
  });
}

/** Reemplaza TODO el contenido con el de un respaldo. Nunca toca los perfiles de usuario. */
export async function importData(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  validateBackup(data);

  const payload = {
    items: (data.items || []).map(makeItem),
    occurrences: (data.occurrences || []).map(makeOccurrence),
    movements: (data.movements || []).map(makeMovement),
    categories: (data.categories || []).length ? data.categories : DEFAULT_CATEGORIES,
    businesses: (data.businesses || []).length ? data.businesses : DEFAULT_BUSINESSES,
    cuts: data.cuts || [],
    meta: data.meta || [{ key: "seeded", value: new Date().toISOString() }],
  };

  if (state.persistent) await db.replaceAll(payload);

  state.items = new Map(payload.items.map((r) => [r.id, r]));
  state.occurrences = new Map(payload.occurrences.map((r) => [r.id, r]));
  state.movements = new Map(payload.movements.map((r) => [r.id, r]));
  state.categories = new Map(payload.categories.map((r) => [r.id, r]));
  state.businesses = new Map(payload.businesses.map((r) => [r.id, r]));
  state.cuts = new Map(payload.cuts.map((r) => [r.id, r]));
  state.meta = new Map(payload.meta.map((r) => [r.key, r.value]));

  await migrateCutBasedIncomes();
  await ensureOccurrences();
  emit();
  return { items: state.items.size, movements: state.movements.size };
}

/** Borra todo. Si `reseed` es true vuelve a cargar los datos iniciales. Nunca toca los perfiles de usuario. */
export async function resetAll(reseed) {
  if (state.persistent) await db.clearAll();
  state.items.clear();
  state.occurrences.clear();
  state.movements.clear();
  state.meta.clear();
  state.cuts.clear();
  state.categories = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));
  await persist("categories", DEFAULT_CATEGORIES).catch(() => {});
  state.businesses = new Map(DEFAULT_BUSINESSES.map((b) => [b.id, b]));
  await persist("businesses", DEFAULT_BUSINESSES).catch(() => {});

  if (reseed) {
    buildSeed().forEach((item) => state.items.set(item.id, item));
    await persist("items", [...state.items.values()]).catch(() => {});
    await migrateCutBasedIncomes();
    await ensureOccurrences();
  }
  await setMeta("seeded", new Date().toISOString());
  emit();
}

export { KIND, STATUS };
