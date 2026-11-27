"use client";

import type { Business, CameraOverview, SecurityEvent } from "@/lib/domain/types";
import { SECURITY_CATEGORY_LABELS, SECURITY_KIND_LABELS, SECURITY_STATUS_LABELS } from "@/lib/domain/types";
import type { EngineStatus } from "@/lib/domain/indicators";
import { formatDateTime } from "@/lib/domain/time";
import { useSite } from "@/lib/site/SiteProvider";
import { Badge, Button, EmptyState } from "../ui/primitives";
import { IconShield } from "../ui/icons";

const CATEGORY_TONE = { camera_alert: "info", analysis_alert: "warning", unconfirmed: "neutral" } as const;
const STATUS_TONE = { open: "danger", acknowledged: "success", dismissed: "neutral" } as const;

export function SecurityEventList({
  events,
  businesses,
  cameras,
  engine,
  compact,
  onReview,
}: {
  events: SecurityEvent[];
  businesses: Business[];
  cameras: CameraOverview[];
  engine: EngineStatus;
  compact?: boolean;
  onReview?: (e: SecurityEvent) => void;
}) {
  const { membership } = useSite();
  if (events.length === 0) {
    return (
      <EmptyState icon={<IconShield />} title="Sin eventos registrados">
        {engine.kind === "never"
          ? "Todavía no existe análisis propio. Las alertas nativas de Tapo siguen siendo la vigilancia principal."
          : "No hay eventos de seguridad en este periodo."}
      </EmptyState>
    );
  }
  const biz = new Map(businesses.map((b) => [b.id, b.name]));
  const cams = new Map(cameras.map((c) => [c.id, c.name]));
  return (
    <div className="list">
      {events.map((e) => (
        <div className="list-row list-row-top" key={e.id}>
          <div className="list-main">
            <strong>{SECURITY_KIND_LABELS[e.kind]}</strong>
            <small className="muted">
              {formatDateTime(e.occurred_at, membership.timezone)}
              {businesses.length > 1 && biz.get(e.business_id) ? ` · ${biz.get(e.business_id)}` : ""}
              {e.camera_id && cams.get(e.camera_id) ? ` · ${cams.get(e.camera_id)}` : ""}
            </small>
            <div className="badges">
              <Badge tone={CATEGORY_TONE[e.category]}>{SECURITY_CATEGORY_LABELS[e.category]}</Badge>
              <Badge tone={STATUS_TONE[e.status]}>{SECURITY_STATUS_LABELS[e.status]}</Badge>
            </div>
            {!compact && e.review_note && <p className="muted small">Nota: {e.review_note}</p>}
          </div>
          {onReview && (
            <Button variant="secondary" size="sm" onClick={() => onReview(e)}>
              Revisar
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
