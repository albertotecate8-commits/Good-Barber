import Link from "next/link";
import type { Metadata } from "next";
import { getBusinessDetail } from "@/lib/data/businesses";
import { requireUser } from "@/lib/data/session";
import { metaConfig } from "@/lib/meta/config";
import { MetaError, normalizeName } from "@/lib/meta/graph";
import { loadOAuthSession, type PendingSession } from "@/lib/meta/service";
import { ActionForm, FieldError } from "@/components/action-form";
import { Badge, buttonClass, Card, CardTitle, EmptyState, Notice } from "@/components/ui";
import { linkMetaPage } from "../../meta-actions";

export const metadata: Metadata = { title: "Vincular página de Facebook" };

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ sesion?: string }> };

export default async function MetaLinkPage({ params, searchParams }: Props) {
  const [{ slug }, { sesion = "" }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const { business, socials } = await getBusinessDetail(slug);
  const back = `/negocios/${business.slug}?tab=redes`;
  const reconnect = `/api/meta/conectar?negocio=${business.id}`;

  let session: PendingSession | null = null;
  let problem: string | null = null;
  if (!metaConfig().ready) problem = "La conexión con Meta no está configurada en el servidor.";
  else if (!/^[0-9a-f-]{36}$/i.test(sesion)) problem = "Falta la autorización de Meta.";
  else {
    try {
      session = await loadOAuthSession(sesion, user.id);
      if (!session || session.businessId !== business.id) problem = "La autorización venció (dura 20 minutos) o es de otro negocio.";
    } catch (e) {
      problem = e instanceof MetaError ? e.message : "No se pudieron leer tus páginas en Meta.";
    }
  }

  // Sugerencia: la página cuyo nombre coincide con el perfil de Facebook registrado o con el negocio.
  const registered = socials.filter((s) => s.platform === "facebook_page").map((s) => normalizeName(s.handle));
  const wanted = new Set([...registered, normalizeName(business.name)].filter(Boolean));

  return (
    <>
      <div className="mb-5">
        <Link href={back} className="text-sm text-muted hover:text-ink">
          ← {business.name}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Vincular página existente</h1>
        <p className="text-sm text-muted">Facebook Login oficial · solo lectura por ahora</p>
      </div>

      <div className="grid gap-4">
        <Notice tone="gold" title="Qué hace y qué no hace">
          Vincula una página que <strong>ya administras</strong>. La app no crea páginas, no cambia propietarios ni
          permisos y <strong>no publica nada</strong>: los permisos concedidos son solo de lectura. El token se guarda
          cifrado en el servidor y nunca se muestra en el navegador.
        </Notice>

        {problem || !session ? (
          <Card>
            <EmptyState title={problem ?? "Sin autorización"} action={<a href={reconnect} className={buttonClass("primary")}>Volver a conectar con Meta</a>} />
          </Card>
        ) : session.pages.length === 0 ? (
          <Card>
            <EmptyState
              title="Meta no devolvió ninguna página"
              action={<a href={reconnect} className={buttonClass("primary")}>Volver a conectar con Meta</a>}
            >
              Revisa que tu usuario de Facebook administre la página y que, en el diálogo de Meta, la hayas marcado al
              elegir a qué páginas das acceso. No crees una página nueva: así se evitan duplicados.
            </EmptyState>
          </Card>
        ) : (
          <Card>
            <CardTitle>Elige la página de {business.name}</CardTitle>
            <ActionForm action={linkMetaPage.bind(null, session.id)} submitLabel="Vincular esta página" pendingLabel="Verificando con Meta…">
              <fieldset className="grid gap-2">
                <legend className="sr-only">Páginas que administras</legend>
                {session.pages.map((p) => {
                  const suggested = wanted.has(normalizeName(p.name));
                  const canPublishLater = p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE");
                  return (
                    <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-action">
                      <input type="radio" name="page_id" value={p.id} defaultChecked={suggested} className="mt-1" required />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium">
                          {p.name}
                          {suggested && <Badge tone="positive">Coincide con el perfil registrado</Badge>}
                        </span>
                        <span className="block text-xs text-muted">ID {p.id}</span>
                        <span className="block text-xs text-muted">
                          Instagram vinculado: {p.instagram ? (p.instagram.username ? `@${p.instagram.username}` : p.instagram.id) : "ninguno"}
                        </span>
                        {!canPublishLater && (
                          <span className="block text-xs text-warn">Tu rol en esta página no permite crear contenido: no se podrá publicar desde la app.</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
              <FieldError name="page_id" />
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="confirm" className="mt-1" />
                <span>Confirmo que es la página real de {business.name} y que la administro.</span>
              </label>
              <FieldError name="confirm" />
              <p className="text-xs text-faint">Permisos concedidos: {session.scopes.join(", ") || "—"}</p>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
