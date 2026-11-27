import type { Station, StationLiveState } from "@/lib/domain/types";
import { STATION_KIND_LABELS } from "@/lib/domain/types";
import { formatRelative } from "@/lib/domain/time";
import type { EngineStatus } from "@/lib/domain/indicators";
import { Badge, EmptyState } from "../ui/primitives";
import { IconChair } from "../ui/icons";

export function StationList({ stations, live, engine, now }: { stations: Station[]; live: StationLiveState[]; engine: EngineStatus; now: Date }) {
  const active = stations.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <EmptyState icon={<IconChair />} title="Sin estaciones configuradas">
        Agrega las sillas, mesas o lavabos reales en Ajustes → Estaciones.
      </EmptyState>
    );
  }
  const liveById = new Map(live.map((l) => [l.station_id, l]));
  return (
    <div className="station-grid">
      {active.map((s) => {
        const l = engine.kind === "never" ? undefined : liveById.get(s.id);
        const state = l?.state ?? "unknown";
        return (
          <div className={`station station-${state}`} key={s.id}>
            <div className="station-top">
              <strong>{s.name}</strong>
              <Badge tone={state === "occupied" ? "warning" : state === "free" ? "success" : "neutral"}>
                {state === "occupied" ? "Ocupada" : state === "free" ? "Libre" : "Sin información"}
              </Badge>
            </div>
            <small className="muted">
              {STATION_KIND_LABELS[s.kind]}
              {l ? ` · ${formatRelative(l.since, now)}` : ""}
              {!s.zone ? " · zona sin dibujar" : ""}
            </small>
          </div>
        );
      })}
    </div>
  );
}
