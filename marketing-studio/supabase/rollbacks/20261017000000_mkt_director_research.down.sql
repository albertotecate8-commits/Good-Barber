-- Revierte 20261017000000_mkt_director_research.sql.
-- ATENCIÓN: borra informes, hallazgos, experimentos, registro de uso de IA y
-- los planes guardados en las campañas (las campañas en sí se conservan).
drop table if exists mkt_ai_usage;
drop table if exists mkt_experiments;
drop table if exists mkt_campaign_findings;

drop trigger if exists mkt_campaigns_links on mkt_campaigns;
alter table mkt_campaigns
  drop constraint if exists mkt_campaigns_goal,
  drop constraint if exists mkt_campaigns_instruction_len,
  drop constraint if exists mkt_campaigns_plan_object,
  drop constraint if exists mkt_campaigns_plan_source,
  drop column if exists request_group,
  drop column if exists research_report_id,
  drop column if exists plan_version,
  drop column if exists plan_source,
  drop column if exists plan,
  drop column if exists instruction,
  drop column if exists goal;

drop table if exists mkt_research_findings;
drop table if exists mkt_research_reports;
drop function if exists mkt_guard_director_links();
drop function if exists mkt_guard_ai_usage();

alter table mkt_assets drop constraint if exists mkt_assets_origin, drop column if exists origin;
