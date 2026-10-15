-- Marketing AI Studio — Director de Marketing + Investigación de mercado.
-- Reversible con supabase/rollbacks/20261017000000_mkt_director_research.down.sql
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Investigación: informes y hallazgos con fuente y nivel de evidencia
-- ---------------------------------------------------------------------------
create table if not exists mkt_research_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 160),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 15),
  city text not null default '' check (length(city) <= 120),
  -- Resultado de cada proveedor automático: [{provider, status, message, count, at}]
  provider_runs jsonb not null default '[]'::jsonb check (jsonb_typeof(provider_runs) = 'array'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_research_reports_business_idx on mkt_research_reports (business_id, created_at desc);

create table if not exists mkt_research_findings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  report_id uuid not null references mkt_research_reports (id) on delete cascade,
  source_type text not null check (source_type in (
    'business_data', 'calendar', 'osm', 'web_search', 'google_trends', 'meta_ad_library',
    'tiktok_creative_center', 'google_maps', 'manual'
  )),
  source_name text not null check (length(btrim(source_name)) between 1 and 160),
  url text check (url is null or (url ~ '^https://' and length(url) <= 2000)),
  consulted_at timestamptz not null default now(),
  summary text not null check (length(btrim(summary)) between 3 and 2000),
  evidence text not null default '' check (length(evidence) <= 4000),
  -- Hecho comprobado / observación / hipótesis. Las recomendaciones por
  -- probar viven en el plan de campaña, no aquí.
  evidence_level text not null check (evidence_level in ('fact', 'observation', 'hypothesis')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  capture_method text not null check (capture_method in ('automatic', 'manual')),
  raw jsonb check (raw is null or pg_column_size(raw) <= 60000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists mkt_research_findings_report_idx on mkt_research_findings (report_id, evidence_level);

-- ---------------------------------------------------------------------------
-- 2. Campañas del Director
-- ---------------------------------------------------------------------------
alter table mkt_campaigns
  add column if not exists goal text,
  add column if not exists instruction text not null default '',
  add column if not exists plan jsonb not null default '{}'::jsonb,
  add column if not exists plan_source text not null default 'manual',
  add column if not exists plan_version integer not null default 1,
  add column if not exists research_report_id uuid references mkt_research_reports (id) on delete set null,
  add column if not exists request_group uuid;

do $$ begin
  alter table mkt_campaigns add constraint mkt_campaigns_goal check (
    goal is null or goal in ('customers', 'appointments', 'messages', 'sales', 'awareness', 'reactivation'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_campaigns add constraint mkt_campaigns_instruction_len check (length(instruction) <= 2000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_campaigns add constraint mkt_campaigns_plan_object check (
    jsonb_typeof(plan) = 'object' and pg_column_size(plan) <= 200000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_campaigns add constraint mkt_campaigns_plan_source check (
    plan_source in ('template', 'gemini_api', 'assisted_import', 'manual'));
exception when duplicate_object then null; end $$;
create index if not exists mkt_campaigns_group_idx on mkt_campaigns (request_group);

-- Hallazgos que sustentan cada campaña (siempre del mismo negocio).
create table if not exists mkt_campaign_findings (
  campaign_id uuid not null references mkt_campaigns (id) on delete cascade,
  finding_id uuid not null references mkt_research_findings (id) on delete cascade,
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  primary key (campaign_id, finding_id)
);

-- ---------------------------------------------------------------------------
-- 3. Experimentos y resultados comerciales (registro manual)
-- ---------------------------------------------------------------------------
create table if not exists mkt_experiments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  campaign_id uuid not null references mkt_campaigns (id) on delete cascade,
  content_id uuid references mkt_content_items (id) on delete set null,
  hypothesis text not null check (length(btrim(hypothesis)) between 3 and 1000),
  variant text not null default '' check (length(variant) <= 300),
  published_on date,
  period_end date,
  messages integer not null default 0 check (messages between 0 and 1000000),
  appointments integer not null default 0 check (appointments between 0 and 1000000),
  customers integer not null default 0 check (customers between 0 and 1000000),
  sales_count integer not null default 0 check (sales_count between 0 and 1000000),
  revenue_cents bigint not null default 0 check (revenue_cents between 0 and 100000000000),
  ad_spend_cents bigint not null default 0 check (ad_spend_cents between 0 and 100000000000),
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end is null or published_on is null or period_end >= published_on)
);
create index if not exists mkt_experiments_campaign_idx on mkt_experiments (campaign_id);

-- ---------------------------------------------------------------------------
-- 4. Registro de uso de proveedores de IA (para topes diarios y gasto $0)
-- ---------------------------------------------------------------------------
create table if not exists mkt_ai_usage (
  id bigint generated always as identity primary key,
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider text not null check (length(provider) <= 60),
  purpose text not null default '' check (length(purpose) <= 120),
  outcome text not null default 'ok' check (outcome in ('ok', 'error', 'blocked')),
  estimated_cost_mxn numeric(10, 2) not null default 0 check (estimated_cost_mxn >= 0),
  created_at timestamptz not null default now()
);
create index if not exists mkt_ai_usage_provider_day_idx on mkt_ai_usage (provider, created_at);

-- ---------------------------------------------------------------------------
-- 5. Origen de cada recurso de la biblioteca (foto real, IA, edición, etc.)
-- ---------------------------------------------------------------------------
alter table mkt_assets add column if not exists origin text not null default 'unspecified';
do $$ begin
  alter table mkt_assets add constraint mkt_assets_origin check (
    origin in ('unspecified', 'real_photo', 'ai_generated', 'code_edited', 'imported_design'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 6. Coherencia entre negocios (nada se enlaza con datos de otro negocio)
-- ---------------------------------------------------------------------------
create or replace function mkt_guard_director_links()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'mkt_research_findings' then
    if not exists (select 1 from mkt_research_reports where id = new.report_id and business_id = new.business_id) then
      raise exception 'El informe pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_campaigns' then
    if new.research_report_id is not null and not exists (
      select 1 from mkt_research_reports where id = new.research_report_id and business_id = new.business_id) then
      raise exception 'La investigación pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_campaign_findings' then
    if not exists (select 1 from mkt_campaigns where id = new.campaign_id and business_id = new.business_id)
       or not exists (select 1 from mkt_research_findings where id = new.finding_id and business_id = new.business_id) then
      raise exception 'La campaña y el hallazgo deben ser del mismo negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_experiments' then
    if not exists (select 1 from mkt_campaigns where id = new.campaign_id and business_id = new.business_id) then
      raise exception 'La campaña pertenece a otro negocio.' using errcode = '42501';
    end if;
    if new.content_id is not null and not exists (
      select 1 from mkt_content_items where id = new.content_id and business_id = new.business_id) then
      raise exception 'La publicación pertenece a otro negocio.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mkt_research_findings_links on mkt_research_findings;
create trigger mkt_research_findings_links before insert or update on mkt_research_findings
  for each row execute function mkt_guard_director_links();
drop trigger if exists mkt_campaigns_links on mkt_campaigns;
create trigger mkt_campaigns_links before insert or update on mkt_campaigns
  for each row execute function mkt_guard_director_links();
drop trigger if exists mkt_campaign_findings_links on mkt_campaign_findings;
create trigger mkt_campaign_findings_links before insert or update on mkt_campaign_findings
  for each row execute function mkt_guard_director_links();
drop trigger if exists mkt_experiments_links on mkt_experiments;
create trigger mkt_experiments_links before insert or update on mkt_experiments
  for each row execute function mkt_guard_director_links();

-- Un registro de uso no se puede atribuir a otra persona.
create or replace function mkt_guard_ai_usage()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and new.user_id is distinct from auth.uid() then
    raise exception 'El uso de IA solo se registra a nombre propio.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists mkt_ai_usage_guard on mkt_ai_usage;
create trigger mkt_ai_usage_guard before insert on mkt_ai_usage
  for each row execute function mkt_guard_ai_usage();

do $$
declare t text;
begin
  foreach t in array array['mkt_research_reports', 'mkt_experiments'] loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function mkt_touch_updated_at()', t, t);
  end loop;
  foreach t in array array['mkt_research_reports', 'mkt_research_findings', 'mkt_experiments'] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function mkt_audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mkt_research_reports', 'mkt_research_findings', 'mkt_campaign_findings', 'mkt_experiments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (mkt_can_read(business_id))', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (mkt_can_write(business_id))', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (mkt_can_write(business_id)) with check (mkt_can_write(business_id))', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (mkt_can_write(business_id))', t, t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- Uso de IA: se lee y se agrega; nunca se edita ni se borra desde el navegador.
alter table mkt_ai_usage enable row level security;
drop policy if exists mkt_ai_usage_read on mkt_ai_usage;
create policy mkt_ai_usage_read on mkt_ai_usage for select to authenticated using (mkt_can_read(business_id));
drop policy if exists mkt_ai_usage_insert on mkt_ai_usage;
create policy mkt_ai_usage_insert on mkt_ai_usage for insert to authenticated with check (mkt_can_write(business_id));
revoke all on mkt_ai_usage from anon, authenticated;
grant select, insert on mkt_ai_usage to authenticated;
