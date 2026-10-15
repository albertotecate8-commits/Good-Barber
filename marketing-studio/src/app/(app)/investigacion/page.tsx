import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Investigación" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Investigación de mercado"
      stage="Etapa 3"
      description="Investigación con fuentes reales, priorizando Durango capital."
      planned={[
        "Informes con fecha de consulta, fuente y enlace, hallazgo, evidencia, nivel de confianza, recomendación, experimento e indicador.",
        "Separación explícita entre datos comprobados, observaciones e hipótesis.",
        "Consulta asistida de la Biblioteca de anuncios de Meta, Google Trends (Durango), TikTok Creative Center y fichas públicas de Google Maps.",
        "Calendario de temporadas y festividades locales.",
      ]}
      honestNote="La API de la Biblioteca de anuncios de Meta solo devuelve anuncios comerciales entregados en la UE/Reino Unido; para México se usa la web de forma asistida. Google Trends API está en alfa por invitación."
    />
  );
}
