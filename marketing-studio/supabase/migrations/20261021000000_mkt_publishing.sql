-- Marketing AI Studio — publicación oficial con aprobación manual.
--
-- Una publicación solo sale automáticamente si:
--   1. el dueño del negocio la APROBÓ (approved_by/approved_at, los fija el
--      servidor tras verificar que es owner), con publish_mode = 'api',
--   2. está programada y su hora ya llegó,
--   3. la cuenta de la red está conectada con permisos de publicación, y
--   4. la publicación automática está activada en el servidor.
-- Si alguien edita el texto, el recurso, la red, el formato, la fecha o el
-- estado de una publicación aprobada, la aprobación se revoca sola.
-- Un mismo contenido no puede registrar dos publicaciones exitosas (índice único).
--
-- Idempotente. Reversible con supabase/rollbacks/20261021000000_mkt_publishing.down.sql

alter table mkt_content_items
  add column if not exists approved_by uuid references auth.users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists publish_lock_at timestamptz,
  add column if not exists publish_attempts integer not null default 0;

do $$ begin
  alter table mkt_content_items add constraint mkt_content_publish_attempts_range check (publish_attempts between 0 and 100);
exception when duplicate_object then null; end $$;

create or replace function mkt_guard_content_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception 'Una publicación solo se marca como publicada cuando la plataforma lo confirma.'
        using errcode = '42501';
    end if;
    if new.status = 'error' and (tg_op = 'INSERT' or old.status is distinct from 'error') then
      raise exception 'El estado de error lo asigna el servidor al fallar una publicación.'
        using errcode = '42501';
    end if;
    if new.publish_mode = 'api' and (tg_op = 'INSERT' or old.publish_mode is distinct from 'api') then
      raise exception 'La publicación automática solo se activa al aprobarla el dueño del negocio desde la app.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.published_at := null;
      new.last_error := null;
      new.approved_by := null;
      new.approved_at := null;
      new.publish_lock_at := null;
      new.publish_attempts := 0;
    else
      new.external_post_id := old.external_post_id;
      new.published_at := old.published_at;
      new.last_error := old.last_error;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.publish_lock_at := old.publish_lock_at;
      new.publish_attempts := old.publish_attempts;
      -- Cualquier cambio a una publicación aprobada revoca la aprobación.
      if old.publish_mode = 'api' and (
           new.caption is distinct from old.caption or new.hashtags is distinct from old.hashtags
           or new.asset_id is distinct from old.asset_id or new.platform is distinct from old.platform
           or new.format is distinct from old.format or new.scheduled_at is distinct from old.scheduled_at
           or new.status is distinct from old.status or new.title is distinct from old.title) then
        new.publish_mode := 'manual';
        new.approved_by := null;
        new.approved_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create unique index if not exists mkt_publish_attempts_one_success
  on mkt_publish_attempts (content_id) where outcome = 'success';
create index if not exists mkt_content_items_due_idx
  on mkt_content_items (scheduled_at) where status = 'scheduled' and publish_mode = 'api';
