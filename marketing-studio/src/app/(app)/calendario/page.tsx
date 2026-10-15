import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Calendario" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Calendario de contenido"
      stage="Etapa 2 (siguiente sesión)"
      description="Planeación semanal y mensual por negocio en hora de Ciudad de México."
      planned={[
        "Vista semanal y mensual, con negocio, plataforma, texto e imagen o video.",
        "Estados: borrador, pendiente, aprobado, programado, publicado o error (la tabla ya existe en la base).",
        "Registro de intentos, errores y reintentos controlados.",
        "Una publicación solo pasa a «publicada» cuando la plataforma lo confirma (ya lo impone la base de datos).",
      ]}
    />
  );
}
