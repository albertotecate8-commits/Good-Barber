-- Revierte 20261026000000_mkt_image_generation.sql (se pierde el conteo de unidades).
drop function if exists mkt_ai_units_today(text);
alter table mkt_ai_usage drop constraint if exists mkt_ai_usage_units_range;
alter table mkt_ai_usage drop column if exists units;
