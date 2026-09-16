-- =========================================================
-- GOOD BARBER — Notificaciones push al barbero
--
-- Cuando entra una cita nueva, el barbero recibe una notificación real del
-- sistema operativo en su teléfono, aunque Good Barber esté cerrada.
--
-- REGLA QUE MANDA SOBRE TODO LO DEMÁS: el push es SECUNDARIO a la reserva.
-- Esta migración NO toca book_appointment, ni public_available_slots, ni el
-- trigger que ya avisa al cliente. El envío ocurre FUERA de la transacción
-- de la cita (Database Webhook -> Edge Function), así que una caída del
-- servicio de push, una clave VAPID mal puesta o un endpoint caducado NO
-- pueden impedir que una cita se cree.
--
-- Aditiva e idempotente. Los únicos DROP son de restricciones CHECK que se
-- reemplazan por otras más amplias: no se pierde ninguna fila.
-- =========================================================

-- ---------------------------------------------------------
-- 1. Suscripciones push
--
-- Una fila por DISPOSITIVO. Un barbero con iPhone, Android y computadora
-- tiene tres filas, y las tres reciben.
-- ---------------------------------------------------------
create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  -- Dueño de la suscripción. Es lo que comprueba el RLS.
  profile_id    uuid not null references public.profiles(id) on delete cascade,
  -- Atajo para la consulta de envío. Nullable a propósito: así un
  -- administrador podrá suscribirse el día que se quiera, sin migrar nada.
  barber_id     uuid references public.barbers(id) on delete cascade,

  -- El endpoint ES la identidad del dispositivo ante el servicio de push.
  -- UNIQUE = un dispositivo nunca puede tener dos filas, así que no puede
  -- recibir dos veces la misma notificación.
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,

  user_agent    text,
  -- Origen desde el que se suscribió. Las suscripciones pertenecen a un
  -- origen concreto: si algún día aparece otro dominio, se ve en los datos
  -- en lugar de descubrirlo por un silencio inexplicable.
  origin        text,

  active        boolean not null default true,
  last_seen_at  timestamptz not null default now(),
  last_error    text,
  failure_count integer not null default 0,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Suscripciones Web Push por dispositivo. Una fila por teléfono/navegador.';
comment on column public.push_subscriptions.endpoint is
  'Identidad del dispositivo ante el servicio de push. UNIQUE: evita duplicados.';
comment on column public.push_subscriptions.active is
  'false = el servicio de push respondió 404/410 (endpoint caducado). No se borra: queda el rastro.';

drop trigger if exists trg_push_subscriptions_updated_at on public.push_subscriptions;
create trigger trg_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- Índice de la consulta de envío: las suscripciones activas de un barbero.
create index if not exists push_subscriptions_barber_idx
  on public.push_subscriptions (barber_id)
  where active;

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

-- ---------------------------------------------------------
-- 2. RLS — cada quien, solo lo suyo
--
-- El frontend NUNCA decide de quién es una suscripción: profile_id tiene que
-- coincidir con auth.uid(), y barber_id con current_barber_id(). Las dos
-- salen del token, no de lo que mande el navegador.
-- ---------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions
  for select using (profile_id = auth.uid());

drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (
    profile_id = auth.uid()
    and (select public.is_active_profile())
    and (barber_id is null or barber_id = (select public.current_barber_id()))
  );

drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and (barber_id is null or barber_id = (select public.current_barber_id()))
  );

drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions
  for delete using (profile_id = auth.uid());

-- Supabase concede ALL por defecto a anon/authenticated sobre los objetos
-- nuevos del esquema public. Un endpoint filtrado permite enviar
-- notificaciones a ese dispositivo, así que anon no pinta nada aquí.
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------
-- 3. notification_queue — se REUTILIZA, no se duplica
--
-- Ya existía y ya la llena un trigger, pero nadie la consumía: 11 filas
-- 'pending' desde el 9 de septiembre. A partir de aquí queda claro quién
-- hace qué, y es el registro que hace imposible el envío duplicado.
--
--   CREA la fila ........ la Edge Function send-appointment-push
--   PROCESA ............. la misma, en la misma invocación
--   ACTUALIZA status .... la misma: sent / failed / skipped
--   EVITA duplicados .... el índice único parcial de más abajo
--   REINTENTO ........... status='failed' + attempts; una fila fallida se
--                         puede reenviar sin riesgo porque el índice único
--                         impide que se cree una segunda para la misma cita
-- ---------------------------------------------------------
alter table public.notification_queue drop constraint if exists notification_queue_channel_check;
alter table public.notification_queue add  constraint notification_queue_channel_check
  check (channel in ('whatsapp', 'sms', 'email', 'push'));

alter table public.notification_queue drop constraint if exists notification_queue_kind_check;
alter table public.notification_queue add  constraint notification_queue_kind_check
  check (kind in ('confirmation', 'reminder', 'cancellation', 'reschedule',
                  'new_appointment_barber'));

-- Destinatario cuando el aviso NO va al cliente sino a alguien de la casa.
alter table public.notification_queue
  add column if not exists recipient_profile_id uuid references public.profiles(id);

comment on column public.notification_queue.recipient_profile_id is
  'Destinatario interno (barbero/administrador). NULL cuando el aviso va al cliente por teléfono.';

-- ---------------------------------------------------------
-- 4. LA garantía anti-duplicados
--
-- Un Database Webhook puede dispararse dos veces (reintento de Supabase,
-- red inestable). `tag` no sirve como defensa: Safari lo acepta y lo ignora,
-- comprobado en los datos de compatibilidad. La única garantía real es esta,
-- y vive en el servidor: como máximo UNA fila de aviso al barbero por cita.
--
-- La Edge Function hace el INSERT primero. Si choca con este índice, ya se
-- envió: no vuelve a enviar.
-- ---------------------------------------------------------
create unique index if not exists notification_queue_barber_aviso_unico
  on public.notification_queue (appointment_id, kind)
  where kind = 'new_appointment_barber';

create index if not exists notification_queue_pendientes_idx
  on public.notification_queue (status, scheduled_for)
  where status = 'pending';

-- La cola es interna: solo la toca la Edge Function con service_role.
revoke all on public.notification_queue from anon, authenticated;

notify pgrst, 'reload schema';
