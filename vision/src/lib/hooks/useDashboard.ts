"use client";

import { useMemo } from "react";
import { STATUS_THRESHOLDS } from "../config";
import { fetchCameras, fetchDashboard, fetchHours, fetchStations } from "../data/queries";
import { addDaysISO, localDateISO } from "../domain/time";
import { useSite } from "../site/SiteProvider";
import { useAsync, useRefreshWhileVisible } from "./useAsync";

/** Todo lo necesario para pintar indicadores de uno o varios negocios. */
export function useDashboard(businessIds: string[]) {
  const { membership } = useSite();
  const key = businessIds.join(",");
  const tz = membership.timezone;

  const state = useAsync(async () => {
    const today = localDateISO(new Date(), tz);
    const since = addDaysISO(today, -(STATUS_THRESHOLDS.peakHoursLookbackDays - 1));
    const [dashboard, cameras, stations, hours] = await Promise.all([
      fetchDashboard(membership.site_id, businessIds, today, since),
      fetchCameras(businessIds),
      fetchStations(businessIds),
      fetchHours(businessIds),
    ]);
    return { today, dashboard, cameras, stations, hours, fetchedAt: new Date() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, membership.site_id, tz]);

  useRefreshWhileVisible(() => void state.reload(), 60_000);

  return useMemo(() => state, [state]);
}

export type DashboardBundle = NonNullable<ReturnType<typeof useDashboard>["data"]>;
