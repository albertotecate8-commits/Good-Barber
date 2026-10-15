import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Campañas" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Campañas"
      stage="Etapa 3"
      description="Campañas basadas en investigación, con objetivo comercial e indicador medible."
      planned={[
        "Crear, guardar y revisar campañas por negocio (la tabla ya existe en la base).",
        "Estrategia, piezas, calendario y KPI de cada campaña.",
        "Flujo de revisión y aprobación antes de publicar.",
      ]}
    />
  );
}
