import { ModulePlaceholder } from "@/components/module-placeholder";
export const metadata = { title: "Mensajes y prospectos" };
export default function Page() {
  return (
    <ModulePlaceholder
      title="Mensajes y prospectos"
      stage="Etapa 5"
      description="Bandeja de prospectos para los canales que se puedan integrar legalmente."
      planned={[
        "Registro manual de prospectos, estado, citas y resultado comercial.",
        "Respuestas sugeridas con IA que tú apruebas: nada se envía automáticamente sin autorización.",
        "Mensajes de Facebook/Instagram solo si Meta concede los permisos de mensajería a la app.",
      ]}
      honestNote="La app no puede leer todos tus mensajes de Facebook, Instagram o WhatsApp: solo lo que permitan las APIs oficiales y los permisos que concedas."
    />
  );
}
