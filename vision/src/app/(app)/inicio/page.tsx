"use client";

import Link from "next/link";
import { useSite } from "@/lib/site/SiteProvider";
import { useDashboard } from "@/lib/hooks/useDashboard";
import { useNow } from "@/lib/hooks/useAsync";
import { formatLongDate, formatRelative } from "@/lib/domain/time";
import { describeSchedule, scheduleStatus } from "@/lib/domain/schedule";
import { buildIndicators } from "@/components/dashboard/indicatorSet";
import { IndicatorGrid } from "@/components/dashboard/IndicatorGrid";
import { IndicatorInline } from "@/components/dashboard/MetricCard";
import { EngineBanner } from "@/components/dashboard/EngineBanner";
import { CameraList } from "@/components/dashboard/CameraList";
import { BusinessMark } from "@/components/layout/BusinessMark";
import { Button, Card, EmptyState, ErrorBlock, LoadingBlock, PageHeader, Section } from "@/components/ui/primitives";
import { IconChevronRight, IconRefresh, IconStore } from "@/components/ui/icons";

export default function InicioPage() {
  const { membership, activeBusinesses } = useSite();
  const ids = activeBusinesses.map((b) => b.id);
  const { data, error, loading, reload } = useDashboard(ids);
  const now = useNow();
  const tz = membership.timezone;

  return (
    <>
      <PageHeader
        title="Inicio"
        subtitle={`${formatLongDate(now, tz)} · ${membership.site_name}`}
        action={
          <Button variant="ghost" size="sm" icon={<IconRefresh size={18} />} onClick={() => void reload()} loading={loading && !!data} aria-label="Actualizar" />
        }
      />

      {activeBusinesses.length === 0 ? (
        <EmptyState icon={<IconStore />} title="No hay negocios activos" action={<Link className="btn btn-primary" href="/ajustes/negocios/">Configurar negocios</Link>} />
      ) : !data && loading ? (
        <LoadingBlock />
      ) : error && !data ? (
        <ErrorBlock message={error} onRetry={() => void reload()} />
      ) : data ? (
        (() => {
          const all = buildIndicators(data, ids, now);
          return (
            <>
              {error && <ErrorBlock message={`No se pudo actualizar: ${error}`} onRetry={() => void reload()} />}
              <EngineBanner engine={all.engine} now={now} />

              <Section title="Ambos negocios · hoy" description={`Actualizado ${formatRelative(data.fetchedAt.toISOString(), now)}`}>
                <IndicatorGrid set={all} />
              </Section>

              <Section title="Comparativa de hoy">
                <Card className="table-card">
                  <table className="compare">
                    <thead>
                      <tr>
                        <th scope="col">Indicador</th>
                        {activeBusinesses.map((b) => (
                          <th scope="col" key={b.id}>
                            <span className="th-biz"><BusinessMark name={b.name} color={b.accent_color} small /> {b.name}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Entradas", "entries"],
                          ["Salidas", "exits"],
                          ["Visitas estimadas", "visits"],
                          ["Personas dentro", "inside"],
                          ["Estaciones ocupadas", "stations"],
                          ["Cámaras en línea", "cameras"],
                          ["Eventos por revisar", "security"],
                        ] as const
                      ).map(([label, key]) => (
                        <tr key={key}>
                          <th scope="row">{label}</th>
                          {activeBusinesses.map((b) => (
                            <td key={b.id}>
                              <IndicatorInline indicator={buildIndicators(data, [b.id], now)[key]} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </Section>

              <Section title="Negocios">
                <div className="list">
                  {activeBusinesses.map((b) => {
                    const status = scheduleStatus(data.hours.filter((h) => h.business_id === b.id), b.hours_confirmed, now, tz);
                    return (
                      <Link key={b.id} href={`/negocio/?n=${encodeURIComponent(b.slug)}`} className="list-row list-link">
                        <BusinessMark name={b.name} color={b.accent_color} />
                        <div className="list-main">
                          <strong>{b.name}</strong>
                          <small className="muted">{describeSchedule(status)}</small>
                        </div>
                        <IconChevronRight size={18} />
                      </Link>
                    );
                  })}
                </div>
              </Section>

              <Section title="Cámaras">
                <CameraList cameras={data.cameras} businesses={activeBusinesses} now={now} showBusiness />
              </Section>
            </>
          );
        })()
      ) : null}
    </>
  );
}
