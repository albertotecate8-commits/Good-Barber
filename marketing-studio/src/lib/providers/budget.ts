import { PROVIDERS, type Provider } from "./registry";

// Presupuesto adicional autorizado para APIs: $0 MXN. Es una constante a
// propósito (no una variable de entorno): subirla requiere un cambio de código
// revisado y tu autorización explícita.
export const MONTHLY_BUDGET_MXN = 0;

export class BudgetError extends Error {
  constructor(
    message: string,
    readonly providerId: string,
  ) {
    super(message);
    this.name = "BudgetError";
  }
}

export interface UsageRequest {
  providerId: string;
  /** Costo estimado de ESTA llamada en MXN (0 para niveles gratuitos). */
  estimatedCostMXN: number;
  /** Llamadas ya hechas hoy a este proveedor (del registro de uso). */
  usedToday: number;
  /** Gasto acumulado del mes en MXN (del registro de uso). */
  spentThisMonthMXN: number;
}

/**
 * Se llama ANTES de cada invocación a un proveedor externo. Lanza si la
 * llamada pudiera generar un gasto o rebasar el tope diario autoimpuesto.
 */
export function assertCallAllowed(req: UsageRequest, providers: Provider[] = PROVIDERS): Provider {
  const p = providers.find((x) => x.id === req.providerId);
  if (!p) throw new BudgetError(`Proveedor desconocido: ${req.providerId}`, req.providerId);
  if (p.access === "paid_blocked")
    throw new BudgetError(`${p.name} es de pago y está bloqueado por la regla de gasto $0.`, p.id);
  if (p.access === "assisted")
    throw new BudgetError(`${p.name} no tiene API utilizable: usa el flujo asistido.`, p.id);
  if (!Number.isFinite(req.estimatedCostMXN) || req.estimatedCostMXN < 0)
    throw new BudgetError("Costo estimado inválido.", p.id);
  if (req.spentThisMonthMXN + req.estimatedCostMXN > MONTHLY_BUDGET_MXN)
    throw new BudgetError(
      `La llamada costaría $${req.estimatedCostMXN} MXN y el presupuesto autorizado es $${MONTHLY_BUDGET_MXN} MXN.`,
      p.id,
    );
  if (p.dailyCap !== undefined && req.usedToday >= p.dailyCap)
    throw new BudgetError(`Se alcanzó el tope diario de ${p.dailyCap} usos de ${p.name}. Se reanuda mañana.`, p.id);
  return p;
}
