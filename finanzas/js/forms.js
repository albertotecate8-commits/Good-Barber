// Flujos de captura: alta de ingresos y gastos, registro de pagos, edición de
// cualquier registro y abonos a deudas fuertes. Todos viven en hojas modales.

import * as Store from "./store.js";
import * as Finance from "./finance.js";
import { KIND, STATUS } from "./model.js";
import { money, parseMoney, esc, round2 } from "./format.js";
import { todayISO, formatLong, formatMedium, RECURRENCES, recurrenceLabel, isValidISO } from "./dates.js";
import { sheet, closeSheet, toast, celebrate, confirmSheet, icon } from "./ui.js";

/* ====================================================== Campos de forma == */

function fieldAmount(value, label) {
  return `
    <div class="field">
      <label for="f-amount">${esc(label || "Monto")}</label>
      <div class="amount-field" data-wrap="amount">
        <span class="cur">$</span>
        <input id="f-amount" name="amount" type="text" inputmode="decimal" size="1"
               autocomplete="off" placeholder="0.00" value="${value != null ? esc(value) : ""}">
      </div>
      <div class="field-error" data-error="amount" hidden></div>
    </div>`;
}

function fieldText(name, label, value, placeholder) {
  return `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <input id="f-${name}" name="${name}" class="input" type="text" autocomplete="off"
             placeholder="${esc(placeholder || "")}" value="${esc(value || "")}">
      <div class="field-error" data-error="${name}" hidden></div>
    </div>`;
}

function fieldDate(name, label, value) {
  return `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <input id="f-${name}" name="${name}" class="input" type="date" value="${esc(value || "")}">
      <div class="field-error" data-error="${name}" hidden></div>
    </div>`;
}

function fieldNote(value) {
  return `
    <div class="field">
      <label for="f-note">Nota (opcional)</label>
      <textarea id="f-note" name="note" class="textarea" placeholder="Algo que quieras recordar…">${esc(value || "")}</textarea>
    </div>`;
}

function fieldCategory(selected, type) {
  const list = Store.categories().filter((c) => (type ? c.type === type : true));
  const options = list
    .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? " selected" : ""}>${esc(c.name)}</option>`)
    .join("");
  return `
    <div class="field">
      <label for="f-category">Categoría</label>
      <select id="f-category" name="category" class="select">${options}</select>
    </div>`;
}

function fieldRecurrence(selected) {
  const options = RECURRENCES
    .map((r) => `<option value="${r.id}"${r.id === selected ? " selected" : ""}>${esc(r.label)}</option>`)
    .join("");
  return `
    <div class="field">
      <label for="f-recurrence">Periodicidad</label>
      <select id="f-recurrence" name="recurrence" class="select">${options}</select>
    </div>`;
}

function fieldSwitch(name, title, description, on) {
  return `
    <div class="switch-row">
      <div class="grow">
        <div class="sw-t">${esc(title)}</div>
        <div class="sw-d">${esc(description)}</div>
      </div>
      <button type="button" class="switch${on ? " is-on" : ""}" data-switch="${name}"
              role="switch" aria-checked="${on ? "true" : "false"}" aria-label="${esc(title)}"></button>
      <input type="hidden" name="${name}" value="${on ? "1" : "0"}">
    </div>`;
}

/* ================================================== Lectura y validación = */

function readForm(panel) {
  const data = {};
  panel.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name) return;
    data[el.name] = el.value;
  });
  return data;
}

function showError(panel, name, message) {
  const box = panel.querySelector(`[data-error="${name}"]`);
  if (box) {
    box.textContent = message;
    box.hidden = false;
  }
  const wrap = panel.querySelector(`[data-wrap="${name}"]`) || panel.querySelector(`[name="${name}"]`);
  if (wrap) wrap.classList.add("has-error");
}

function clearErrors(panel) {
  panel.querySelectorAll("[data-error]").forEach((el) => { el.hidden = true; });
  panel.querySelectorAll(".has-error").forEach((el) => el.classList.remove("has-error"));
}

/** Valida monto y fecha. Devuelve null si algo falla (y marca el campo). */
function validate(panel, data, { requireConcept } = {}) {
  clearErrors(panel);
  let ok = true;

  const amount = parseMoney(data.amount);
  if (!isFinite(amount) || amount <= 0) {
    showError(panel, "amount", "Escribe un monto mayor a cero.");
    ok = false;
  }

  if (data.date !== undefined && !isValidISO(data.date)) {
    showError(panel, "date", "Elige una fecha válida.");
    ok = false;
  }

  if (requireConcept && !String(data.concept || data.name || "").trim()) {
    showError(panel, data.concept !== undefined ? "concept" : "name", "Escribe un concepto.");
    ok = false;
  }

  return ok ? { ...data, amount: round2(amount) } : null;
}

/** Enlaza los interruptores y el botón de guardado de una hoja. */
function wire(panel, close, onSubmit) {
  panel.querySelectorAll("[data-switch]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const on = btn.classList.toggle("is-on");
      btn.setAttribute("aria-checked", on ? "true" : "false");
      const hidden = panel.querySelector(`input[name="${btn.dataset.switch}"]`);
      if (hidden) hidden.value = on ? "1" : "0";
      panel.dispatchEvent(new CustomEvent("switch-change", { detail: { name: btn.dataset.switch, on } }));
    });
  });

  const submit = panel.querySelector("[data-submit]");
  if (!submit) return;

  const run = async () => {
    submit.disabled = true;
    try {
      await onSubmit(readForm(panel), panel, close);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo guardar.", "err");
    } finally {
      submit.disabled = false;
    }
  };

  submit.addEventListener("click", run);
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      run();
    }
  });
}

/* ================================================= Ingreso rápido ======== */

export function newIncome(prefill) {
  sheet({
    title: "Registrar ingreso",
    subtitle: "Se suma al dinero disponible",
    body: `
      ${fieldText("concept", "Concepto", prefill && prefill.concept, "Uñas, barbería, renta…")}
      ${fieldAmount(prefill && prefill.amount, "Monto recibido")}
      ${fieldDate("date", "Fecha", (prefill && prefill.date) || todayISO())}
      ${fieldCategory((prefill && prefill.category) || "otros-ingresos", "income")}
      ${fieldNote()}
      <div class="sheet-actions">
        <button class="btn btn-lime" data-submit>${icon("check", 18, 2.4)} Guardar ingreso</button>
      </div>`,
    onMount: (panel, close) => {
      wire(panel, close, async (raw) => {
        const data = validate(panel, raw, { requireConcept: true });
        if (!data) return;
        await Store.addQuickMovement({
          type: "income",
          concept: data.concept,
          amount: data.amount,
          date: data.date,
          category: data.category,
          note: data.note,
        });
        close();
        celebrate("Ingreso registrado", money(data.amount));
      });
    },
  });
}

/* ==================================================== Gasto rápido ======= */

export function newExpense(prefill) {
  sheet({
    title: "Registrar gasto",
    subtitle: "Puede ser un gasto único o uno que se repite",
    body: `
      ${fieldText("concept", "Concepto", prefill && prefill.concept, "Comida, gasolina, luz…")}
      ${fieldAmount(prefill && prefill.amount, "Monto")}
      ${fieldDate("date", "Fecha", (prefill && prefill.date) || todayISO())}
      ${fieldCategory((prefill && prefill.category) || "otros", "expense")}
      ${fieldSwitch("recurring", "¿Es recurrente?", "Se repetirá automáticamente cada periodo", false)}
      <div data-when="recurring" hidden>${fieldRecurrence("monthly")}</div>
      <div data-when="single">
        ${fieldSwitch("paid", "Ya lo pagué", "Si lo apagas queda como pago pendiente", true)}
      </div>
      ${fieldNote()}
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>${icon("check", 18, 2.4)} Guardar gasto</button>
      </div>`,
    onMount: (panel, close) => {
      const recurringBox = panel.querySelector('[data-when="recurring"]');
      const singleBox = panel.querySelector('[data-when="single"]');

      panel.addEventListener("switch-change", (e) => {
        if (e.detail.name !== "recurring") return;
        recurringBox.hidden = !e.detail.on;
        singleBox.hidden = e.detail.on;
      });

      wire(panel, close, async (raw) => {
        const data = validate(panel, raw, { requireConcept: true });
        if (!data) return;

        const isRecurring = data.recurring === "1";

        if (isRecurring) {
          await Store.saveItem({
            kind: KIND.EXPENSE,
            name: data.concept,
            category: data.category,
            amount: data.amount,
            recurrence: data.recurrence || "monthly",
            startDate: data.date,
            note: data.note,
          });
          close();
          toast("Gasto recurrente creado", "ok");
          return;
        }

        if (data.paid === "1") {
          await Store.addQuickMovement({
            type: "expense",
            concept: data.concept,
            amount: data.amount,
            date: data.date,
            category: data.category,
            note: data.note,
          });
          close();
          celebrate("Gasto registrado", money(data.amount));
        } else {
          await Store.saveItem({
            kind: KIND.EXPENSE,
            name: data.concept,
            category: data.category,
            amount: data.amount,
            recurrence: "once",
            startDate: data.date,
            note: data.note,
          });
          close();
          toast("Pago pendiente creado", "ok");
        }
      });
    },
  });
}

/* ======================================================= Pagar ======== */

/** Registra el pago de un vencimiento. El monto es editable. */
export function payOccurrence(occ) {
  const item = Store.getItem(occ.itemId);
  const isIncome = occ.kind === KIND.INCOME;
  const progress = Finance.occurrenceProgress(occ);
  const hasPartial = progress.paid > 0;
  const suggested = hasPartial ? progress.remaining : occ.amount;

  const variableHint = item && item.variable && !hasPartial
    ? "Este concepto es de monto variable: puedes pagar una cantidad distinta."
    : "";

  sheet({
    title: isIncome ? `¿Cuánto recibiste?` : `¿Cuánto pagaste?`,
    subtitle: hasPartial
      ? `${occ.name} · ya abonaste ${money(progress.paid)} · restan ${money(progress.remaining)}`
      : `${occ.name} · esperado ${money(occ.amount)}`,
    body: `
      ${fieldAmount(suggested, isIncome ? "Monto recibido" : "Monto pagado")}
      ${variableHint ? `<p class="tiny muted" style="margin:-8px 0 14px">${esc(variableHint)}</p>` : ""}
      ${fieldDate("date", isIncome ? "Fecha de cobro" : "Fecha del pago", todayISO())}
      ${!isIncome ? fieldSwitch("partial", "Fue un pago parcial", "Si pagas menos, el resto sigue pendiente para después", false) : ""}
      ${fieldNote()}
      <div class="sheet-actions">
        <button class="btn ${isIncome ? "btn-lime" : "btn-ink"}" data-submit>
          ${icon("check", 18, 2.4)} ${isIncome ? "Confirmar cobro" : "Confirmar pago"}
        </button>
      </div>`,
    onMount: (panel, close) => {
      const input = panel.querySelector('[name="amount"]');
      if (input) setTimeout(() => { input.select && input.select(); }, 40);

      wire(panel, close, async (raw) => {
        const data = validate(panel, raw);
        if (!data) return;
        const result = await Store.payOccurrence(occ.id, {
          amount: data.amount, date: data.date, note: data.note, partial: raw.partial === "1",
        });
        close();
        if (result.partial) {
          celebrate("Abono registrado", money(data.amount));
          toast(`Restan ${money(result.remaining)} de este pago`, "ok");
        } else {
          celebrate(isIncome ? "Recibido" : "Pagado", money(data.amount));
        }
      });
    },
  });
}

/** Pago o cobro de un item sin vencimiento programado (Afores, Gas, etc.). */
export function payItem(item) {
  const isIncome = item.kind === KIND.INCOME;
  sheet({
    title: isIncome ? "¿Cuánto recibiste?" : "¿Cuánto pagaste?",
    subtitle: item.name,
    body: `
      ${fieldAmount(item.amount || "", isIncome ? "Monto recibido" : "Monto pagado")}
      ${fieldDate("date", "Fecha", todayISO())}
      ${fieldNote()}
      <div class="sheet-actions">
        <button class="btn ${isIncome ? "btn-lime" : "btn-ink"}" data-submit>
          ${icon("check", 18, 2.4)} ${isIncome ? "Confirmar cobro" : "Confirmar pago"}
        </button>
      </div>`,
    onMount: (panel, close) => {
      wire(panel, close, async (raw) => {
        const data = validate(panel, raw);
        if (!data) return;
        await Store.payItemDirect(item.id, { amount: data.amount, date: data.date, note: data.note });
        close();
        celebrate(isIncome ? "Recibido" : "Pagado", money(data.amount));
      });
    },
  });
}

/** Abono a una deuda fuerte: parcial o total. */
export function payHeavyDebt(item) {
  sheet({
    title: "Abonar a la deuda",
    subtitle: `${item.name} · saldo ${money(item.balance || 0)}`,
    body: `
      ${fieldAmount("", "Monto del abono")}
      <div class="chips-pick" style="margin:-6px 0 14px">
        <button type="button" data-quick="all">Pagar todo (${esc(money(item.balance || 0))})</button>
        <button type="button" data-quick="half">La mitad</button>
      </div>
      ${fieldDate("date", "Fecha del abono", todayISO())}
      ${fieldNote()}
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>${icon("check", 18, 2.4)} Registrar abono</button>
      </div>`,
    onMount: (panel, close) => {
      const input = panel.querySelector('[name="amount"]');
      panel.querySelectorAll("[data-quick]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const total = item.balance || 0;
          input.value = String(btn.dataset.quick === "all" ? total : round2(total / 2));
        });
      });

      wire(panel, close, async (raw) => {
        const data = validate(panel, raw);
        if (!data) return;
        if (data.amount > (item.balance || 0)) {
          const ok = await confirmSheet({
            title: "El abono supera el saldo",
            message: `El saldo es ${money(item.balance || 0)} y quieres abonar ${money(data.amount)}. ¿Registrarlo de todas formas? El saldo quedará en cero.`,
            confirmText: "Sí, registrar",
          });
          if (!ok) return;
        }
        const before = item.balance || 0;
        await Store.payItemDirect(item.id, { amount: data.amount, date: data.date, note: data.note });
        close();
        const after = round2(Math.max(0, before - data.amount));
        celebrate(after <= 0 ? "Deuda saldada" : "Abono registrado", money(data.amount));
        toast(after <= 0 ? "Saldo restante: $0.00 — deuda saldada" : `Saldo restante: ${money(after)}`, "ok");
      });
    },
  });
}

/** Cambia a mano el saldo, la categoría, el estado y el nombre de una deuda fuerte. */
export function editHeavyDebt(item) {
  sheet({
    title: "Editar deuda fuerte",
    subtitle: item.name,
    body: `
      ${fieldText("name", "Nombre", item.name)}
      ${fieldAmount(item.balance || 0, "Saldo actual")}
      ${fieldCategory(item.category || "fuertes", "expense")}
      ${fieldText("statusNote", "Estado", item.statusNote, "Esperando Afores…")}
      ${fieldSwitch("active", "Activa", "Si la desactivas, deja de aparecer como deuda pendiente. El historial de abonos no se toca", item.active !== false)}
      ${fieldNote(item.note)}
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>Guardar cambios</button>
        <button class="btn btn-danger" data-delete>${icon("trash", 17, 2)} Eliminar deuda</button>
      </div>`,
    onMount: (panel, close) => {
      panel.querySelector("[data-delete]").addEventListener("click", async () => {
        const ok = await confirmSheet({
          title: `¿Eliminar ${item.name}?`,
          message: "Se quitará de la lista de deudas fuertes. Los abonos que ya registraste se conservan en el historial.",
          confirmText: "Sí, eliminar",
          danger: true,
        });
        if (!ok) return;
        await Store.deleteItem(item.id);
        toast("Deuda eliminada", "ok");
        location.hash = "#/deudas";
      });

      wire(panel, close, async (raw) => {
        const amount = parseMoney(raw.amount);
        clearErrors(panel);
        if (!isFinite(amount) || amount < 0) {
          showError(panel, "amount", "El saldo no puede ser negativo.");
          return;
        }
        if (!String(raw.name || "").trim()) {
          showError(panel, "name", "Escribe un nombre.");
          return;
        }
        await Store.saveItem({
          ...item, name: raw.name, category: raw.category, note: raw.note,
          active: raw.active === "1",
        });
        await Store.setHeavyBalance(item.id, amount, raw.statusNote);
        close();
        toast("Deuda actualizada", "ok");
      });
    },
  });
}

/* =============================================== Editor completo de item = */

const KIND_TITLES = {
  [KIND.EXPENSE]: "gasto",
  [KIND.DEBT]: "deuda",
  [KIND.INCOME]: "ingreso",
  [KIND.HEAVY]: "deuda fuerte",
};

export function editItem(item, kindHint) {
  const kind = item ? item.kind : kindHint || KIND.EXPENSE;

  if (kind === KIND.HEAVY && item) return editHeavyDebt(item);

  const isIncome = kind === KIND.INCOME;
  const isNew = !item;
  const current = item || {
    name: "", amount: "", category: isIncome ? "otros-ingresos" : kind === KIND.DEBT ? "deudas" : "otros",
    recurrence: "monthly", startDate: todayISO(), variable: false, note: "", reference: "", balance: null,
  };

  if (kind === KIND.HEAVY) {
    // Alta de deuda fuerte: solo nombre, saldo y estado.
    sheet({
      title: "Nueva deuda fuerte",
      subtitle: "No genera pagos mensuales automáticos",
      body: `
        ${fieldText("name", "Nombre", "", "Denisse, BBVA…")}
        ${fieldAmount("", "Saldo")}
        ${fieldCategory("fuertes", "expense")}
        ${fieldText("statusNote", "Estado", "", "Esperando la quita…")}
        ${fieldNote()}
        <div class="sheet-actions">
          <button class="btn btn-ink" data-submit>Crear deuda fuerte</button>
        </div>`,
      onMount: (panel, close) => {
        wire(panel, close, async (raw) => {
          const data = validate(panel, raw);
          if (!data) return;
          if (!String(raw.name || "").trim()) { showError(panel, "name", "Escribe un nombre."); return; }
          await Store.saveItem({
            kind: KIND.HEAVY, name: raw.name, category: raw.category || "fuertes", amount: 0,
            balance: data.amount, recurrence: "once", startDate: null,
            statusNote: raw.statusNote, note: raw.note,
          });
          close();
          toast("Deuda fuerte creada", "ok");
        });
      },
    });
    return;
  }

  sheet({
    title: isNew ? `Nuevo ${KIND_TITLES[kind]}` : `Editar ${KIND_TITLES[kind]}`,
    subtitle: isNew ? "" : current.name,
    body: `
      ${fieldText("name", "Nombre", current.name, isIncome ? "Barbería, uñas, renta…" : "Luz, renta, Netflix…")}
      ${fieldAmount(current.amount, isIncome ? "Monto esperado" : "Monto configurado")}
      ${fieldCategory(current.category, isIncome ? "income" : "expense")}
      ${fieldRecurrence(current.recurrence)}
      ${fieldDate("startDate", isIncome ? "Próximo cobro" : "Próximo vencimiento", current.startDate || "")}
      <p class="tiny muted" style="margin:-8px 0 14px">Si lo dejas vacío, el concepto queda sin programar y puedes registrarlo manualmente cuando ocurra.</p>
      ${fieldSwitch("variable", "Monto variable", "Cada periodo puedes pagar una cantidad distinta", !!current.variable)}
      ${!isNew ? fieldSwitch("active", "Activa", "Si la desactivas, deja de generar vencimientos futuros. Lo pendiente y el historial no se tocan", current.active !== false) : ""}
      ${kind === KIND.EXPENSE || kind === KIND.DEBT ? fieldText("reference", "Referencia (opcional)", current.reference, "Número de cuenta o referencia") : ""}
      ${fieldNote(current.note)}
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>${isNew ? "Crear" : "Guardar cambios"}</button>
        ${isNew ? "" : `<button class="btn btn-danger" data-delete>${icon("trash", 17, 2)} Eliminar</button>`}
      </div>`,
    onMount: (panel, close) => {
      const del = panel.querySelector("[data-delete]");
      if (del) {
        del.addEventListener("click", async () => {
          const ok = await confirmSheet({
            title: `¿Eliminar ${item.name}?`,
            message: "Se quitarán sus pagos pendientes. Los pagos ya registrados se conservan en el historial.",
            confirmText: "Sí, eliminar",
            danger: true,
          });
          if (!ok) return;
          await Store.deleteItem(item.id);
          closeSheet();
          toast("Registro eliminado", "ok");
          location.hash = isIncome ? "#/ingresos" : kind === KIND.DEBT ? "#/deudas" : "#/gastos";
        });
      }

      wire(panel, close, async (raw) => {
        clearErrors(panel);
        const amount = parseMoney(raw.amount);
        if (!isFinite(amount) || amount < 0) {
          showError(panel, "amount", "Escribe un monto válido.");
          return;
        }
        if (!String(raw.name || "").trim()) {
          showError(panel, "name", "Escribe un nombre.");
          return;
        }
        if (raw.startDate && !isValidISO(raw.startDate)) {
          showError(panel, "startDate", "Elige una fecha válida.");
          return;
        }

        await Store.saveItem({
          id: item ? item.id : undefined,
          kind,
          name: raw.name,
          category: raw.category,
          amount: round2(amount),
          recurrence: raw.recurrence,
          startDate: raw.startDate || null,
          anchorDay: raw.startDate ? Number(raw.startDate.slice(8, 10)) : null,
          variable: raw.variable === "1",
          active: isNew ? true : raw.active === "1",
          reference: raw.reference || "",
          note: raw.note || "",
        });
        close();
        toast(isNew ? "Registro creado" : "Cambios guardados", "ok");
      });
    },
  });
}

/* ============================= Ajustes puntuales de un vencimiento ======= */

/** Cambia el monto esperado de un solo periodo, sin tocar los demás. */
export function editOccurrence(occ) {
  sheet({
    title: "Ajustar este periodo",
    subtitle: `${occ.name} · ${formatLong(occ.dueDate)}`,
    body: `
      ${fieldAmount(occ.amount, "Monto esperado")}
      ${fieldDate("date", "Fecha de vencimiento", occ.dueDate)}
      <p class="tiny muted" style="margin:-8px 0 14px">Solo cambia este periodo. Los demás siguen igual.</p>
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>Guardar</button>
      </div>`,
    onMount: (panel, close) => {
      wire(panel, close, async (raw) => {
        const data = validate(panel, raw);
        if (!data) return;
        if (data.date !== occ.dueDate) await Store.setOccurrenceDate(occ.id, data.date);
        const current = Store.getOccurrence(occ.id) || occ;
        if (data.amount !== current.amount) await Store.setOccurrenceAmount(current.id, data.amount);
        close();
        toast("Periodo actualizado", "ok");
      });
    },
  });
}

/** Deshace un pago ya registrado. */
export async function undoMovement(movement) {
  const ok = await confirmSheet({
    title: "¿Deshacer este movimiento?",
    message: `Se eliminará "${movement.concept}" por ${money(movement.amount)} del ${formatMedium(movement.date)} y el saldo volverá como estaba. Si venía de un pago programado, volverá a quedar pendiente.`,
    confirmText: "Sí, deshacer",
    danger: true,
  });
  if (!ok) return false;
  await Store.undoMovement(movement.id);
  toast("Movimiento deshecho", "ok");
  return true;
}

/* ================================ Selector de pago (acción rápida ✓ PAGO) = */

export function choosePayment(pending) {
  if (!pending.length) {
    toast("No tienes pagos pendientes", "ok");
    return;
  }

  const rows = pending.slice(0, 40).map((occ) => {
    const overdue = occ.dueDate <= todayISO();
    const progress = Finance.occurrenceProgress(occ);
    return `
      <button class="row" data-pay="${esc(occ.id)}">
        <span class="row-ico c-${esc(occ.category)}">${icon("wallet", 18)}</span>
        <span class="row-body">
          <span class="row-title">${esc(occ.name)}</span>
          <span class="row-sub">
            <span class="chip ${overdue ? "overdue" : "pending"}">${overdue ? "Vencido" : "Pendiente"}</span>
            ${esc(formatMedium(occ.dueDate))}
          </span>
        </span>
        <span class="row-end">
          <span class="row-amount num">${esc(money(progress.paid > 0 ? progress.remaining : occ.amount))}</span>
          ${progress.paid > 0 ? `<span class="row-meta">abonado ${esc(money(progress.paid))}</span>` : ""}
        </span>
      </button>`;
  }).join("");

  sheet({
    title: "Registrar un pago",
    subtitle: "Elige qué vas a pagar",
    body: `<div class="list">${rows}</div>`,
    onMount: (panel, close) => {
      panel.querySelectorAll("[data-pay]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const occ = Store.getOccurrence(btn.dataset.pay);
          close();
          if (occ) setTimeout(() => payOccurrence(occ), 220);
        });
      });
    },
  });
}

/* ======================================== Saldo inicial y desglose ======= */

/** Permite configurar (o corregir) el saldo inicial — $0 si nunca se define. */
export function editInitialBalance() {
  const current = Store.initialBalance();
  sheet({
    title: "Saldo inicial",
    subtitle: "Lo que tenías antes de usar la app (efectivo, cuenta…)",
    body: `
      ${fieldAmount(current || "", "Saldo inicial")}
      <p class="tiny muted" style="margin:-8px 0 4px">
        Si lo dejas en $0, el dinero disponible será exactamente ingresos recibidos menos gastos pagados.
        Este monto se suma siempre a esa cuenta — nunca se inventa.
      </p>
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>Guardar saldo inicial</button>
      </div>`,
    onMount: (panel, close) => {
      wire(panel, close, async (raw) => {
        clearErrors(panel);
        const amount = parseMoney(raw.amount === "" ? "0" : raw.amount);
        if (!isFinite(amount)) {
          showError(panel, "amount", "Escribe un monto válido.");
          return;
        }
        await Store.setInitialBalance(amount);
        close();
        toast("Saldo inicial actualizado", "ok");
      });
    },
  });
}

/** Muestra de dónde sale exactamente el dinero disponible mostrado en Inicio. */
export function showAvailableBreakdown() {
  const b = Store.moneyBreakdown();
  sheet({
    title: "Dinero disponible",
    subtitle: "De dónde sale esta cifra",
    body: `
      <div class="card">
        <div class="kv"><span class="k">Saldo inicial</span><span class="v num">${esc(money(b.initial))}</span></div>
        <div class="kv"><span class="k">Ingresos recibidos (total)</span><span class="v num pos">+${esc(money(b.received))}</span></div>
        <div class="kv"><span class="k">Gastos/pagos realizados (total)</span><span class="v num">−${esc(money(b.paid))}</span></div>
        <div class="kv" style="border-top:1px solid rgba(19,19,19,.08);margin-top:6px;padding-top:10px">
          <span class="k" style="font-weight:700">Dinero disponible</span>
          <span class="v num" style="font-weight:700">${esc(money(b.total))}</span>
        </div>
      </div>
      <p class="tiny muted mt-14">
        No incluye ingresos esperados que aún no has recibido ni pagos pendientes que aún no haces —
        esos se muestran aparte, en "Próximos 7 días" y en cada sección.
      </p>
      <div class="sheet-actions">
        <button class="btn btn-outline" data-action-edit-initial>Editar saldo inicial</button>
      </div>`,
    onMount: (panel, close) => {
      const btn = panel.querySelector("[data-action-edit-initial]");
      if (btn) {
        btn.addEventListener("click", () => {
          close();
          setTimeout(() => editInitialBalance(), 200);
        });
      }
    },
  });
}

export { STATUS };
