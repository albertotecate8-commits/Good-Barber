// Pantalla de UN negocio (Barbería, Uñas o Afores): su ganancia del mes y
// de la semana, movimientos recientes, y acceso directo a registrar,
// historial y estadísticas — todo filtrado a ese negocio únicamente.

import * as Store from "../store.js";
import * as Finance from "../finance.js";
import { money, esc } from "../format.js";
import { todayISO, startOfMonth, endOfMonth, formatMonthYear, formatCutRange } from "../dates.js";
import { icon, empty } from "../ui.js";
import { backHeader, movementRow } from "../components.js";

export default {
  render(params) {
    const id = params && params.id;
    const b = id ? Store.getBusiness(id) : null;
    if (!b) {
      return `${backHeader("Negocio", "")}<div class="card">${empty("No encontrado", "Puede que este negocio haya sido eliminado.", "wallet")}</div>`;
    }

    const today = todayISO();
    const month = Finance.businessSummary(b.id, startOfMonth(today), endOfMonth(today));
    const weekRange = Finance.weekRangeFor(today);
    const week = Finance.businessSummary(b.id, weekRange.start, weekRange.end);
    const neg = month.net < 0;

    const recent = Store.movements()
      .filter((m) => m.businessId === b.id)
      .sort((a, b2) => (a.date === b2.date ? (a.createdAt < b2.createdAt ? 1 : -1) : a.date < b2.date ? 1 : -1))
      .slice(0, 10);

    return `
      ${backHeader(b.name, `Negocio · ${esc(formatMonthYear(today))}`)}

      <section class="card-dark" style="border-top:4px solid ${esc(b.color)}">
        <div class="hero-label" style="text-align:left">Ganancia del mes (flujo neto)</div>
        <div class="hero-amount num" style="text-align:left;font-size:32px">${esc(money(month.net))}</div>
        <div class="mini-grid mt-14">
          <div class="mini">
            <div class="k">Ingresos recibidos</div>
            <div class="v lime num">${esc(money(month.income))}</div>
          </div>
          <div class="mini">
            <div class="k">Gastos pagados</div>
            <div class="v num">${esc(money(month.paid))}</div>
          </div>
          <div class="mini">
            <div class="k">Pendiente del mes</div>
            <div class="v warn num">${esc(money(month.pending))}</div>
          </div>
        </div>
      </section>

      <div class="section-head mt-14">
        <h2 class="section-title">Esta semana</h2>
        <span class="section-link">${esc(formatCutRange(weekRange.start, weekRange.end))}</span>
      </div>
      <div class="card">
        <div class="kv"><span class="k">Ingresos</span><span class="v num pos">${esc(money(week.income))}</span></div>
        <div class="kv"><span class="k">Gastos</span><span class="v num">${esc(money(week.paid))}</span></div>
        <div class="kv" style="border-top:1.5px solid rgba(19,19,19,.08);margin-top:4px;padding-top:10px">
          <span class="k strong" style="font-weight:700">Ganancia</span>
          <span class="v num ${week.net < 0 ? "neg" : "pos"}" style="font-weight:700">${esc(money(week.net))}</span>
        </div>
      </div>

      <div class="btn-row mt-14">
        <button class="btn btn-lime" data-action="negocio-ingreso" data-business="${esc(b.id)}">${icon("plus", 18, 2.4)} Ingreso</button>
        <button class="btn btn-ink" data-action="negocio-gasto" data-business="${esc(b.id)}">${icon("minus", 18, 2.4)} Gasto</button>
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" data-action="nav" data-to="#/historial/${esc(b.id)}">${icon("history", 17)} Historial</button>
        <button class="btn btn-outline" data-action="nav" data-to="#/mensual/${esc(b.id)}">${icon("chart", 17)} Estadísticas</button>
      </div>

      <div class="section-head mt-14">
        <h2 class="section-title">Movimientos recientes</h2>
        <button class="section-link" data-action="nav" data-to="#/historial/${esc(b.id)}">Ver todo ${icon("chevron", 13, 2.4)}</button>
      </div>
      ${recent.length
        ? `<div class="list">${recent.map(movementRow).join("")}</div>`
        : `<div class="card">${empty("Sin movimientos todavía", "Registra el primer ingreso o gasto de este negocio.", "wallet")}</div>`}`;
  },

  mount() {},
};
