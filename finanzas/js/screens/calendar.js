// CALENDARIO financiero: movimientos y vencimientos por día.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import {
  todayISO, parseISO, toISO, startOfMonth, endOfMonth, addMonths,
  formatLong, formatMonthYear, daysInMonth, DOW_SHORT,
} from "../dates.js";
import { icon, empty } from "../ui.js";
import { backHeader } from "../components.js";

let cursor = null;   // mes visible
let selected = null; // día seleccionado

function ensureState() {
  if (!cursor) cursor = startOfMonth(todayISO());
  if (!selected) selected = todayISO();
}

function grid() {
  const first = parseISO(startOfMonth(cursor));
  const total = daysInMonth(first.getFullYear(), first.getMonth());
  const lead = (first.getDay() + 6) % 7; // lunes = 0
  const index = Finance.calendarIndex(
    toISO(new Date(first.getFullYear(), first.getMonth(), 1 - lead, 12)),
    toISO(new Date(first.getFullYear(), first.getMonth() + 1, 7, 12))
  );

  const cells = [];

  for (let i = lead; i > 0; i -= 1) {
    const date = toISO(new Date(first.getFullYear(), first.getMonth(), 1 - i, 12));
    cells.push({ date, out: true });
  }
  for (let d = 1; d <= total; d += 1) {
    cells.push({ date: toISO(new Date(first.getFullYear(), first.getMonth(), d, 12)), out: false });
  }
  while (cells.length % 7 !== 0) {
    const last = parseISO(cells[cells.length - 1].date);
    last.setDate(last.getDate() + 1);
    cells.push({ date: toISO(last), out: true });
  }

  const today = todayISO();

  const html = cells.map((cell) => {
    const day = index.get(cell.date);
    const dots = [];
    if (day) {
      if (day.income) dots.push('<i class="dot income"></i>');
      if (day.paid) dots.push('<i class="dot paid"></i>');
      if (day.pending) dots.push('<i class="dot pending"></i>');
    }
    const classes = [
      "cal-day",
      cell.out ? "is-out" : "",
      cell.date === today ? "is-today" : "",
      cell.date === selected ? "is-sel" : "",
    ].filter(Boolean).join(" ");

    return `<button class="${classes}" data-day="${esc(cell.date)}">
      <span>${parseISO(cell.date).getDate()}</span>
      <span class="cal-dots">${dots.join("")}</span>
    </button>`;
  }).join("");

  return `
    <div class="cal-grid">
      ${DOW_SHORT.map((d) => `<div class="cal-dow">${d}</div>`).join("")}
      ${html}
    </div>`;
}

function dayDetail() {
  const index = Finance.calendarIndex(selected, selected);
  const day = index.get(selected);

  if (!day || !day.events.length) {
    return `<div class="card mt-14">${empty("Sin movimientos", "No hay nada registrado ese día.", "calendar")}</div>`;
  }

  const rows = day.events.map((event) => {
    const map = {
      income: ["c-ingreso", "income", "Ingreso", "paid", "pos", "+"],
      payment: ["c-otros", "expense", "Pago", "paid", "", "−"],
      due: ["c-deudas", "wallet", "Pago pendiente", selected < todayISO() ? "overdue" : "pending", "", ""],
      expected: ["c-ingreso", "income", "Ingreso esperado", "pending", "", "+"],
    };
    const [iconCls, glyph, label, chip, amountCls, sign] = map[event.type] || map.payment;

    return `
      <button class="row" data-action="${event.movementId ? "open-movement" : "open-item"}"
              data-id="${esc(event.movementId || event.itemId)}">
        <span class="row-ico ${iconCls}">${icon(glyph, 18)}</span>
        <span class="row-body">
          <span class="row-title">${esc(event.title)}</span>
          <span class="row-sub"><span class="chip ${chip}">${label}</span></span>
        </span>
        <span class="row-end"><span class="row-amount num ${amountCls}">${sign}${esc(money(event.amount))}</span></span>
      </button>`;
  }).join("");

  return `
    <div class="section-head">
      <h2 class="section-title">${esc(formatLong(selected))}</h2>
    </div>
    <div class="list">${rows}</div>`;
}

export default {
  render() {
    ensureState();

    return `
      ${backHeader("Calendario", "Movimientos por día")}

      <div class="card">
        <div class="cal-head">
          <button class="icon-btn is-outline" data-move="-1" aria-label="Mes anterior">${icon("back", 17, 2.2)}</button>
          <div class="cal-month">${esc(formatMonthYear(cursor))}</div>
          <button class="icon-btn is-outline" data-move="1" aria-label="Mes siguiente">${icon("chevron", 17, 2.2)}</button>
        </div>
        ${grid()}
        <div class="legend" style="margin-top:14px;flex-wrap:wrap">
          <span><i style="background:var(--lime-2);border-radius:50%"></i> Ingreso</span>
          <span><i style="background:var(--success);border-radius:50%"></i> Pagado</span>
          <span><i style="background:var(--warn);border-radius:50%"></i> Pendiente</span>
        </div>
      </div>

      ${dayDetail()}`;
  },

  mount(root, ctx) {
    root.querySelectorAll("[data-move]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cursor = startOfMonth(addMonths(cursor, Number(btn.dataset.move), 1));
        ctx.rerender();
      });
    });

    root.querySelectorAll("[data-day]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected = btn.dataset.day;
        if (selected < startOfMonth(cursor) || selected > endOfMonth(cursor)) {
          cursor = startOfMonth(selected);
        }
        ctx.rerender();
      });
    });
  },
};
