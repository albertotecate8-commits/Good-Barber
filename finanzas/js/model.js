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

/** Los tres negocios. Viven en una tabla editable; esto es solo la semilla. */
export const DEFAULT_BUSINESSES = [
  { id: "barberia", name: "Barbería", color: "#3d8b98", order: 1, active: true },
  { id: "unas", name: "Uñas", color: "#8284bd", order: 2, active: true },
  { id: "afores", name: "Afores", color: "#5b7fb5", order: 3, active: true },
];

/**
 * Barbería y Uñas se reparten con la socia: se registra el TOTAL del negocio
 * y la app muestra al lado cuánto le toca a cada quien (fracción que es tuya).
 */
export const PARTNER_SHARE = { barberia: 0.5, unas: 0.5 };

/** Lo que hay que apartar cada semana para cubrir los gastos del local. */
export const LOCAL_WEEKLY_RESERVE = 1100;

export const DEFAULT_CATEGORIES = [
  { id: "casa", name: "Casa", type: "expense", color: "#4b6bec", order: 1, businessId: null },
  { id: "local", name: "Local", type: "expense", color: "#e08600", order: 2, businessId: null },
  { id: "deudas", name: "Deudas", type: "expense", color: "#e5484d", order: 3, businessId: null },
  { id: "suscripciones", name: "Suscripciones", type: "expense", color: "#7c4fe0", order: 4, businessId: null },
  { id: "fuertes", name: "Deudas fuertes", type: "expense", color: "#131313", order: 5, businessId: null },
  { id: "otros", name: "Otros", type: "expense", color: "#8a8f94", order: 6, businessId: null },
  { id: "barberia", name: "Barbería", type: "income", color: "#3d8b98", order: 7, businessId: null },
  { id: "unas", name: "Uñas", type: "income", color: "#8284bd", order: 8, businessId: null },
  { id: "rentas", name: "Rentas", type: "income", color: "#4b6bec", order: 9, businessId: null },
  { id: "afores", name: "Afores", type: "income", color: "#e08600", order: 10, businessId: null },
  { id: "otros-ingresos", name: "Otros ingresos", type: "income", color: "#8a8f94", order: 11, businessId: null },

  // ------------------------------------------------- Categorías por negocio --
  { id: "cortes", name: "Cortes", type: "income", color: "#3d8b98", order: 20, businessId: "barberia" },
  { id: "servicios-adicionales", name: "Servicios adicionales", type: "income", color: "#3d8b98", order: 21, businessId: "barberia" },
  { id: "productos-barberia", name: "Productos", type: "expense", color: "#3d8b98", order: 22, businessId: "barberia" },
  { id: "materiales-barberia", name: "Materiales", type: "expense", color: "#3d8b98", order: 23, businessId: "barberia" },
  { id: "renta-barberia", name: "Renta", type: "expense", color: "#3d8b98", order: 24, businessId: "barberia" },
  { id: "servicios-barberia", name: "Servicios", type: "expense", color: "#3d8b98", order: 25, businessId: "barberia" },
  { id: "publicidad-barberia", name: "Publicidad", type: "expense", color: "#3d8b98", order: 26, businessId: "barberia" },
  { id: "otros-barberia", name: "Otros", type: "expense", color: "#3d8b98", order: 27, businessId: "barberia" },

  { id: "servicios-unas", name: "Servicios", type: "income", color: "#8284bd", order: 30, businessId: "unas" },
  { id: "aplicaciones", name: "Aplicaciones", type: "income", color: "#8284bd", order: 31, businessId: "unas" },
  { id: "retiros", name: "Retiros", type: "income", color: "#8284bd", order: 32, businessId: "unas" },
  { id: "materiales-unas", name: "Materiales", type: "expense", color: "#8284bd", order: 33, businessId: "unas" },
  { id: "productos-unas", name: "Productos", type: "expense", color: "#8284bd", order: 34, businessId: "unas" },
  { id: "comisiones-unas", name: "Comisiones", type: "expense", color: "#8284bd", order: 35, businessId: "unas" },
  { id: "renta-unas", name: "Renta", type: "expense", color: "#8284bd", order: 36, businessId: "unas" },
  { id: "otros-unas", name: "Otros", type: "expense", color: "#8284bd", order: 37, businessId: "unas" },

  { id: "comisiones-afores", name: "Comisiones", type: "income", color: "#e08600", order: 40, businessId: "afores" },
  { id: "servicios-afores", name: "Servicios", type: "income", color: "#e08600", order: 41, businessId: "afores" },
  { id: "publicidad-afores", name: "Publicidad", type: "expense", color: "#e08600", order: 42, businessId: "afores" },
  { id: "traslados-afores", name: "Traslados", type: "expense", color: "#e08600", order: 43, businessId: "afores" },
  { id: "papeleria-afores", name: "Papelería", type: "expense", color: "#e08600", order: 44, businessId: "afores" },
  { id: "otros-afores", name: "Otros", type: "expense", color: "#e08600", order: 45, businessId: "afores" },
];

/** Plantilla de item con todos los campos, para no guardar objetos incompletos. */
export function makeItem(data) {
  return {
    id: data.id,
    kind: data.kind,
    name: String(data.name || "").trim(),
    category: data.category || (data.kind === KIND.INCOME ? "otros-ingresos" : "otros"),
    businessId: data.businessId || null, // null = general/personal, no es de Barbería/Uñas/Afores
    amount: Number(data.amount) || 0,
    recurrence: data.recurrence || "once",
    startDate: data.startDate || null,   // primer vencimiento (null = todavía sin fecha)
    anchorDay: data.anchorDay || null,   // día del mes de referencia (para meses cortos)
    variable: !!data.variable,           // el monto cambia en cada periodo
    cutBased: !!data.cutBased,           // ingreso semanal ligado al corte domingo-sábado, sin día fijo
    balance: data.balance == null ? null : Number(data.balance), // solo deudas fuertes
    statusNote: data.statusNote || "",   // "Esperando Afores", "Esperando la quita"…
    reference: data.reference || "",     // número de referencia / cuenta
    note: data.note || "",
    active: data.active !== false,
    canceledAt: data.canceledAt || null, // fecha en que se desactivó (null si está activo o nunca se canceló)
    seeded: !!data.seeded,
    createdBy: data.createdBy || null, // uuid de quién lo creó (null = de antes de que existiera login)
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
    businessId: data.businessId || null,
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
    businessId: data.businessId || null,
    kind: data.kind || null,         // origen: expense | debt | heavy | income
    amount: Number(data.amount) || 0,
    date: data.date,
    status: data.status || "done",
    note: data.note || "",
    itemId: data.itemId || null,
    occurrenceId: data.occurrenceId || null,
    partial: !!data.partial,          // true = abono parcial; el vencimiento sigue pendiente
    balanceBefore: data.balanceBefore == null ? null : Number(data.balanceBefore),
    balanceAfter: data.balanceAfter == null ? null : Number(data.balanceAfter),
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/** Plantilla de perfil de usuario (Administrador / Colaborador). */
export function makeProfile(data) {
  return {
    id: data.id,
    email: data.email || "",
    name: data.name || "",
    role: data.role === "admin" ? "admin" : "collaborator",
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/** Efecto de un movimiento sobre el dinero disponible. */
export function signedAmount(movement) {
  return movement.type === "income" ? movement.amount : -movement.amount;
}
