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
export async function getOrCreateWeeklyPeriod(barberId, startISO, endISO) {
  const existing = unwrap(
    await sb().from("weekly_periods").select("*").eq("barber_id", barberId).eq("week_start_date", startISO).maybeSingle()
  );
  if (existing) return existing;
  return unwrap(
    await sb()
      .from("weekly_periods")
      .insert({ barber_id: barberId, week_start_date: startISO, week_end_date: endISO, status: "open" })
      .select()
      .single()
  );
}

export async function setWeeklyPeriodStatus(periodId, status) {
  const patch = { status };
  if (status === "closed") patch.closed_at = new Date().toISOString();
  return unwrap(await sb().from("weekly_periods").update(patch).eq("id", periodId).select().single());
}

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

export async function cancelSettlement(settlementId) {
  return unwrap(await sb().from("settlements").update({ status: "cancelled" }).eq("id", settlementId).select().single());
}

export async function reopenSettlement(settlementId) {
  return unwrap(await sb().from("settlements").update({ status: "completed" }).eq("id", settlementId).select().single());
}
