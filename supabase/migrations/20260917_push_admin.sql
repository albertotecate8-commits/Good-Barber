-- =========================================================
-- GOOD BARBER — El administrador también recibe las citas nuevas
--
-- La tabla push_subscriptions ya dejaba barber_id NULL desde el primer día,
-- pensando exactamente en esto. Lo que faltaba era decir QUIÉN puede usar ese
-- NULL: hasta ahora cualquier perfil activo podía registrarse con barber_id
-- NULL, y en cuanto la Edge Function empiece a tratar esas filas como
-- «avisos de toda la casa», eso sería un barbero recibiendo las citas de
-- todos sus compañeros.
--
-- Así que el NULL pasa a ser privilegio del administrador:
--
--   (barber_id IS NULL AND is_admin())        -> la suscripción de la casa
--   OR barber_id = current_barber_id()        -> la del propio barbero
--
-- Las dos ramas salen del token, no de lo que mande el navegador.
--
-- Comprobado ANTES de escribir esto, en producción:
--   filas con barber_id NULL ............ 0
--   de ellas, de perfiles no admin ...... 0
-- No hay ninguna fila que esta regla deje fuera. Y aunque la hubiera, el RLS
-- solo se evalúa al escribir: ninguna fila existente se pierde ni se toca.
--
-- Esta migración NO toca la tabla, ni sus columnas, ni sus índices, ni los
-- datos, ni las políticas de SELECT y DELETE, ni book_appointment, ni
-- public_available_slots, ni los triggers de appointments, ni el webhook.
-- Solo reemplaza dos políticas por otras equivalentes y más estrictas.
-- Idempotente.
-- =========================================================

-- ---------------------------------------------------------
-- INSERT — registrar este dispositivo
--
-- Cambia únicamente la última condición: antes `barber_id IS NULL` valía para
-- cualquiera; ahora exige ser administrador.
-- ---------------------------------------------------------
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
create policy push_subscriptions_insert on public.push_subscriptions
  for insert with check (
    profile_id = auth.uid()
    and (select public.is_active_profile())
    and (
      (barber_id is null and (select public.is_admin()))
      or barber_id = (select public.current_barber_id())
    )
  );

-- ---------------------------------------------------------
-- UPDATE — reactivar o refrescar el dispositivo propio
--
-- El USING no se toca: sigue siendo `profile_id = auth.uid()`, que es lo que
-- impide apropiarse de la suscripción de otra cuenta. El WITH CHECK se alinea
-- con el de INSERT para que nadie pueda dejar la fila en un estado que no
-- habría podido crear.
-- ---------------------------------------------------------
drop policy if exists push_subscriptions_update on public.push_subscriptions;
create policy push_subscriptions_update on public.push_subscriptions
  for update using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and (
      (barber_id is null and (select public.is_admin()))
      or barber_id = (select public.current_barber_id())
    )
  );

comment on column public.push_subscriptions.barber_id is
  'Barbero al que avisar. NULL = suscripción de la casa (administrador): recibe las citas de todos los barberos. El RLS reserva el NULL a is_admin().';

notify pgrst, 'reload schema';
