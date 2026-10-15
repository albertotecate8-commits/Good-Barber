import { disconnectMetaAccounts } from "@/app/(app)/negocios/meta-actions";
import { ConfirmButton } from "./business-forms";
import { buttonClass, Card, CardTitle, Notice } from "./ui";

const RESULTS: Record<string, { tone: "positive" | "warn" | "danger"; text: string }> = {
  conectado: { tone: "positive", text: "Página vinculada. Meta confirmó la autorización y el token de la página funcionó." },
  cancelado: { tone: "warn", text: "Cancelaste la autorización en Meta. No se guardó nada." },
  "faltan-permisos": { tone: "warn", text: "No concediste el permiso para ver tus páginas. Vuelve a conectar y acéptalo." },
  "sin-permiso": { tone: "danger", text: "Solo el dueño del negocio puede conectarlo con Meta." },
  "sin-configurar": { tone: "warn", text: "La conexión con Meta no está configurada en el servidor." },
  "estado-invalido": { tone: "danger", text: "La respuesta de Meta no coincidió con tu solicitud (protección contra falsificación). Inténtalo de nuevo." },
};

export function MetaConnectCard({
  businessId,
  isOwner,
  missing,
  connected,
  result,
}: {
  businessId: string;
  isOwner: boolean;
  missing: string[];
  connected: boolean;
  result?: string;
}) {
  const r = result ? (RESULTS[result] ?? { tone: "danger" as const, text: `Meta devolvió un error (${result}). No se marcó nada como conectado.` }) : null;
  return (
    <Card>
      <CardTitle>Conexión oficial con Meta (Facebook e Instagram)</CardTitle>
      <div className="flex flex-col gap-3 text-sm">
        {r && <Notice tone={r.tone}>{r.text}</Notice>}
        {missing.length > 0 ? (
          <p className="text-muted">
            Aún no disponible: falta configurar en el hosting <code className="text-xs">{missing.join(", ")}</code>. Los pasos
            (crear tu app gratuita en Meta for Developers) están en <code className="text-xs">docs/DESPLIEGUE.md</code>.
          </p>
        ) : !isOwner ? (
          <p className="text-muted">Solo el dueño del negocio puede conectarlo.</p>
        ) : (
          <>
            <p className="text-muted">
              Abre el diálogo oficial de Meta, eliges qué páginas compartir y luego cuál es la de este negocio. Solo se
              piden permisos de lectura; publicar requerirá otra autorización tuya.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* <a> y no <Link>: es una ruta que redirige a Meta y no debe precargarse. */}
              <a href={`/api/meta/conectar?negocio=${businessId}`} className={buttonClass("primary")}>
                {connected ? "Volver a autorizar" : "Conectar con Meta"}
              </a>
              {connected && (
                <ConfirmButton
                  action={disconnectMetaAccounts.bind(null, businessId)}
                  confirmText="¿Desconectar Facebook/Instagram de la app? Se borran los tokens guardados. No afecta a tus páginas."
                  variant="secondary"
                >
                  Desconectar
                </ConfirmButton>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
