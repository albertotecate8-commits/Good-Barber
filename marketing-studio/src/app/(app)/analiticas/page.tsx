import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Analíticas" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Analíticas"
      stage="Etapa 6"
      description="Resultados comerciales, no solo interacciones."
      planned={[
        "Alcance, impresiones, interacciones y clics desde las estadísticas oficiales de Meta.",
        "Registro manual de mensajes, prospectos, citas, clientes nuevos, ventas e inversión.",
        "Costo por prospecto y por cliente; recomendaciones sin confundir correlación con causalidad.",
      ]}
    />
  );
}
