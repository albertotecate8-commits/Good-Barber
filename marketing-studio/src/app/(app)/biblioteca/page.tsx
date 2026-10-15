import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Biblioteca" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Biblioteca"
      stage="Etapa 2 (siguiente sesión)"
      description="Logotipos, fotos de referencia, diseños y videos de cada negocio."
      planned={[
        "Subida a Supabase Storage (nivel gratuito) con carpetas privadas por negocio.",
        "Origen de cada archivo: generado por IA, editado por código, importado o foto real.",
        "Versiones y comparación lado a lado.",
      ]}
    />
  );
}
