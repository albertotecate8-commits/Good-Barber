import { ExternalLink } from "lucide-react";
import { requireUser } from "@/lib/data/session";
import { ACCESS_LABELS, PROVIDERS, STATUS_LABELS, runtimeStatus, type RuntimeStatus } from "@/lib/providers/registry";
import { MONTHLY_BUDGET_MXN } from "@/lib/providers/budget";
import { storageConfig } from "@/lib/storage/config";
import { ffmpegStatus } from "@/lib/creative/render";
import { metaConfig, metaSetupInfo, publishingConfig } from "@/lib/meta/config";
import { Badge, Card, CardTitle, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Configuración" };

const STATUS_TONE: Record<RuntimeStatus, "positive" | "warn" | "gold" | "danger" | "neutral" | "action"> = {
  ready_untested: "action",
  missing_config: "warn",
  assisted: "gold",
  blocked: "danger",
  pending_build: "neutral",
};

const CATEGORY_LABELS = {
  texto: "Texto",
  imagen: "Imagen",
  video: "Video",
  edicion: "Edición",
  investigacion: "Investigación",
  redes: "Redes sociales",
} as const;

export default async function SettingsPage() {
  const user = await requireUser();
  const storage = storageConfig();
  const ff = await ffmpegStatus();
  const meta = metaConfig();
  const setup = metaSetupInfo();
  const pub = publishingConfig();
  return (
    <>
      <PageHeader title="Configuración" description="Cuenta, reglas de gasto y estado real de cada proveedor." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Tu cuenta</CardTitle>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Correo</dt>
            <dd className="truncate">{user.email}</dd>
            <dt className="text-muted">Rol</dt>
            <dd>{user.isAdmin ? <Badge tone="gold">Administrador</Badge> : <Badge>Miembro</Badge>}</dd>
            <dt className="text-muted">Zona horaria</dt>
            <dd>America/Mexico_City</dd>
          </dl>
        </Card>
        <Card>
          <CardTitle>Regla de gasto</CardTitle>
          <p className="text-3xl font-semibold text-positive">${MONTHLY_BUDGET_MXN} MXN</p>
          <p className="mt-1 text-sm text-muted">
            Presupuesto adicional mensual para APIs. Cualquier llamada con costo se bloquea antes de enviarse. Cambiarlo
            requiere modificar el código con tu autorización explícita.
          </p>
        </Card>
      </div>

      <Card className="mb-4">
        <CardTitle>Datos para la app de Meta</CardTitle>
        <p className="mb-3 text-sm text-muted">
          Cópialos en Meta for Developers (Configuración de la app y Facebook Login). No contienen secretos.
        </p>
        {!setup.appUrl ? (
          <Notice tone="warn">Falta la URL pública del sitio (Netlify la define sola como URL; o usa MKT_APP_URL).</Notice>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-[220px_1fr]">
            {[
              ["Dominio de la app", setup.appDomain],
              ["URL del sitio", setup.appUrl],
              ["URI de redireccionamiento OAuth válido", setup.redirectUri],
              ["Política de privacidad", setup.privacyUrl],
              ["Instrucciones de eliminación de datos", setup.deletionUrl],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="break-all font-mono text-xs">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {setup.appUrl && !setup.https && <p className="mt-2 text-xs text-warn">Meta exige HTTPS fuera de localhost.</p>}
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            Conexión: {meta.ready ? <Badge tone="action">Configurada, sin probar</Badge> : <Badge tone="warn">Falta: {meta.missing.join(", ")}</Badge>}
          </li>
          <li>
            Inicio de sesión:{" "}
            {meta.loginConfigId ? <Badge tone="action">Facebook Login for Business (config_id)</Badge> : <Badge>Facebook Login (scope)</Badge>}
            {meta.loginConfigId && !meta.publishConfigId && <span className="ml-2 text-xs text-warn">Falta META_PUBLISH_CONFIG_ID para «Autorizar publicación».</span>}
          </li>
          <li>
            Publicación automática: {pub.enabled ? <Badge tone="positive">Encendida</Badge> : <Badge>Apagada</Badge>}
            {!pub.enabled && <span className="ml-2 text-xs text-faint">Se enciende solo con tu autorización (MKT_PUBLISHING_ENABLED=1).</span>}
          </li>
        </ul>
      </Card>

      <Card className="mb-4">
        <CardTitle>Almacenamiento de la Biblioteca</CardTitle>
        <p className="text-sm">
          {storage.label}{" "}
          {storage.problem ? <Badge tone="danger">No disponible</Badge> : storage.backend === "local_dev" ? <Badge tone="warn">Solo desarrollo</Badge> : <Badge tone="action">Configurado</Badge>}
        </p>
        <p className="mt-1 text-xs text-faint">
          {storage.problem ??
            (storage.backend === "supabase"
              ? "Bucket privado «mkt-assets» (plan gratuito: 1 GB en total y 50 MB por archivo). Si la migración no se aplicó en tu proyecto, la subida mostrará el error."
              : "Variable MKT_STORAGE_BACKEND=local: los archivos quedan en el disco de este equipo, no en la nube.")}
        </p>
      </Card>

      <Card className="mb-4">
        <CardTitle>Montaje de video (FFmpeg)</CardTitle>
        <p className="text-sm">
          {ff.available ? <Badge tone="positive">Disponible en este servidor</Badge> : <Badge tone="warn">No disponible aquí</Badge>}{" "}
          {ff.available ? (ff.font ? "Con fuente para textos en pantalla." : "Sin fuente: los videos se montan sin texto en pantalla.") : ff.reason}
        </p>
      </Card>

      <Notice tone="gold" title="Suscripción ≠ API">
        Tus suscripciones de ChatGPT, Claude y Google te dan acceso a sus aplicaciones, no a sus APIs. Para esas
        herramientas la app prepara el trabajo y tú lo ejecutas allí («flujo asistido»). No se usan cookies ni sesiones
        personales para automatizarlas.
      </Notice>

      <Card className="mt-4">
        <CardTitle>Proveedores e integraciones</CardTitle>
        <p className="mb-4 text-sm text-muted">
          «Configurado, sin probar» significa que existe la clave, no que funcione: solo se marcará como operativo tras
          una prueba real.
        </p>
        <ul className="grid gap-3">
          {PROVIDERS.map((p) => {
            const status = runtimeStatus(p);
            return (
              <li key={p.id} className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-faint">
                      {CATEGORY_LABELS[p.category]} · {ACCESS_LABELS[p.access]} · revisado {p.verifiedOn}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>
                </div>
                {p.usedFor !== "—" && <p className="mt-2 text-sm text-muted">{p.usedFor}</p>}
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-faint">
                  {p.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {p.envVars?.map((v) => (
                    <code key={v} className="rounded bg-surface-3 px-1.5 py-0.5 text-muted">
                      {v}
                    </code>
                  ))}
                  {p.dailyCap !== undefined && <span className="text-faint">Tope propio: {p.dailyCap}/día</span>}
                  <a href={p.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-action-strong hover:underline">
                    Fuente <ExternalLink className="size-3" aria-hidden />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
