// Modo demo: la app completa funcionando con datos de ejemplo guardados en
// este navegador. Reproduce las mismas reglas que las funciones SQL.
import { countLine } from "../lib/calc";
import { rankMatches, confidenceFromScore } from "../lib/match";
import { ApiError, type Api } from "./api";
import type {
  Category, CostHistoryEntry, CountKind, Product, Purchase, PurchaseInput, PurchaseItem, ScanResult, ScannedLine,
  WeeklyCount, WeeklyCountItem,
} from "./types";

const KEY = "dulce-demo-db-v1";
export const DEMO_FLAG = "dulce-demo";

interface Db {
  business_name: string;
  categories: Category[];
  products: Product[];
  history: CostHistoryEntry[];
  counts: WeeklyCount[];
  countItems: WeeklyCountItem[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
}

const uuid = () => crypto.randomUUID();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

function emptyDb(): Db {
  return { business_name: "Dulcería Demo", categories: [], products: [], history: [], counts: [], countItems: [], purchases: [], purchaseItems: [] };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* almacenamiento no disponible */ }
  const db = seed();
  save(db);
  return db;
}

function save(db: Db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin almacenamiento: sólo en memoria */ }
}

// ---------------------------------------------------------------------------
// Reglas (mismas que save_weekly_count / confirm_purchase en SQL)
// ---------------------------------------------------------------------------

function priceAt(db: Db, p: Product, at: string) {
  const h = db.history
    .filter((e) => e.product_id === p.id && e.effective_from <= at)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  return { cost: h?.cost_price ?? p.cost_price, price: h?.sale_price ?? p.sale_price };
}

function doSaveCount(db: Db, items: { product_id: string; counted_quantity: number }[], kind: CountKind, at: string, notes?: string): string {
  if (!items.length) throw new ApiError("SIN_PRODUCTOS", "SIN_PRODUCTOS");
  for (const i of items) {
    if (!Number.isInteger(i.counted_quantity) || i.counted_quantity < 0) throw new ApiError("CANTIDAD_INVALIDA", "CANTIDAD_INVALIDA");
  }
  const ids = new Set(items.map((i) => i.product_id));
  if (ids.size !== items.length) throw new ApiError("PRODUCTO_REPETIDO", "PRODUCTO_REPETIDO");
  const missing = db.products.filter((p) => p.is_active && !ids.has(p.id)).length;
  if (missing) throw new ApiError("FALTAN_PRODUCTOS", `FALTAN_PRODUCTOS: ${missing}`);

  const prev = db.counts.map((c) => c.counted_at).sort().at(-1) ?? null;
  const count: WeeklyCount = {
    id: uuid(), kind, period_start: prev, counted_at: at, products_counted: items.length,
    total_units_sold: 0, total_sales: 0, total_cost: 0, total_profit: 0, notes: notes?.trim() || null,
  };
  for (const i of items) {
    const p = db.products.find((x) => x.id === i.product_id);
    if (!p) throw new ApiError("PRODUCTO_DESCONOCIDO", "PRODUCTO_DESCONOCIDO");
    const { cost, price } = priceAt(db, p, at);
    const previous = kind === "initial" ? i.counted_quantity : p.current_quantity;
    const l = countLine({ previous, counted: i.counted_quantity, unitCost: cost, unitPrice: price, minQuantity: p.min_quantity });
    db.countItems.push({
      id: uuid(), weekly_count_id: count.id, product_id: p.id, product_name: p.name,
      previous_quantity: previous, counted_quantity: i.counted_quantity, units_sold: l.sold, surplus: l.surplus,
      unit_cost: cost, unit_price: price, sales_amount: l.sales, cost_amount: l.cost, profit_amount: l.profit,
      min_quantity: p.min_quantity, stock_status: l.status, suggested_qty: l.suggested,
    });
    count.total_units_sold += l.sold;
    count.total_sales = Math.round((count.total_sales + l.sales) * 100) / 100;
    count.total_cost = Math.round((count.total_cost + l.cost) * 100) / 100;
    count.total_profit = Math.round((count.total_profit + l.profit) * 100) / 100;
    p.current_quantity = i.counted_quantity;
    p.shopping_qty = l.status === "ok" ? null : l.suggested;
    p.shopping_checked = false;
    p.updated_at = at;
  }
  for (const p of db.products) {
    if (!p.is_active && !ids.has(p.id)) { p.shopping_qty = null; p.shopping_checked = false; }
  }
  db.counts.push(count);
  return count.id;
}

function doPurchase(db: Db, input: PurchaseInput, at: string): string {
  if (!input.items.length) throw new ApiError("SIN_PRODUCTOS", "SIN_PRODUCTOS");
  for (const i of input.items) {
    if (!Number.isInteger(i.quantity) || i.quantity <= 0 || (i.unit_cost != null && i.unit_cost < 0)) {
      throw new ApiError("CANTIDAD_INVALIDA", "CANTIDAD_INVALIDA");
    }
    if (!db.products.some((p) => p.id === i.product_id)) throw new ApiError("PRODUCTO_DESCONOCIDO", "PRODUCTO_DESCONOCIDO");
  }
  const purchase: Purchase = {
    id: uuid(), purchased_at: input.purchased_at ?? at, store_name: input.store_name?.trim() || null,
    source: input.source, ticket_path: input.ticket_path ?? null, total_units: 0, total_cost: 0, notes: input.notes?.trim() || null,
  };
  for (const i of input.items) {
    const p = db.products.find((x) => x.id === i.product_id)!;
    const previous = p.current_quantity;
    p.current_quantity += i.quantity;
    if (i.update_cost && i.unit_cost != null && i.unit_cost !== p.cost_price) {
      p.cost_price = i.unit_cost;
      db.history.push({ id: uuid(), product_id: p.id, cost_price: p.cost_price, sale_price: p.sale_price, effective_from: at, source: "compra" });
    }
    if (p.shopping_qty != null) p.shopping_checked = true;
    p.updated_at = at;
    const line = i.unit_cost == null ? null : Math.round(i.quantity * i.unit_cost * 100) / 100;
    db.purchaseItems.push({
      id: uuid(), purchase_id: purchase.id, product_id: p.id, product_name: p.name, raw_name: i.raw_name,
      quantity: i.quantity, unit_cost: i.unit_cost, line_total: line, previous_quantity: previous, new_quantity: p.current_quantity,
    });
    purchase.total_units += i.quantity;
    purchase.total_cost = Math.round((purchase.total_cost + (line ?? 0)) * 100) / 100;
  }
  db.purchases.push(purchase);
  return purchase.id;
}

function addProduct(db: Db, input: Omit<Product, "id" | "created_at" | "updated_at" | "shopping_qty" | "shopping_checked" | "is_active">, at: string): Product {
  const name = input.name.trim();
  if (db.products.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new ApiError("NOMBRE_REPETIDO", "NOMBRE_REPETIDO");
  const p: Product = { ...input, name, id: uuid(), is_active: true, shopping_qty: null, shopping_checked: false, created_at: at, updated_at: at };
  db.products.push(p);
  db.history.push({ id: uuid(), product_id: p.id, cost_price: p.cost_price, sale_price: p.sale_price, effective_from: at, source: "alta" });
  return p;
}

// ---------------------------------------------------------------------------
// Datos de ejemplo: 4 sábados de historia
// ---------------------------------------------------------------------------

function seed(): Db {
  const db = emptyDb();
  const cat = (name: string, emoji: string, color: Category["color"], sort_order: number) => {
    const c = { id: uuid(), name, emoji, color, sort_order };
    db.categories.push(c);
    return c.id;
  };
  const botanas = cat("Botanas", "🌶️", "mango", 1);
  const chocolates = cat("Chocolates", "🍫", "choco", 2);
  const dulces = cat("Dulces", "🍬", "pink", 3);
  const paletas = cat("Paletas", "🍭", "grape", 4);
  const gomitas = cat("Gomitas", "🐻", "mint", 5);
  const bebidas = cat("Bebidas", "🥤", "sky", 6);

  const lastSat = new Date();
  lastSat.setHours(18, 0, 0, 0);
  lastSat.setDate(lastSat.getDate() - ((lastSat.getDay() + 1) % 7 || 7));
  const sat = (weeksAgo: number, hour = 18) => {
    const d = new Date(lastSat);
    d.setDate(d.getDate() - 7 * weeksAgo);
    d.setHours(hour);
    return d.toISOString();
  };

  const t0 = sat(3, 10);
  const specs: [string, string, string, number, number, number, number][] = [
    // nombre, categoría, emoji, costo, precio, mínimo, inicial
    ["Takis Fuego", botanas, "🌶️", 12, 20, 10, 20],
    ["Sabritas Adobadas", botanas, "🥔", 13, 20, 8, 16],
    ["Mazapán", dulces, "🥜", 5, 10, 15, 30],
    ["Pulparindo", dulces, "🍬", 6, 12, 10, 25],
    ["Duvalín", dulces, "🍮", 4, 8, 12, 24],
    ["Carlos V", chocolates, "🍫", 8, 15, 10, 20],
    ["Kranky", chocolates, "🍪", 10, 18, 6, 12],
    ["Paleta Payaso", paletas, "🍭", 9, 15, 6, 12],
    ["Rockaleta", paletas, "🍭", 7, 12, 10, 20],
    ["Gomitas Panditas", gomitas, "🐻", 10, 18, 8, 16],
    ["Coca-Cola 600 ml", bebidas, "🥤", 14, 22, 12, 24],
  ];
  for (const [name, category_id, emoji, cost_price, sale_price, min_quantity, current_quantity] of specs) {
    addProduct(db, { name, category_id, emoji, cost_price, sale_price, min_quantity, current_quantity }, t0);
  }
  doSaveCount(db, db.products.map((p) => ({ product_id: p.id, counted_quantity: p.current_quantity })), "initial", t0);

  const weeklySales = [
    [8, 6, 9, 7, 10, 7, 4, 5, 8, 6, 11],
    [9, 7, 12, 9, 11, 8, 5, 6, 9, 7, 13],
    [11, 8, 13, 25, 12, 9, 6, 7, 10, 8, 15],
  ];
  weeklySales.forEach((sales, w) => {
    const at = sat(2 - w);
    doSaveCount(db, db.products.map((p, i) => ({
      product_id: p.id, counted_quantity: Math.max(p.current_quantity - sales[i], 0),
    })), "weekly", at);
    if (w < 2) {
      // Compra del domingo: repone lo de la lista
      const buyAt = new Date(new Date(at).getTime() + 18 * 3600e3).toISOString();
      const items = db.products.filter((p) => p.shopping_qty != null).map((p) => ({
        product_id: p.id, quantity: Math.max(p.shopping_qty!, 0) + 10, unit_cost: p.name === "Takis Fuego" && w === 1 ? 13 : p.cost_price,
        raw_name: null, update_cost: true,
      })).filter((i) => i.quantity > 0);
      if (items.length) doPurchase(db, { items, source: "manual", store_name: "Bodega Aurrera" }, buyAt);
    }
  });
  return db;
}

// ---------------------------------------------------------------------------

const tickets = new Map<string, string>();

export function createDemoApi(): Api {
  let db = load();
  const listeners = new Set<(u: { id: string; email: string } | null) => void>();
  const user = { id: "demo", email: "demo@dulcecontrol.app" };
  const now = () => new Date().toISOString();
  const tx = async <T,>(fn: (db: Db) => T): Promise<T> => {
    await wait(120);
    const draft = clone(db);
    const out = fn(draft); // si lanza error, no se guarda nada (atómico)
    db = draft;
    save(db);
    return out;
  };
  const read = async <T,>(fn: (db: Db) => T): Promise<T> => {
    await wait(60);
    return clone(fn(db));
  };

  return {
    mode: "demo",
    async getUser() { return user; },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn() {},
    async signUp() { return { needsConfirmation: false }; },
    async resetPassword() {},
    async signOut() {
      try { localStorage.removeItem(DEMO_FLAG); localStorage.removeItem(KEY); } catch { /* */ }
      listeners.forEach((l) => l(null));
      window.location.href = "/";
    },

    getProfile: () => read((d) => ({ id: "demo", business_name: d.business_name })),
    updateProfile: (name) => tx((d) => { d.business_name = name; }),

    listCategories: () => read((d) => [...d.categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))),
    createCategory: (input) => tx((d) => {
      if (d.categories.some((c) => c.name.toLowerCase() === input.name.trim().toLowerCase())) throw new ApiError("DUP", "categories_owner_name_uq");
      const c = { ...input, name: input.name.trim(), id: uuid(), sort_order: d.categories.length + 1 };
      d.categories.push(c);
      return c;
    }),
    deleteCategory: (id) => tx((d) => {
      d.categories = d.categories.filter((c) => c.id !== id);
      d.products.forEach((p) => { if (p.category_id === id) p.category_id = null; });
    }),

    listProducts: () => read((d) => [...d.products].sort((a, b) => a.name.localeCompare(b.name, "es"))),
    createProduct: (input) => tx((d) => addProduct(d, {
      name: input.name, category_id: input.category_id, emoji: input.emoji, cost_price: input.cost_price,
      sale_price: input.sale_price, min_quantity: input.min_quantity, current_quantity: input.current_quantity ?? 0,
    }, now())),
    updateProduct: (id, patch) => tx((d) => {
      const p = d.products.find((x) => x.id === id);
      if (!p) throw new ApiError("PRODUCTO_DESCONOCIDO", "PRODUCTO_DESCONOCIDO");
      if (patch.name && d.products.some((x) => x.id !== id && x.name.toLowerCase() === patch.name!.trim().toLowerCase())) {
        throw new ApiError("NOMBRE_REPETIDO", "NOMBRE_REPETIDO");
      }
      const priceChanged = (patch.cost_price != null && patch.cost_price !== p.cost_price) || (patch.sale_price != null && patch.sale_price !== p.sale_price);
      Object.assign(p, patch, { updated_at: now() });
      if (priceChanged) d.history.push({ id: uuid(), product_id: p.id, cost_price: p.cost_price, sale_price: p.sale_price, effective_from: now(), source: "edicion" });
    }),
    deleteProduct: (id) => tx((d) => {
      if (d.countItems.some((i) => i.product_id === id) || d.purchaseItems.some((i) => i.product_id === id)) throw new ApiError("EN_USO", "EN_USO");
      d.products = d.products.filter((p) => p.id !== id);
      d.history = d.history.filter((h) => h.product_id !== id);
    }),
    costHistory: (productId) => read((d) => d.history.filter((h) => h.product_id === productId).sort((a, b) => b.effective_from.localeCompare(a.effective_from))),

    saveCount: (items, kind, notes) => tx((d) => doSaveCount(d, items, kind, now(), notes)),
    listCounts: () => read((d) => [...d.counts].sort((a, b) => b.counted_at.localeCompare(a.counted_at))),
    getCount: (id) => read((d) => {
      const c = d.counts.find((x) => x.id === id);
      if (!c) throw new ApiError("NO_ENCONTRADO", "No se encontró el conteo.");
      return { ...c, items: d.countItems.filter((i) => i.weekly_count_id === id).sort((a, b) => a.product_name.localeCompare(b.product_name, "es")) };
    }),

    confirmPurchase: (input) => tx((d) => doPurchase(d, input, now())),
    listPurchases: () => read((d) => [...d.purchases].sort((a, b) => b.purchased_at.localeCompare(a.purchased_at))),
    getPurchase: (id) => read((d) => {
      const p = d.purchases.find((x) => x.id === id);
      if (!p) throw new ApiError("NO_ENCONTRADO", "No se encontró la compra.");
      return { ...p, items: d.purchaseItems.filter((i) => i.purchase_id === id) };
    }),
    async uploadTicket(file) {
      const path = `demo/${uuid()}.jpg`;
      tickets.set(path, URL.createObjectURL(file));
      return path;
    },
    async ticketUrl(path) { return tickets.get(path) ?? null; },
    async scanTicket(_b64, _mt, catalog): Promise<ScanResult> {
      await wait(2200);
      // Simula un ticket de mayoreo con nombres abreviados.
      const pool = db.products.filter((p) => p.shopping_qty != null && !p.shopping_checked);
      const picks = (pool.length ? pool : db.products).slice(0, 4);
      const abbreviate = (name: string) =>
        name.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
          .split(" ").map((w, i) => (i === 0 ? w.slice(0, 6) : w.replace(/[AEIOU]/g, "").slice(0, 4))).join(" ");
      const items: ScannedLine[] = picks.map((p, i) => {
        const raw = `${abbreviate(p.name)} ${[70, 28, 45, 60][i % 4]}G`;
        const [best] = rankMatches(raw, catalog);
        const qty = Math.max(p.shopping_qty ?? 0, 6) + (i % 2 ? 6 : 0);
        const unit = i === 0 ? p.cost_price + 1 : p.cost_price;
        return {
          raw_name: raw, quantity: qty, unit_price: unit, line_total: qty * unit,
          match_product_id: best?.product.id ?? null,
          match_confidence: best ? confidenceFromScore(best.score) : "none",
          suggested_name: p.name,
        };
      });
      items.push({
        raw_name: "GOMITA ENCHILADA MANGO 1KG", quantity: 1, unit_price: 89, line_total: 89,
        match_product_id: null, match_confidence: "none", suggested_name: "Gomitas enchiladas de mango",
      });
      return {
        readable: true, store_name: "Dulcería La Bodeguita", purchase_date: now().slice(0, 10),
        ticket_total: items.reduce((s, i) => s + (i.line_total ?? 0), 0), items,
      };
    },
  };
}

// Expuesto para pruebas
export const _internal = { doSaveCount, doPurchase, addProduct, emptyDb };
