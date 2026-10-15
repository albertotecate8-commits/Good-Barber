-- Revierte 20261018000000_mkt_creative_studio.sql.
-- ATENCIÓN: borra proyectos y versiones del estudio creativo (los archivos de
-- la Biblioteca se conservan). Antes de revertir, elimina o recategoriza los
-- recursos de tipo «audio», o la restauración del tipo fallará.
drop table if exists mkt_creative_versions;
drop table if exists mkt_creative_projects;
drop function if exists mkt_guard_creative_links();

alter table mkt_assets drop constraint if exists mkt_assets_kind_check;
alter table mkt_assets add constraint mkt_assets_kind_check
  check (kind in ('image', 'video', 'logo', 'document', 'other'));
alter table mkt_assets
  drop constraint if exists mkt_assets_dimensions,
  drop constraint if exists mkt_assets_license_len,
  drop column if exists license_note,
  drop column if exists height,
  drop column if exists width;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
      set allowed_mime_types = (
        select array_agg(m) from unnest(allowed_mime_types) m where m not like 'audio/%')
      where id = 'mkt-assets';
  end if;
end $$;
