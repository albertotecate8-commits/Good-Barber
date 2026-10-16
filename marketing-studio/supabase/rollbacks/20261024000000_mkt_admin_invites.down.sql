-- Revierte 20261024000000_mkt_admin_invites.sql. No quita administradores ya dados de alta.
drop trigger if exists mkt_claim_admin_invite_on_insert on auth.users;
drop trigger if exists mkt_claim_admin_invite_on_confirm on auth.users;
drop function if exists mkt_claim_admin_invite();
drop table if exists mkt_admin_invites;
