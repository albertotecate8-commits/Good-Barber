import { IconCamera, IconChair, IconChart, IconEnter, IconExit, IconEye, IconInside, IconShield, IconUsers } from "../ui/icons";
import { MetricCard } from "./MetricCard";
import type { IndicatorSet } from "./indicatorSet";

/** Los indicadores del dashboard, en el orden acordado. */
export function IndicatorGrid({ set }: { set: IndicatorSet }) {
  return (
    <div className="metric-grid">
      <MetricCard label="Personas detectadas" icon={<IconEye size={18} />} indicator={set.peopleDetected} />
      <MetricCard label="Entradas" icon={<IconEnter size={18} />} indicator={set.entries} />
      <MetricCard label="Salidas" icon={<IconExit size={18} />} indicator={set.exits} />
      <MetricCard label="Personas dentro" icon={<IconInside size={18} />} indicator={set.inside} />
      <MetricCard label="Visitas estimadas" icon={<IconUsers size={18} />} indicator={set.visits} />
      <MetricCard label="Estaciones ocupadas" icon={<IconChair size={18} />} indicator={set.stations} />
      <MetricCard label="Mayor afluencia" icon={<IconChart size={18} />} indicator={set.peaks} />
      <MetricCard label="Cámaras en línea" icon={<IconCamera size={18} />} indicator={set.cameras} />
      <MetricCard label="Eventos de seguridad" icon={<IconShield size={18} />} indicator={set.security} />
    </div>
  );
}
