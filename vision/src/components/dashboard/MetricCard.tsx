import type { ReactNode } from "react";
import type { Indicator } from "@/lib/domain/indicators";
import { DataBadge } from "../ui/DataBadge";
import { Badge } from "../ui/primitives";

export function MetricCard({ label, icon, indicator }: { label: string; icon: ReactNode; indicator: Indicator }) {
  return (
    <div className={`metric metric-${indicator.state}`}>
      <div className="metric-head">
        <span className="metric-icon">{icon}</span>
        <span className="metric-label">{label}</span>
      </div>
      {indicator.state === "value" ? (
        <>
          <div className="metric-value">{indicator.display}</div>
          <div className="metric-foot">
            <DataBadge quality={indicator.quality} />
            {indicator.stale && <Badge tone="warning">Desactualizado</Badge>}
          </div>
          {indicator.detail && <p className="metric-detail">{indicator.detail}</p>}
        </>
      ) : (
        <>
          <div className="metric-value metric-value-empty">—</div>
          <div className="metric-foot">
            <DataBadge quality={indicator.state === "pending" ? "pending" : "no_data"} />
          </div>
          <p className="metric-detail">{indicator.reason}</p>
        </>
      )}
    </div>
  );
}

/** Valor compacto para tablas comparativas. */
export function IndicatorInline({ indicator }: { indicator: Indicator }) {
  if (indicator.state === "value") {
    return (
      <span className="inline-ind">
        <strong>{indicator.display}</strong>
        {indicator.quality === "estimated" && <small className="muted"> est.</small>}
      </span>
    );
  }
  return <span className="inline-ind muted">{indicator.state === "pending" ? "Pendiente" : "Sin datos"}</span>;
}
