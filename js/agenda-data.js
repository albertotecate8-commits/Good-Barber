// Acceso a datos de la agenda (citas, horarios, bloqueos). Usa exclusivamente
// las tablas y políticas RLS ya creadas y verificadas en la Etapa 1
// (appointments, barber_schedules, schedule_blocks, notification_queue).
// No se agrega ninguna tabla ni política nueva: RLS en el servidor sigue
// siendo la única barrera real — este módulo solo pide lo que el usuario
// actual tiene permitido ver, igual que data.js.

function sb() {
  return window.supabaseClient;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- appointments ----------

// Rango [inicioLocal, finLocal) del día indicado, calculado sobre la hora
// local del navegador (igual que el resto de la app: todayISO()/dates.js ya
// asumen que la hora del navegador es la hora del negocio — no se introduce
// aquí una forma distinta de manejar zonas horarias).
function dayRangeISO(dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

// barberId = null -> todas (solo funciona para el admin; RLS igualmente
// limitaría a un barbero a sus propias citas aunque se omita el filtro).
export async function listAppointmentsForDay(barberId, dateISO) {
  const { startISO, endISO } = dayRangeISO(dateISO);
  let query = sb()
    .from("appointments")
    .select("*, barbers(name)")
    .gte("starts_at", startISO)
    .lt("starts_at", endISO)
    .order("starts_at", { ascending: true });
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

// Conteo de citas activas por día para pintar la tira de la semana (7 días
// a partir de weekStartISO). Una consulta por rango de fecha, agrupada en JS
// (no hay necesidad de una función nueva en Supabase para esto).
export async function countAppointmentsForRange(barberId, startISO, endISO) {
  const { startISO: fromISO } = dayRangeISO(startISO);
  const { endISO: toISO } = dayRangeISO(endISO);
  let query = sb()
    .from("appointments")
    .select("id, starts_at, status")
    .gte("starts_at", fromISO)
    .lt("starts_at", toISO)
    .in("status", ["pending", "confirmed", "completed"]);
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

export async function updateAppointmentStatus(id, status, extra = {}) {
  return unwrap(await sb().from("appointments").update({ status, ...extra }).eq("id", id).select().single());
}

export async function confirmAppointment(id) {
  return updateAppointmentStatus(id, "confirmed", { confirmed_at: new Date().toISOString() });
}

export async function cancelAppointment(id, reason) {
  return updateAppointmentStatus(id, "cancelled", { cancelled_at: new Date().toISOString(), cancellation_reason: reason || null });
}

// Completar una cita es lo único que la conecta con el sistema financiero.
// NO se inserta nada aquí: el trigger appointment_to_service_record (ya
// verificado en la Etapa 1) es quien genera el ÚNICO service_record
// correspondiente, de forma atómica e idempotente (service_record_id es
// UNIQUE y el propio trigger bloquea generar un segundo). Este módulo se
// limita a pedir el cambio de estado, exactamente igual que cualquier otro
// UPDATE de la app.
export async function completeAppointment(id) {
  return updateAppointmentStatus(id, "completed");
}

// ---------- barber_schedules ----------
export async function listBarberSchedules(barberId) {
  return unwrap(await sb().from("barber_schedules").select("*").eq("barber_id", barberId).order("weekday").order("start_time"));
}

export async function createBarberSchedule({ barberId, weekday, startTime, endTime }) {
  return unwrap(
    await sb()
      .from("barber_schedules")
      .insert({ barber_id: barberId, weekday, start_time: startTime, end_time: endTime })
      .select()
      .single()
  );
}

export async function updateBarberSchedule(id, patch) {
  return unwrap(await sb().from("barber_schedules").update(patch).eq("id", id).select().single());
}

export async function deleteBarberSchedule(id) {
  const { error } = await sb().from("barber_schedules").delete().eq("id", id);
  if (error) throw error;
}

// ---------- schedule_blocks ----------
export async function listScheduleBlocks(barberId, fromISO) {
  let query = sb().from("schedule_blocks").select("*, barbers(name)").gte("ends_at", fromISO).order("starts_at");
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

export async function createScheduleBlock({ barberId, startsAt, endsAt, reason }) {
  return unwrap(
    await sb()
      .from("schedule_blocks")
      .insert({ barber_id: barberId ?? null, starts_at: startsAt, ends_at: endsAt, reason: reason || null })
      .select()
      .single()
  );
}

export async function deleteScheduleBlock(id) {
  const { error } = await sb().from("schedule_blocks").delete().eq("id", id);
  if (error) throw error;
}
