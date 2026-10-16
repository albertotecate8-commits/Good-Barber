-- Revierte 20261021000000_mkt_publishing.sql. Las publicaciones aprobadas
-- vuelven a modo manual (nada se publicará automáticamente).
begin;
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
update mkt_content_items set publish_mode = 'manual' where publish_mode = 'api';
drop index if exists mkt_content_items_due_idx;
drop index if exists mkt_publish_attempts_one_success;

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
      raise exception 'La publicación automática aún no está disponible: no hay integración oficial conectada.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.published_at := null;
      new.last_error := null;
    else
      new.external_post_id := old.external_post_id;
      new.published_at := old.published_at;
      new.last_error := old.last_error;
    end if;
  end if;
  return new;
end;
$$;

alter table mkt_content_items drop constraint if exists mkt_content_publish_attempts_range;
alter table mkt_content_items
  drop column if exists publish_attempts,
  drop column if exists publish_lock_at,
  drop column if exists approved_at,
  drop column if exists approved_by;
commit;
