-- Revierte 20261023000000_mkt_group_distribution.sql. ATENCIÓN: borra grupos,
-- distribuciones e historial de tareas, y los enlaces guardados de las publicaciones.
-- Restaura la guarda de contenido anterior (sin external_post_url).
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

drop table if exists mkt_distribution_tasks;
drop table if exists mkt_distributions;
drop table if exists mkt_fb_groups;
drop function if exists mkt_guard_distribution();
alter table mkt_content_items drop constraint if exists mkt_content_planned_groups_max;
alter table mkt_content_items drop constraint if exists mkt_content_external_url;
alter table mkt_content_items drop column if exists planned_group_ids, drop column if exists external_post_url;
