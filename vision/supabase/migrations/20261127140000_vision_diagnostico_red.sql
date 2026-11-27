-- =====================================================================
-- SMART BUSINESS VISION AI — DIAGNÓSTICO DE RED DEL LOCAL (Fase 1)
-- Migración: 20261127140000_vision_diagnostico_red.sql
-- =====================================================================
-- Guarda las mediciones que hace el propietario desde su iPhone, conectado
-- al Wi-Fi del local, para decidir si las cámaras pueden recibir conexiones
-- desde el servidor (CGNAT, IP pública, filtro por IP de origen del módem).
-- No guarda contraseñas del módem ni de las cámaras.
-- Idempotente.
-- =====================================================================

create table if not exists vision.network_checks (
  id bigint generated always as identity primary key,
  site_id uuid not null references vision.sites(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  public_ipv4 inet,
  public_ip_any inet,
  isp_org text check (isp_org is null or char_length(isp_org) <= 200),
  isp_asn text check (isp_asn is null or char_length(isp_asn) <= 40),
  wan_ip_modem inet,
  modem_model text check (modem_model is null or char_length(modem_model) <= 80),
  source_ip_filter text check (source_ip_filter in ('si', 'no', 'no_se')),
  verdict text not null check (verdict in ('ip_publica', 'cgnat', 'doble_nat', 'nat_proveedor', 'incompleto')),
  notes text check (notes is null or char_length(notes) <= 500)
);

create index if not exists network_checks_site_time_idx on vision.network_checks(site_id, created_at desc);
create index if not exists network_checks_created_by_idx on vision.network_checks(created_by);

alter table vision.network_checks enable row level security;

drop policy if exists network_checks_select on vision.network_checks;
create policy network_checks_select on vision.network_checks for select to authenticated
  using (vision.can_manage(site_id));
drop policy if exists network_checks_insert on vision.network_checks;
create policy network_checks_insert on vision.network_checks for insert to authenticated
  with check (vision.can_manage(site_id));

revoke all on vision.network_checks from public, anon, authenticated;
grant select, insert on vision.network_checks to authenticated;
grant all on vision.network_checks to service_role;

notify pgrst, 'reload schema';
