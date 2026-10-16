-- Revierte 20261022000000_mkt_leads.sql. ATENCIÓN: borra los prospectos registrados.
drop table if exists mkt_leads;
drop function if exists mkt_guard_lead_links();
