import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Crear contenido" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Crear contenido"
      stage="Etapas 3 y 4"
      description="Director de Marketing con IA: de una instrucción sencilla a un flujo completo de campaña."
      planned={[
        "Escribir una petición («crea cinco anuncios para Good Barber y un Reel para esta semana») y convertirla en pasos.",
        "Recuperar la identidad de marca, precios y promociones del negocio elegido.",
        "Generar estrategia, textos, guiones, hashtags y llamadas a la acción con Gemini (nivel gratuito).",
        "Preparar prompts de imagen/video para ejecutarlos en Gemini, ChatGPT o Google Flow e importar el resultado.",
        "Modo automático (solo tareas autorizadas) y modo profesional (aprobar antes de publicar).",
      ]}
      honestNote="Cada pieza indicará si fue generada por un modelo, editada por código o si es solo un prompt preparado."
    />
  );
}
