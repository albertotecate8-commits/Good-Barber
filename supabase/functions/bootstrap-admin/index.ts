// Edge Function: bootstrap-admin
//
// Crea al PRIMER administrador de Good Barber desde la pantalla pública
// "Configuración inicial", sin exponer nunca la service_role key al frontend.
//
// Seguridad (el navegador nunca decide esto, solo el servidor):
//   - Antes de crear nada, comprueba en la base de datos si YA existe algún
//     profile con role='admin'. Si existe, rechaza con 409.
//   - La promoción a role='admin' se hace mediante la función SQL
//     promote_first_admin(), que repite el mismo chequeo de forma atómica
//     dentro de la misma transacción (protege contra dos peticiones
//     simultáneas) y que solo el rol service_role puede ejecutar (revocada
//     para public/authenticated/anon).
//   - Si la promoción falla después de crear el usuario de Auth (p. ej. por
//     una carrera perdida), se borra el usuario recién creado para no dejar
//     una cuenta huérfana.
//
// Despliegue (ver README.md):
//   supabase functions deploy bootstrap-admin
//
// Variables de entorno necesarias (automáticas en Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (nunca sale de este entorno de servidor)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Función mal configurada en el servidor." }, 500);
  }

  // Cliente con privilegios de servicio, solo usado en este servidor.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Chequeo temprano (evita crear un usuario de Auth innecesario si ya hay admin).
  // El chequeo que realmente protege contra la carrera es el de promote_first_admin.
  const { count: adminCount, error: countError } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countError) {
    return jsonResponse({ error: "No se pudo verificar el estado del sistema." }, 500);
  }

  if ((adminCount ?? 0) > 0) {
    return jsonResponse(
      { error: "Ya existe un administrador. Las cuentas nuevas son creadas por el administrador de Good Barber." },
      409,
    );
  }

  let payload: { email?: string; password?: string; name?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { email, password } = payload;
  const name = payload.name?.trim() || email?.split("@")[0] || "Administrador";

  if (!email || !password) {
    return jsonResponse({ error: "Correo y contraseña son obligatorios." }, 400);
  }

  if (password.length < 8) {
    return jsonResponse({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (createError || !created?.user) {
    return jsonResponse({ error: createError?.message || "No se pudo crear el usuario." }, 400);
  }

  // El trigger on_auth_user_created ya insertó la fila en profiles con role='barber'.
  // Ahora la promovemos a 'admin' de forma atómica y segura contra condiciones de carrera.
  const { data: profile, error: promoteError } = await adminClient.rpc("promote_first_admin", {
    p_user_id: created.user.id,
  });

  if (promoteError || !profile) {
    // Alguien más ganó la carrera (o algo falló): no dejar el usuario huérfano.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return jsonResponse(
      { error: promoteError?.message || "Ya existe un administrador. No se pudo completar la configuración inicial." },
      409,
    );
  }

  await adminClient.from("profiles").update({ name }).eq("id", created.user.id);

  return jsonResponse({ profile, user_id: created.user.id });
});
