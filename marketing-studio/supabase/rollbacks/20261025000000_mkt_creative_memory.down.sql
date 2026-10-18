-- Revierte 20261025000000_mkt_creative_memory.sql. ATENCIÓN: borra estilos,
-- memoria y conversaciones del chat creativo. Las versiones y publicaciones se
-- conservan (solo pierden el vínculo con el estilo y con la versión aprobada).
drop trigger if exists mkt_content_items_creative_guard on mkt_content_items;
drop trigger if exists mkt_creative_versions_style_guard on mkt_creative_versions;
drop index if exists mkt_content_items_creative_version_idx;
alter table mkt_content_items drop column if exists creative_version_id;
alter table mkt_creative_versions drop column if exists style_id;
drop table if exists mkt_creative_messages;
drop table if exists mkt_creative_threads;
drop table if exists mkt_memory;
drop table if exists mkt_styles;
drop function if exists mkt_guard_creative_memory();
