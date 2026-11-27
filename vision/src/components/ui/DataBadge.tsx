import type { DataQuality } from "@/lib/domain/types";
import { Badge } from "./primitives";

const LABELS: Record<DataQuality | "no_data", { text: string; tone: "success" | "info" | "accent" | "neutral" | "warning" }> = {
  real: { text: "Real", tone: "success" },
  estimated: { text: "Estimado", tone: "info" },
  manual: { text: "Manual", tone: "accent" },
  pending: { text: "Pendiente", tone: "neutral" },
  no_data: { text: "Sin datos", tone: "neutral" },
};

/** Etiqueta obligatoria del origen/calidad de cada dato mostrado. */
export function DataBadge({ quality }: { quality: DataQuality | "no_data" }) {
  const l = LABELS[quality];
  return <Badge tone={l.tone}>{l.text}</Badge>;
}
