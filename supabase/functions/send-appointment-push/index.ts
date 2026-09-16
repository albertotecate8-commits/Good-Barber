// Edge Function: send-appointment-push
//
// Avisa al barbero, en su teléfono, de que le entró una cita nueva.
//
// LA REGLA QUE MANDA SOBRE TODO LO DEMÁS
// --------------------------------------
// Esta función NO está en el camino de la reserva. La dispara un Database
// Webhook sobre `appointments` INSERT, que corre FUERA de la transacción de
// la cita. Cuando esto se ejecuta, la cita YA existe y ya se le devolvió al
// cliente. Por eso, pase lo que pase aquí —el servicio de push caído, una
// clave VAPID mal puesta, un endpoint caducado, el barbero sin notificaciones
// activadas— la cita se creó igual. Esta función nunca puede impedirlo.
// De ahí que SIEMPRE responda 200: un error aquí no debe hacer que Supabase
// reintente indefinidamente ni que nada escale hacia la reserva.
//
// Secretos (Supabase -> Edge Functions -> Secrets). NUNCA en el repositorio:
//   VAPID_PUBLIC_KEY   la misma que usa el navegador al suscribirse
//   VAPID_PRIVATE_KEY  jamás sale de aquí
//   VAPID_SUBJECT      mailto:... o la URL del sitio
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "https://goodbarber-web.vercel.app";
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const KIND = "new_appointment_barber";

// Solo para el texto de la notificación. La hora real siempre vive en la
// cita; esto es presentación.
function cuando(startsAt: string, zona: string): string {
  const fecha = new Date(startsAt);
  const hoy = new Date();
  const dia = (d: Date) =>
    d.toLocaleDateString("es-MX", { timeZone: zona, day: "2-digit", month: "2-digit" });
  const hora = fecha.toLocaleTimeString("es-MX", {
    timeZone: zona, hour: "numeric", minute: "2-digit", hour12: true,
  });
  const manana = new Date(hoy.getTime() + 86400000);
  if (dia(fecha) === dia(hoy)) return `Hoy · ${hora}`;
  if (dia(fecha) === dia(manana)) return `Mañana · ${hora}`;
  return `${fecha.toLocaleDateString("es-MX", { timeZone: zona, weekday: "short", day: "numeric", month: "short" })} · ${hora}`;
}

Deno.serve(async (req: Request) => {
  // Cualquier fallo se registra y se responde 200: nada escala a la reserva.
  const responder = (cuerpo: Record<string, unknown>) =>
    new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return responder({ ok: false, motivo: "faltan credenciales de Supabase" });
    }

    const evento = await req.json().catch(() => null);
    // El Database Webhook manda { type, table, record, old_record }.
    const cita = evento?.record ?? evento?.appointment ?? null;
    if (!cita?.id || !cita?.barber_id) {
      return responder({ ok: false, motivo: "evento sin cita o sin barbero" });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // ---------------------------------------------------------------
    // ANTI-DUPLICADOS. Esta es LA garantía, y vive en el servidor.
    //
    // Un webhook puede dispararse dos veces. `tag` no sirve como defensa:
    // Safari lo acepta y lo ignora. Aquí se intenta crear la fila de la cola
    // ANTES de enviar nada; si choca con el índice único parcial
    // (appointment_id, kind), es que este aviso ya se procesó y se sale sin
    // enviar. No depende del navegador ni de la plataforma.
    // ---------------------------------------------------------------
    const { data: filaCola, error: errorCola } = await db
      .from("notification_queue")
      .insert({
        appointment_id: cita.id,
        kind: KIND,
        channel: "push",
        payload: {
          client_name: cita.client_name,
          service: cita.service_name,
          starts_at: cita.starts_at,
          booking_code: cita.booking_code,
        },
        status: "pending",
      })
      .select()
      .single();

    if (errorCola) {
      // 23505 = unique_violation -> ya se envió. No es un error real.
      if (errorCola.code === "23505") {
        return responder({ ok: true, duplicado: true, motivo: "este aviso ya se procesó" });
      }
      return responder({ ok: false, motivo: `no se pudo encolar: ${errorCola.message}` });
    }

    const cerrarCola = async (status: string, error?: string, enviados = 0) => {
      await db.from("notification_queue")
        .update({
          status,
          error: error ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          attempts: (filaCola.attempts ?? 0) + 1,
          payload: { ...(filaCola.payload ?? {}), enviados },
        })
        .eq("id", filaCola.id);
    };

    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      await cerrarCola("failed", "faltan las claves VAPID");
      return responder({ ok: false, motivo: "faltan las claves VAPID" });
    }

    // Destinatarios: SOLO los dispositivos activos de ESE barbero.
    const { data: subs, error: errorSubs } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth, profile_id, failure_count")
      .eq("barber_id", cita.barber_id)
      .eq("active", true);

    if (errorSubs) {
      await cerrarCola("failed", errorSubs.message);
      return responder({ ok: false, motivo: errorSubs.message });
    }

    if (!subs || subs.length === 0) {
      // El barbero no ha activado notificaciones. No es un error.
      await cerrarCola("skipped", "el barbero no tiene dispositivos activos");
      return responder({ ok: true, enviados: 0, motivo: "sin dispositivos" });
    }

    await db.from("notification_queue")
      .update({ recipient_profile_id: subs[0].profile_id })
      .eq("id", filaCola.id);

    const { data: ajustes } = await db
      .from("settings").select("timezone").limit(1).single();
    const zona = ajustes?.timezone || "America/Mexico_City";

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const cuerpo = JSON.stringify({
      title: "🔔 Good Barber",
      body: `Nueva cita\n${cita.client_name} · ${cita.service_name}\n${cuando(cita.starts_at, zona)}`,
      appointment_id: cita.id,
      url: `/?cita=${cita.id}`,
      tag: `cita-${cita.id}`,
    });

    // Cada dispositivo se evalúa por separado: que uno falle no impide a los
    // demás. Un barbero con iPhone, Android y computadora recibe en los tres.
    const resultados = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          cuerpo,
          {
            // Apple lo documenta: 'high' intenta entregar de inmediato en vez
            // de agrupar el aviso para más tarde. Es el control real de
            // prioridad; no existe ninguna opción de showNotification que lo
            // haga. Valores admitidos: very-low, low, normal, high.
            urgency: "high",
            TTL: 86400,
          },
        ).then(() => ({ id: s.id, ok: true as const }))
         .catch((e) => ({ id: s.id, ok: false as const, code: e?.statusCode, msg: String(e?.body ?? e?.message ?? e) }))
      ),
    );

    let enviados = 0;
    const caducados: string[] = [];
    const fallidos: { id: string; msg: string }[] = [];

    for (const r of resultados) {
      if (r.status !== "fulfilled") continue;
      const v = r.value;
      if (v.ok) { enviados += 1; continue; }
      // 404 / 410 Gone = el endpoint ya no existe: app desinstalada,
      // permiso revocado en el sistema, navegador limpiado.
      if (v.code === 404 || v.code === 410) caducados.push(v.id);
      else fallidos.push({ id: v.id, msg: v.msg });
    }

    // Caducados: se DESACTIVAN, no se borran. Queda el rastro de que ese
    // dispositivo existió, y los demás siguen recibiendo.
    if (caducados.length) {
      await db.from("push_subscriptions")
        .update({ active: false, last_error: "endpoint caducado (404/410)" })
        .in("id", caducados);
    }
    for (const f of fallidos) {
      const previo = subs.find((s) => s.id === f.id)?.failure_count ?? 0;
      await db.from("push_subscriptions")
        .update({ last_error: f.msg.slice(0, 300), failure_count: previo + 1 })
        .eq("id", f.id);
    }
    if (enviados > 0) {
      await db.from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString(), failure_count: 0 })
        .in("id", resultados.filter((r) => r.status === "fulfilled" && r.value.ok)
                            .map((r) => (r as { value: { id: string } }).value.id));
    }

    await cerrarCola(
      enviados > 0 ? "sent" : "failed",
      enviados > 0 ? undefined : `0 de ${subs.length} entregados`,
      enviados,
    );

    return responder({
      ok: true,
      enviados,
      caducados: caducados.length,
      fallidos: fallidos.length,
      dispositivos: subs.length,
    });
  } catch (e) {
    // Incluso un fallo inesperado responde 200: la cita no se entera.
    return responder({ ok: false, motivo: String((e as Error)?.message ?? e) });
  }
});
