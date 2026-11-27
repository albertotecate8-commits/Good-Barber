import { STATUS_THRESHOLDS } from "@/lib/config";
import {
  cameraStatusIndicator,
  engineStatus,
  peakHoursIndicator,
  peopleInsideIndicator,
  securityIndicator,
  stationOccupancyIndicator,
  trafficIndicator,
  type EngineStatus,
  type Indicator,
} from "@/lib/domain/indicators";
import type { DashboardBundle } from "@/lib/hooks/useDashboard";

export type IndicatorSet = {
  engine: EngineStatus;
  peopleDetected: Indicator;
  entries: Indicator;
  exits: Indicator;
  inside: Indicator;
  visits: Indicator;
  stations: Indicator;
  peaks: Indicator;
  cameras: Indicator;
  security: Indicator;
};

/** Indicadores de un subconjunto de negocios a partir de los datos cargados. */
export function buildIndicators(bundle: DashboardBundle, businessIds: string[], now: Date): IndicatorSet {
  const ids = new Set(businessIds);
  const d = bundle.dashboard;
  const engine = engineStatus(d.engineNodes, now);
  const today = d.trafficToday.filter((r) => ids.has(r.business_id));
  const stations = bundle.stations.filter((s) => ids.has(s.business_id));
  const openSecurity = businessIds.reduce((acc, id) => acc + (d.openSecurityByBusiness[id] ?? 0), 0);
  return {
    engine,
    peopleDetected: trafficIndicator(engine, today, "people_detected_max"),
    entries: trafficIndicator(engine, today, "entries"),
    exits: trafficIndicator(engine, today, "exits"),
    visits: trafficIndicator(engine, today, "visits_estimated"),
    inside: peopleInsideIndicator(engine, d.businessLive.filter((r) => ids.has(r.business_id))),
    stations: stationOccupancyIndicator(
      engine,
      stations,
      d.stationLive,
      d.occupancyToday.filter((r) => ids.has(r.business_id)),
    ),
    peaks: peakHoursIndicator(
      engine,
      d.trafficHourlyRecent.filter((r) => ids.has(r.business_id)),
      STATUS_THRESHOLDS.peakHoursLookbackDays,
    ),
    cameras: cameraStatusIndicator(bundle.cameras.filter((c) => ids.has(c.business_id)), now),
    security: securityIndicator(engine, openSecurity),
  };
}
