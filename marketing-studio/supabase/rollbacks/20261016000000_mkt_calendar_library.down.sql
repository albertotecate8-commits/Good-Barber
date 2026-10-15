-- Revierte 20261016000000_mkt_calendar_library.sql.
-- ATENCIÓN: borra la biblioteca (registros de mkt_assets) y los campos nuevos
-- de las publicaciones (hashtags, recurso enlazado, publicación manual).
-- Los ARCHIVOS del bucket "mkt-assets" no se borran: vacíalo desde el panel de
-- Supabase si ya no los necesitas (el bucket no se elimina si tiene archivos).

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists mkt_assets_storage_read on storage.objects;
    drop policy if exists mkt_assets_storage_insert on storage.objects;
    drop policy if exists mkt_assets_storage_delete on storage.objects;
  end if;
end $$;

drop function if exists mkt_storage_upload_allowed(text);
drop function if exists mkt_storage_business(text);
drop table if exists mkt_publish_attempts;

drop trigger if exists mkt_content_items_links on mkt_content_items;
drop function if exists mkt_guard_content_links();

alter table mkt_content_items
  drop constraint if exists mkt_content_scheduled_needs_date,
  drop constraint if exists mkt_content_manual_url,
  drop constraint if exists mkt_content_publish_mode,
  drop constraint if exists mkt_content_hashtags_max,
  drop column if exists manual_post_url,
  drop column if exists manual_posted_at,
  drop column if exists publish_mode,
  drop column if exists asset_id,
  drop column if exists hashtags;

drop table if exists mkt_assets;
drop function if exists mkt_guard_asset();

-- Guardián original de la migración 20261015000000.
create or replace function mkt_guard_content_status()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception 'Una publicación solo se marca como publicada cuando la plataforma lo confirma.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.published_at := null;
    else
      new.external_post_id := old.external_post_id;
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end;
$$;

do $$ begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'mkt_content_status' and e.enumlabel = 'review'
  ) then
    alter type mkt_content_status rename value 'review' to 'pending';
  end if;
end $$;
