// Edge Function: admin-create-barber
//
// Crea una cuenta de barbero (Supabase Auth + fila en profiles/barbers)
// sin exponer nunca la service_role key al frontend.
//
// Solo puede invocarla un usuario ya autenticado cuyo profile.role = 'admin'.
//
// Despliegue (ver README.md, sección "Cómo administrar usuarios"):
//   supabase functions deploy admin-create-barber
//
// Variables de entorno necesarias (se configuran automáticamente en Supabase,
// o manualmente con `supabase secrets set` si hace falta):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY   (nunca debe salir de este entorno de servidor)

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

  const authHeader = req.headers.get("Authorization") ?? "";
  const callerToken = authHeader.replace("Bearer ", "");

  if (!callerToken) {
    return jsonResponse({ error: "No autenticado." }, 401);
  }

  // Cliente con la sesión del solicitante, para verificar quién llama.
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerUser, error: callerError } = await callerClient.auth.getUser(callerToken);

  if (callerError || !callerUser?.user) {
    return jsonResponse({ error: "Sesión inválida." }, 401);
  }

  // Cliente con privilegios de servicio, solo usado en este servidor.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", callerUser.user.id)
    .single();

  if (profileError || !callerProfile || callerProfile.role !== "admin" || !callerProfile.active) {
    return jsonResponse({ error: "No tienes permisos de administrador." }, 403);
  }

  let payload: { name?: string; email?: string; password?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Cuerpo de la solicitud inválido." }, 400);
  }

  const { name, email, password } = payload;

  if (!name || !email || !password) {
    return jsonResponse({ error: "Nombre, correo y contraseña son obligatorios." }, 400);
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
  // Nos aseguramos de que el nombre quede correcto y creamos la fila en barbers.
  await adminClient.from("profiles").update({ name }).eq("id", created.user.id);

  const { data: barber, error: barberError } = await adminClient
    .from("barbers")
    .insert({ profile_id: created.user.id, name, active: true })
    .select()
    .single();

  if (barberError) {
    return jsonResponse({ error: `Usuario creado, pero falló crear el barbero: ${barberError.message}` }, 500);
  }

  return jsonResponse({ barber, user_id: created.user.id });
});
