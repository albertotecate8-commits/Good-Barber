import type { ConnectionStatus } from "@/lib/data/types";
import { Badge } from "./ui";

const MAP: Record<ConnectionStatus, { tone: "neutral" | "positive" | "warn" | "danger" | "gold"; label: string }> = {
  not_connected: { tone: "neutral", label: "Sin conectar" },
  manual: { tone: "gold", label: "Registrado · sin conexión" },
  connected: { tone: "positive", label: "Conectado" },
  expired: { tone: "warn", label: "Permiso vencido" },
  error: { tone: "danger", label: "Error de conexión" },
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
