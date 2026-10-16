// Política de privacidad pública (Meta la exige para la app oficial). Describe
// solo lo que la app hace de verdad; no requiere iniciar sesión.
export const metadata = { title: "Política de privacidad" };

const contact = () => process.env.MKT_CONTACT_EMAIL?.trim() || null;

export default function PrivacyPage() {
  const email = contact();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Política de privacidad — Marketing AI Studio</h1>
      <p className="mt-2 text-muted">Última actualización: 16 de octubre de 2026.</p>

      <h2 className="mt-6 text-lg font-semibold">Quién usa esta app</h2>
      <p className="mt-2">
        Marketing AI Studio es una herramienta interna para administrar el marketing de negocios propios (Good Barber,
        Glamour Studio y AFORE PRO). Solo pueden entrar las personas invitadas por el administrador; no hay registro
        público.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Qué datos guarda</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Correo electrónico de las personas usuarias (para iniciar sesión).</li>
        <li>Información de los negocios, publicaciones, imágenes, campañas y prospectos que tú registras.</li>
        <li>
          Al conectar Facebook o Instagram: el identificador y nombre de las páginas o cuentas que eliges, los permisos
          concedidos y el token de acceso de la página, guardado <strong>cifrado</strong> (AES-256-GCM) y solo accesible
          desde el servidor.
        </li>
        <li>Identificador y enlace de las publicaciones hechas por la app, y el historial de distribución a grupos.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Qué NO hace</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>No pide ni guarda contraseñas de Facebook o Instagram.</li>
        <li>No vende ni comparte datos con terceros, ni los usa para publicidad.</li>
        <li>No lee mensajes privados ni datos de personas que no usan la app.</li>
        <li>No publica nada sin la aprobación explícita del dueño del negocio.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Para qué usa los datos de Meta</h2>
      <p className="mt-2">
        Únicamente para listar las páginas que administras, vincular la que elijas y publicar en ella el contenido que
        apruebes. Los datos se procesan con la API oficial de Meta (Graph API).
      </p>

      <h2 className="mt-6 text-lg font-semibold">Dónde se guardan</h2>
      <p className="mt-2">En una base de datos Supabase protegida con reglas de acceso por negocio, y la app se sirve desde Netlify.</p>

      <h2 className="mt-6 text-lg font-semibold">Eliminar tus datos</h2>
      <p className="mt-2">
        Consulta <a className="text-action-strong underline" href="/eliminacion-de-datos">las instrucciones de eliminación de datos</a>.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Contacto</h2>
      <p className="mt-2">{email ? <a className="text-action-strong underline" href={`mailto:${email}`}>{email}</a> : "Escribe al administrador del negocio que te dio acceso."}</p>
    </main>
  );
}
