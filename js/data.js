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

export async function createBarberViaFunction({ name, email, password, percentage = 60, active = true }) {
  const { data: sessionData } = await sb().auth.getSession();
  const token = sessionData?.session?.access_token;
  const { data, error } = await sb().functions.invoke("admin-create-barber", {
    body: { name, email, password, percentage, active },
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

// Busca si ya existe un cliente con este teléfono (cualquier formato: la
// normalización la hace el propio Postgres, igual que en la reserva pública).
// No filtra por "active": el índice único de phone_normalized tampoco lo
// hace, así que un cliente desactivado con el mismo número igual bloquearía
// un alta nueva — hay que poder detectarlo también.
export async function findClientByPhone(phone) {
  if (!phone) return null;
  const { data: normalized, error: normError } = await sb().rpc("normalize_phone", { p_phone: phone });
  if (normError) throw normError;
  if (!normalized) return null;
  const { data, error } = await sb().from("clients").select("*").eq("phone_normalized", normalized).maybeSingle();
  if (error) throw error;
  return data;
}

// Convierte el error crudo de Postgres (unique_violation sobre
// phone_normalized) en un error con código DUPLICATE_PHONE y, si se pudo
// encontrar, el cliente existente adjunto — para que la pantalla pueda
// ofrecer "usar cliente existente" en vez de un mensaje técnico.
async function asDuplicatePhoneError(error, phone) {
  if (error?.code !== "23505") return error;
  let existingClient = null;
  try {
    existingClient = await findClientByPhone(phone);
  } catch {
    // Si ni siquiera se pudo buscar el existente, seguimos devolviendo el
    // error amigable de todas formas — solo sin el cliente adjunto.
  }
  const friendly = new Error("Este número ya está registrado.");
  friendly.code = "DUPLICATE_PHONE";
  friendly.existingClient = existingClient;
  return friendly;
}

export async function createClient({ barberId, name, phone, notes }) {
  const { data, error } = await sb().from("clients").insert({ barber_id: barberId, name, phone, notes }).select().single();
  if (error) throw await asDuplicatePhoneError(error, phone);
  return data;
}

export async function updateClient(clientId, patch) {
  const { data, error } = await sb().from("clients").update(patch).eq("id", clientId).select().single();
  if (error) throw await asDuplicatePhoneError(error, patch.phone);
  return data;
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

// Registra varios servicios de una sola vez (una "venta" con varias líneas).
// Todas las filas comparten un sale_id para poder identificarlas como una
// misma operación. Pasa por el RPC create_service_records_batch (SECURITY
// INVOKER: exige exactamente el mismo RLS que un insert normal) en vez de un
// insert directo, porque ese RPC es idempotente por sale_id — si esta misma
// llamada se repite (doble clic, reintento de red) con el MISMO saleId,
// devuelve las filas que ya se guardaron en vez de crearlas otra vez. Por
// eso quien llama debe generar el saleId UNA sola vez por operación y
// reusarlo si reintenta, no generar uno nuevo en cada intento.
export async function createServiceRecordsBatch({ barberId, clientId, items, saleId }) {
  const finalSaleId = saleId || crypto.randomUUID();
  const payload = items.map((item) => ({
    service_id: item.service.id,
    service_name: item.service.name,
    price_cents: item.service.price_cents,
    quantity: item.quantity ?? 1,
    discount_cents: item.discountCents ?? 0,
    notes: item.notes ?? null,
  }));
  return unwrap(
    await sb().rpc("create_service_records_batch", {
      p_barber_id: barberId,
      p_client_id: clientId ?? null,
      p_sale_id: finalSaleId,
      p_items: payload,
    })
  );
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

// Historial de un cliente concreto. RLS decide qué ve quien la llama: el
// admin ve todo lo del cliente; un barbero (si algún día se usa desde su
// panel) solo vería sus propias filas — no se le da ningún permiso nuevo,
// service_records_select sigue siendo exactamente is_admin() o
// barber_id = current_barber_id().
export async function listRecordsForClient(clientId) {
  return unwrap(
    await sb()
      .from("service_records")
      .select("*, barbers(name)")
      .eq("client_id", clientId)
      .order("record_date", { ascending: false })
      .order("record_time", { ascending: false })
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
