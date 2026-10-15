-- Revierte 20261020000000_mkt_meta_connections.sql. Borra los tokens guardados:
-- las cuentas quedan como estaban registradas, pero sin conexión.
begin;
-- El trigger de guarda solo deja cambiar el estado de conexión al servidor.
select set_config('request.jwt.claims', '{"role": "service_role"}', true);
update mkt_social_accounts set connection_status = 'not_connected', external_id = null, token_expires_at = null
  where id in (select social_account_id from mkt_social_tokens);
drop table if exists mkt_social_tokens;
drop table if exists mkt_meta_oauth_sessions;
commit;
