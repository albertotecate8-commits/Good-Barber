// Definiciones compartidas del modelo de datos.

/** Tipos de registro. */
export const KIND = {
  EXPENSE: "expense", // gasto fijo o suscripción
  DEBT: "debt",       // deuda con pago periódico
  HEAVY: "heavy",     // deuda fuerte (saldo grande, sin pago mensual fijo)
  INCOME: "income",   // ingreso esperado (semanal, mensual, extraordinario)
};

/** Estados de un vencimiento. */
export const STATUS = {
  PENDING: "pending",
  PAID: "paid",         // gasto o deuda pagado
  RECEIVED: "received", // ingreso recibido
  SKIPPED: "skipped",
};

export const DEFAULT_CATEGORIES = [
  { id: "casa", name: "Casa", type: "expense", color: "#4b6bec", order: 1 },
  { id: "local", name: "Local", type: "expense", color: "#e08600", order: 2 },
  { id: "deudas", name: "Deudas", type: "expense", color: "#e5484d", order: 3 },
  { id: "suscripciones", name: "Suscripciones", type: "expense", color: "#7c4fe0", order: 4 },
  { id: "fuertes", name: "Deudas fuertes", type: "expense", color: "#131313", order: 5 },
  { id: "otros", name: "Otros", type: "expense", color: "#8a8f94", order: 6 },
  { id: "barberia", name: "Barbería", type: "income", color: "#17a05c", order: 7 },
  { id: "unas", name: "Uñas", type: "income", color: "#b2e528", order: 8 },
  { id: "rentas", name: "Rentas", type: "income", color: "#4b6bec", order: 9 },
  { id: "afores", name: "Afores", type: "income", color: "#e08600", order: 10 },
  { id: "otros-ingresos", name: "Otros ingresos", type: "income", color: "#8a8f94", order: 11 },
];

/** Plantilla de item con todos los campos, para no guardar objetos incompletos. */
export function makeItem(data) {
  return {
    id: data.id,
    kind: data.kind,
    name: String(data.name || "").trim(),
    category: data.category || (data.kind === KIND.INCOME ? "otros-ingresos" : "otros"),
    amount: Number(data.amount) || 0,
    recurrence: data.recurrence || "once",
    startDate: data.startDate || null,   // primer vencimiento (null = todavía sin fecha)
    anchorDay: data.anchorDay || null,   // día del mes de referencia (para meses cortos)
    variable: !!data.variable,           // el monto cambia en cada periodo
    balance: data.balance == null ? null : Number(data.balance), // solo deudas fuertes
    statusNote: data.statusNote || "",   // "Esperando Afores", "Esperando la quita"…
    reference: data.reference || "",     // número de referencia / cuenta
    note: data.note || "",
    active: data.active !== false,
    seeded: !!data.seeded,
    createdAt: data.createdAt || new Date().toISOString(),
    updatedAt: data.updatedAt || new Date().toISOString(),
  };
}

export function makeOccurrence(data) {
  return {
    id: data.id,
    itemId: data.itemId,
    kind: data.kind,
    name: data.name,
    category: data.category,
    dueDate: data.dueDate,
    amount: Number(data.amount) || 0,   // monto esperado
    status: data.status || STATUS.PENDING,
    paidAmount: data.paidAmount == null ? null : Number(data.paidAmount),
    paidDate: data.paidDate || null,
    note: data.note || "",
    movementId: data.movementId || null,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

export function makeMovement(data) {
  return {
    id: data.id,
    type: data.type,                 // "income" | "expense"
    concept: data.concept,
    category: data.category || "otros",
    kind: data.kind || null,         // origen: expense | debt | heavy | income
    amount: Number(data.amount) || 0,
    date: data.date,
    status: data.status || "done",
    note: data.note || "",
    itemId: data.itemId || null,
    occurrenceId: data.occurrenceId || null,
    balanceBefore: data.balanceBefore == null ? null : Number(data.balanceBefore),
    balanceAfter: data.balanceAfter == null ? null : Number(data.balanceAfter),
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/** Efecto de un movimiento sobre el dinero disponible. */
export function signedAmount(movement) {
  return movement.type === "income" ? movement.amount : -movement.amount;
}
