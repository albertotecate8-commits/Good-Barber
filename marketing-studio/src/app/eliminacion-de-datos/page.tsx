// Instrucciones públicas de eliminación de datos (Meta pide esta URL o un
// callback). Describe los pasos reales que ofrece la app.
export const metadata = { title: "Eliminación de datos" };

export default function DataDeletionPage() {
  const email = process.env.MKT_CONTACT_EMAIL?.trim() || null;
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Eliminación de datos — Marketing AI Studio</h1>

      <h2 className="mt-6 text-lg font-semibold">Quitar la conexión con Facebook e Instagram</h2>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>En la app: Negocios → (tu negocio) → Redes sociales → <strong>Desconectar</strong>. Se borran de inmediato los tokens de acceso guardados.</li>
        <li>
          En Facebook: Configuración y privacidad → Configuración → <strong>Integraciones comerciales</strong> → elige
          «Marketing AI Studio» → Eliminar. Así Meta revoca también los permisos.
        </li>
      </ol>

      <h2 className="mt-6 text-lg font-semibold">Borrar todos tus datos</h2>
      <p className="mt-2">
        Pide al administrador la eliminación de tu cuenta y de los datos de tu negocio
        {email ? (
          <>
            {" "}escribiendo a <a className="text-action-strong underline" href={`mailto:${email}`}>{email}</a>
          </>
        ) : null}
        . Se eliminan tu usuario, las conexiones y tokens, y —si lo solicitas— el negocio con sus publicaciones, imágenes,
        grupos y prospectos. Las publicaciones ya hechas en Facebook o Instagram se borran desde esas plataformas.
      </p>
    </main>
  );
}
