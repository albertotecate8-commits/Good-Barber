// Acceso a datos: toda la información de negocio vive en Supabase.
// RLS en el servidor es la verdadera barrera de seguridad; este módulo
// solo intenta pedir lo que el usuario actual tiene permitido ver.

function sb() {
  return window.supabaseClient;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- settings ----------
export async function getSettings() {
  return unwrap(await sb().from("settings").select("*").single());
}

export async function updateSettings(patch) {
  return unwrap(await sb().from("settings").update(patch).eq("id", true).select().single());
}

// ---------- profiles / barbers ----------
export async function listBarbers() {
  return unwrap(await sb().from("barbers").select("*, profiles!barbers_profile_id_fkey(email, active)").order("name"));
}

export async function setBarberActive(barberId, active) {
  return unwrap(await sb().from("barbers").update({ active }).eq("id", barberId).select().single());
}

export async function setProfileActive(profileId, active) {
  return unwrap(await sb().from("profiles").update({ active }).eq("id", profileId).select().single());
}

export async function updateBarber(barberId, patch) {
  return unwrap(await sb().from("barbers").update(patch).eq("id", barberId).select().single());
}

export async function createBarberViaFunction({ name, email, password }) {
  const { data: sessionData } = await sb().auth.getSession();
  const token = sessionData?.session?.access_token;
  const { data, error } = await sb().functions.invoke("admin-create-barber", {
    body: { name, email, password },
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------- clients ----------
export async function listClients(barberId = null) {
  let query = sb().from("clients").select("*").eq("active", true).order("name");
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

export async function searchClients(barberId, term) {
  let query = sb().from("clients").select("*").eq("active", true).ilike("name", `%${term}%`).order("name").limit(20);
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

export async function createClient({ barberId, name, phone, notes }) {
  return unwrap(await sb().from("clients").insert({ barber_id: barberId, name, phone, notes }).select().single());
}

export async function updateClient(clientId, patch) {
  return unwrap(await sb().from("clients").update(patch).eq("id", clientId).select().single());
}

export async function deactivateClient(clientId) {
  return unwrap(await sb().from("clients").update({ active: false }).eq("id", clientId).select().single());
}

// ---------- services ----------
export async function listServices(onlyActive = true) {
  let query = sb().from("services").select("*").order("sort_order");
  if (onlyActive) query = query.eq("active", true);
  return unwrap(await query);
}

export async function createService({ name, priceCents, durationMinutes, sortOrder }) {
  return unwrap(
    await sb()
      .from("services")
      .insert({ name, price_cents: priceCents, duration_minutes: durationMinutes ?? null, sort_order: sortOrder ?? 0 })
      .select()
      .single()
  );
}

export async function updateService(serviceId, patch) {
  return unwrap(await sb().from("services").update(patch).eq("id", serviceId).select().single());
}

// ---------- service_records ----------
export async function createServiceRecord({ barberId, clientId, service, discountCents = 0, notes, createdBy }) {
  return unwrap(
    await sb()
      .from("service_records")
      .insert({
        barber_id: barberId,
        client_id: clientId ?? null,
        service_id: service.id,
        service_name: service.name,
        price_cents: service.price_cents,
        discount_cents: discountCents,
        notes: notes ?? null,
        created_by: createdBy,
      })
      .select()
      .single()
  );
}

export async function updateServiceRecord(recordId, patch) {
  return unwrap(await sb().from("service_records").update(patch).eq("id", recordId).select().single());
}

export async function cancelServiceRecord(recordId) {
  return updateServiceRecord(recordId, { status: "cancelled" });
}

export async function reopenServiceRecord(recordId) {
  return updateServiceRecord(recordId, { status: "completed" });
}

export async function listRecordsForRange(barberId, startISO, endISO) {
  return unwrap(
    await sb()
      .from("service_records")
      .select("*, clients(name)")
      .eq("barber_id", barberId)
      .gte("record_date", startISO)
      .lte("record_date", endISO)
      .order("record_date", { ascending: false })
      .order("record_time", { ascending: false })
  );
}

export async function listRecordsForDay(barberId, dateISO) {
  return unwrap(
    await sb()
      .from("service_records")
      .select("*, clients(name)")
      .eq("barber_id", barberId)
      .eq("record_date", dateISO)
      .order("record_time", { ascending: false })
  );
}

export async function listAllRecordsForRange(startISO, endISO) {
  return unwrap(
    await sb()
      .from("service_records")
      .select("*, clients(name), barbers(name)")
      .gte("record_date", startISO)
      .lte("record_date", endISO)
      .order("record_date", { ascending: false })
  );
}

// ---------- daily_promotions ----------
export async function getDailyPromotion(barberId, dateISO) {
  return unwrap(
    await sb().from("daily_promotions").select("*").eq("barber_id", barberId).eq("record_date", dateISO).maybeSingle()
  );
}

export async function upsertDailyPromotion(barberId, dateISO, discountCents) {
  return unwrap(
    await sb()
      .from("daily_promotions")
      .upsert({ barber_id: barberId, record_date: dateISO, discount_cents: discountCents }, { onConflict: "barber_id,record_date" })
      .select()
      .single()
  );
}

export async function listPromotionsForRange(barberId, startISO, endISO) {
  return unwrap(
    await sb()
      .from("daily_promotions")
      .select("*")
      .eq("barber_id", barberId)
      .gte("record_date", startISO)
      .lte("record_date", endISO)
  );
}

// ---------- weekly_periods ----------
// Crear/cerrar un weekly_period ya no se hace con llamadas separadas desde aquí
// (ver closeWeeklySettlement): esa secuencia check-then-insert tenía una
// condición de carrera bajo cierres concurrentes. Se sustituyó por el RPC
// close_weekly_settlement, que hace ambas escrituras en una sola transacción.
export async function listWeeklyPeriods(barberId) {
  return unwrap(
    await sb().from("weekly_periods").select("*").eq("barber_id", barberId).order("week_start_date", { ascending: false })
  );
}

// ---------- settlements ----------
export async function listSettlements(barberId = null) {
  let query = sb().from("settlements").select("*, barbers(name)").order("week_start_date", { ascending: false });
  if (barberId) query = query.eq("barber_id", barberId);
  return unwrap(await query);
}

export async function upsertSettlement(payload) {
  return unwrap(
    await sb()
      .from("settlements")
      .upsert(payload, { onConflict: "barber_id,week_start_date" })
      .select()
      .single()
  );
}

// Cierra una semana de forma atómica (crea/actualiza weekly_period + settlement
// en una sola transacción del lado del servidor). Evita la condición de carrera
// de hacer ambas escrituras por separado desde el navegador.
export async function closeWeeklySettlement({
  barberId,
  weekStart,
  weekEnd,
  totalCents,
  extraAdjustmentCents,
  barberPercentage,
  barberShareCents,
  businessShareCents,
}) {
  return unwrap(
    await sb().rpc("close_weekly_settlement", {
      p_barber_id: barberId,
      p_week_start: weekStart,
      p_week_end: weekEnd,
      p_total_cents: totalCents,
      p_extra_adjustment_cents: extraAdjustmentCents,
      p_barber_percentage: barberPercentage,
      p_barber_share_cents: barberShareCents,
      p_business_share_cents: businessShareCents,
    })
  );
}

// Detecta si ya se importaron datos de una migración anterior (busca el
// texto que migration.js escribe en `notes`), para avisar antes de duplicar.
export async function countMigratedRecords(barberIds) {
  if (!barberIds.length) return 0;
  const { count, error } = await sb()
    .from("service_records")
    .select("id", { count: "exact", head: true })
    .in("barber_id", barberIds)
    .ilike("notes", "Migrado automáticamente%");
  if (error) throw error;
  return count || 0;
}

export async function cancelSettlement(settlementId) {
  return unwrap(await sb().from("settlements").update({ status: "cancelled" }).eq("id", settlementId).select().single());
}

export async function reopenSettlement(settlementId) {
  return unwrap(await sb().from("settlements").update({ status: "completed" }).eq("id", settlementId).select().single());
}
