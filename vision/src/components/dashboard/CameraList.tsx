import { cameraConnection, describeCameraConnection } from "@/lib/domain/indicators";
import type { Business, CameraOverview } from "@/lib/domain/types";
import { TAPO_APP_STORE_URL } from "@/lib/config";
import { Badge, EmptyState } from "../ui/primitives";
import { IconCamera, IconExternal } from "../ui/icons";

const TONES = { online: "success", offline: "danger", error: "danger", untested: "neutral", inactive: "neutral" } as const;
const LABELS = { online: "En línea", offline: "Desconectada", error: "Error", untested: "Sin probar", inactive: "Inactiva" } as const;

export function CameraList({ cameras, businesses, now, showBusiness }: { cameras: CameraOverview[]; businesses: Business[]; now: Date; showBusiness?: boolean }) {
  if (cameras.length === 0) {
    return <EmptyState icon={<IconCamera />} title="Sin cámaras registradas">Agrégalas en Ajustes → Cámaras.</EmptyState>;
  }
  const byId = new Map(businesses.map((b) => [b.id, b]));
  return (
    <div className="list">
      {cameras.map((c) => {
        const conn = cameraConnection(c, now);
        const biz = byId.get(c.business_id);
        return (
          <div className="list-row" key={c.id}>
            <span className="list-icon"><IconCamera size={18} /></span>
            <div className="list-main">
              <strong>{c.name}</strong>
              <small className="muted">
                {showBusiness && biz ? `${biz.name} · ` : ""}
                {describeCameraConnection(conn, now)}
              </small>
            </div>
            <Badge tone={TONES[conn.kind]}>{LABELS[conn.kind]}</Badge>
          </div>
        );
      })}
      <a className="list-row list-link" href={TAPO_APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <span className="list-icon"><IconExternal size={18} /></span>
        <div className="list-main">
          <strong>Ver en vivo en la app Tapo</strong>
          <small className="muted">La transmisión en vivo y las alertas nativas siguen en Tapo.</small>
        </div>
      </a>
    </div>
  );
}
