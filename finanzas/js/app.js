// Punto de entrada: arranque, navegación y acciones globales.

import * as Store from "./store.js";
import * as Finance from "./finance.js";
import * as Forms from "./forms.js";
import { KIND } from "./model.js";
import { money, esc } from "./format.js";
import { formatLong } from "./dates.js";
import { icon, toast, sheet, closeSheet, confirmSheet } from "./ui.js";

import home from "./screens/home.js";
import expenses from "./screens/expenses.js";
import income from "./screens/income.js";
import debts from "./screens/debts.js";
import moreScreen from "./screens/more.js";
import detail from "./screens/detail.js";
import calendar from "./screens/calendar.js";
import historyScreen from "./screens/history.js";
import monthly from "./screens/monthly.js";
import search from "./screens/search.js";
import cut from "./screens/cut.js";
import categoriesScreen from "./screens/categories.js";

const SCREENS = {
  inicio: home,
  gastos: expenses,
  ingresos: income,
  deudas: debts,
  mas: moreScreen,
  detalle: detail,
  calendario: calendar,
  historial: historyScreen,
  mensual: monthly,
  buscar: search,
  corte: cut,
  categorias: categoriesScreen,
};

const TABS = [
  { id: "inicio", label: "Inicio", glyph: "home" },
  { id: "gastos", label: "Gastos", glyph: "expense" },
  { id: "ingresos", label: "Ingresos", glyph: "income", center: true },
  { id: "deudas", label: "Deudas", glyph: "debt" },
  { id: "mas", label: "Más", glyph: "more" },
];

const TAB_FOR_ROUTE = {
  detalle: null,
  calendario: "mas",
  historial: "mas",
  mensual: "mas",
  buscar: null,
  corte: "ingresos",
  categorias: "mas",
};

let current = { name: "inicio", params: {} };

/* ============================================================== Rutas === */

function parseHash() {
  const raw = (location.hash || "#/inicio").replace(/^#\/?/, "");
  const [name, ...rest] = raw.split("/").filter(Boolean);
  const key = name || "inicio";
  if (!SCREENS[key]) return { name: "inicio", params: {} };
  return { name: key, params: { id: rest[0] ? decodeURIComponent(rest[0]) : null } };
}

function renderTabs() {
  const bar = document.getElementById("tabbar");
  const activeTab = TAB_FOR_ROUTE[current.name] !== undefined
    ? TAB_FOR_ROUTE[current.name]
    : current.name;

  bar.innerHTML = `<div class="tabbar-inner">${TABS.map((tab) => {
    const on = tab.id === activeTab;
    if (tab.center) {
      return `<button class="tab is-center ${on ? "is-on" : ""}" data-tab="${tab.id}" aria-label="${tab.label}">
        <span class="fab">${icon(tab.glyph, 22, 2.2)}</span>
        <span class="lbl">${tab.label}</span>
      </button>`;
    }
    return `<button class="tab ${on ? "is-on" : ""}" data-tab="${tab.id}" aria-label="${tab.label}">
      ${icon(tab.glyph, 21, on ? 2.2 : 1.8)}
      <span class="lbl">${tab.label}</span>
    </button>`;
  }).join("")}</div>`;

  bar.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      location.hash = `#/${btn.dataset.tab}`;
    });
  });
}

const context = {
  rerender(after) {
    const root = document.getElementById("screen");
    const scroll = window.scrollY;
    paint(root, false);
    window.scrollTo(0, scroll);
    if (typeof after === "function") after();
  },
};

function paint(root, animate) {
  const screen = SCREENS[current.name] || home;
  root.innerHTML = screen.render(current.params);
  root.classList.remove("is-entering");
  if (animate) {
    // Reinicia la animación de entrada.
    void root.offsetWidth;
    root.classList.add("is-entering");
  }
  if (typeof screen.mount === "function") screen.mount(root, context);
}

function navigate() {
  closeSheet(true);
  current = parseHash();
  const root = document.getElementById("screen");
  paint(root, true);
  renderTabs();
  window.scrollTo(0, 0);
}

/* ================================================== Acciones globales === */

function movementSheet(movementId) {
  const movement = Store.getMovement(movementId);
  if (!movement) return;
  const isIncome = movement.type === "income";

  sheet({
    title: movement.concept,
    subtitle: formatLong(movement.date),
    body: `
      <div class="card">
        <div class="kv"><span class="k">Tipo</span><span class="v">${isIncome ? "Ingreso recibido" : "Gasto pagado"}</span></div>
        <div class="kv"><span class="k">Monto</span><span class="v num ${isIncome ? "pos" : ""}">${esc(money(movement.amount))}</span></div>
        <div class="kv"><span class="k">Categoría</span><span class="v">${esc(Store.categoryName(movement.category))}</span></div>
        <div class="kv"><span class="k">Saldo antes</span><span class="v num">${esc(money(movement.balanceBefore || 0))}</span></div>
        <div class="kv"><span class="k">Saldo después</span><span class="v num">${esc(money(movement.balanceAfter || 0))}</span></div>
        ${movement.note ? `<div class="kv"><span class="k">Nota</span><span class="v" style="font-weight:500;max-width:60%">${esc(movement.note)}</span></div>` : ""}
      </div>
      <div class="sheet-actions">
        ${movement.itemId ? `<button class="btn btn-outline" data-open-item>Ver concepto</button>` : ""}
        <button class="btn btn-danger" data-undo>${icon("refresh", 17, 2)} Deshacer movimiento</button>
      </div>`,
    onMount: (panel, close) => {
      const openItem = panel.querySelector("[data-open-item]");
      if (openItem) {
        openItem.addEventListener("click", () => {
          close();
          location.hash = `#/detalle/${encodeURIComponent(movement.itemId)}`;
        });
      }
      panel.querySelector("[data-undo]").addEventListener("click", async () => {
        close();
        await Forms.undoMovement(movement);
      });
    },
  });
}

const ACTIONS = {
  nav: (data) => { if (data.to) location.hash = data.to; },
  back: () => { if (window.history.length > 1) window.history.back(); else location.hash = "#/inicio"; },

  "quick-income": () => Forms.newIncome(),
  "quick-expense": () => Forms.newExpense(),
  "quick-pay": () => Forms.choosePayment(Finance.upcomingPayments()),

  "open-item": (data) => { if (data.id) location.hash = `#/detalle/${encodeURIComponent(data.id)}`; },
  "open-movement": (data) => movementSheet(data.id),

  pay: (data) => {
    const occ = Store.getOccurrence(data.occ);
    if (occ) Forms.payOccurrence(occ);
  },
  receive: (data) => {
    const occ = Store.getOccurrence(data.occ);
    if (occ) Forms.payOccurrence(occ);
  },
  "pay-item": (data) => {
    const item = Store.getItem(data.id);
    if (item) Forms.payItem(item);
  },
  "receive-item": (data) => {
    const item = Store.getItem(data.id);
    if (item) Forms.payItem(item);
  },
  "pay-heavy": (data) => {
    const item = Store.getItem(data.id);
    if (item) Forms.payHeavyDebt(item);
  },
  "edit-item": (data) => {
    const item = Store.getItem(data.id);
    if (item) Forms.editItem(item);
  },
  "edit-occ": (data) => {
    const occ = Store.getOccurrence(data.occ);
    if (occ) Forms.editOccurrence(occ);
  },
  undo: async (data) => {
    const movement = Store.getMovement(data.id);
    if (movement) await Forms.undoMovement(movement);
  },

  "close-cut": async (data) => {
    const expected = Number(data.expected) || 0;
    const received = Number(data.received) || 0;
    const diff = received - expected;
    const ok = await confirmSheet({
      title: "¿Cerrar este corte?",
      message: `Esperado ${money(expected)}, recibido ${money(received)} (${diff >= 0 ? "+" : ""}${money(diff)}). Se guarda en el historial y no se puede editar después. Los ingresos que ya registraste no se borran.`,
      confirmText: "Sí, cerrar corte",
    });
    if (!ok) return;
    await Store.closeCut({ start: data.start, end: data.end, expected, received });
    toast("Corte cerrado", "ok");
  },

  "new-expense": () => Forms.newExpense(),
  "new-expense-item": () => Forms.editItem(null, KIND.EXPENSE),
  "new-debt": () => Forms.editItem(null, KIND.DEBT),
  "new-heavy": () => Forms.editItem(null, KIND.HEAVY),
  "new-income-source": () => Forms.editItem(null, KIND.INCOME),
};

function bindGlobalActions() {
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const handler = ACTIONS[target.dataset.action];
    if (!handler) return;
    event.preventDefault();
    Promise.resolve(handler(target.dataset, target)).catch((err) => {
      console.error(err);
      toast(err.message || "Algo salió mal.", "err");
    });
  });

  // La barra de búsqueda de Inicio es un botón visual.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target.closest('[data-action="nav"]');
    if (target) {
      event.preventDefault();
      location.hash = target.dataset.to;
    }
  });
}

/* ================================================================ Boot === */

async function boot() {
  bindGlobalActions();

  try {
    const persistent = await Store.init();
    if (!persistent) {
      toast("No se pudo abrir el almacenamiento; los cambios no se guardarán.", "err");
    }
  } catch (err) {
    console.error("Error al iniciar:", err);
    toast("Hubo un problema al iniciar la app.", "err");
  }

  // Cada cambio de datos repinta la pantalla actual.
  Store.subscribe(() => {
    const root = document.getElementById("screen");
    if (!root) return;
    const scroll = window.scrollY;
    paint(root, false);
    window.scrollTo(0, scroll);
    renderTabs();
  });

  window.addEventListener("hashchange", navigate);

  // Al volver a la app tras un rato, se recalculan los vencimientos por si
  // cambió el día.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      Store.ensureOccurrences().catch(() => {});
    }
  });

  if (!location.hash) location.hash = "#/inicio";
  navigate();

  document.getElementById("app").hidden = false;
  document.getElementById("tabbar").hidden = false;
  const bootEl = document.getElementById("boot");
  bootEl.classList.add("is-out");
  setTimeout(() => bootEl.remove(), 320);
}

window.addEventListener("error", (event) => {
  console.error("Error no controlado:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Promesa rechazada:", event.reason);
});

boot();
