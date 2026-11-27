"use client";

import Link from "next/link";
import { useSite } from "@/lib/site/SiteProvider";
import { useDashboard } from "@/lib/hooks/useDashboard";
import { useAsync, useNow } from "@/lib/hooks/useAsync";
import { fetchSecurityEvents } from "@/lib/data/queries";
import type { Business } from "@/lib/domain/types";
import { describeDay, describeSchedule, scheduleStatus, WEEK_ORDER, WEEKDAY_LABELS } from "@/lib/domain/schedule";
import { formatRelative, localParts } from "@/lib/domain/time";
import { Badge, Button, Card, ErrorBlock, LoadingBlock, PageHeader, Section } from "../ui/primitives";
import { IconRefresh } from "../ui/icons";
import { buildIndicators } from "./indicatorSet";
import { IndicatorGrid } from "./IndicatorGrid";
import { EngineBanner } from "./EngineBanner";
import { CameraList } from "./CameraList";
import { StationList } from "./StationList";
import { SecurityEventList } from "./SecurityEventList";

export function BusinessDetail({ business }: { business: Business }) {
  const { membership, canManage } = useSite();
  const tz = membership.timezone;
  const now = useNow();
  const { data, error, loading, reload } = useDashboard([business.id]);
  const events = useAsync(() => fetchSecurityEvents([business.id], { onlyOpen: false, limit: 5 }), [business.id]);

  const hours = data?.hours ?? [];
  const status = scheduleStatus(hours, business.hours_confirmed, now, tz);
  const todayWeekday = localParts(now, tz).weekday;

  return (
    <>
      <PageHeader
        title={business.name}
        accent={business.accent_color}
        subtitle={data ? describeSchedule(status) : " "}
        action={<Button variant="ghost" size="sm" icon={<IconRefresh size={18} />} onClick={() => { void reload(); void events.reload(); }} loading={loading && !!data} aria-label="Actualizar" />}
      />
      {!data && loading ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={() => void reload()} />
      ) : data ? (
        (() => {
          const set = buildIndicators(data, [business.id], now);
          return (
            <>
              {error && <ErrorBlock message={`No se pudo actualizar: ${error}`} onRetry={() => void reload()} />}
              <EngineBanner engine={set.engine} now={now} />
              <Section title="Hoy" description={`Actualizado ${formatRelative(data.fetchedAt.toISOString(), now)}`}>
                <IndicatorGrid set={set} />
              </Section>

              <Section
                title="Estaciones"
                description="Ocupación de una estación no significa servicio realizado ni cobro."
                action={canManage ? <Link className="btn btn-ghost btn-sm" href="/ajustes/estaciones/">Configurar</Link> : undefined}
              >
                <StationList stations={data.stations} live={data.dashboard.stationLive} engine={set.engine} now={now} />
              </Section>

              <Section title="Cámaras" action={canManage ? <Link className="btn btn-ghost btn-sm" href="/ajustes/camaras/">Configurar</Link> : undefined}>
                <CameraList cameras={data.cameras} businesses={[business]} now={now} />
              </Section>

              <Section
                title="Horario"
                action={canManage ? <Link className="btn btn-ghost btn-sm" href="/ajustes/horarios/">Editar</Link> : undefined}
              >
                <Card>
                  {!business.hours_confirmed && (
                    <p className="hours-warning"><Badge tone="warning">Pendiente de confirmar</Badge></p>
                  )}
                  <dl className="hours">
                    {WEEK_ORDER.map((wd) => (
                      <div key={wd} className={wd === todayWeekday ? "hours-row today" : "hours-row"}>
                        <dt>{WEEKDAY_LABELS[wd]}</dt>
                        <dd>{describeDay(hours.find((h) => h.weekday === wd))}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              </Section>

              <Section title="Seguridad reciente" action={<Link className="btn btn-ghost btn-sm" href="/seguridad/">Ver todo</Link>}>
                {events.error ? (
                  <ErrorBlock message={events.error} onRetry={() => void events.reload()} />
                ) : !events.data ? (
                  <LoadingBlock />
                ) : (
                  <SecurityEventList events={events.data} businesses={[business]} cameras={data.cameras} engine={set.engine} compact />
                )}
              </Section>
            </>
          );
        })()
      ) : null}
    </>
  );
}
