-- Marketing AI Studio — prospectos y resultados comerciales.
--
-- Registro independiente (NO se conecta a la base de la app de citas de Good
-- Barber): cada prospecto pertenece a un negocio, puede atribuirse a una
-- campaña/publicación del MISMO negocio y guarda cómo se sabe esa atribución
-- (lo dijo el cliente, código de campaña o desconocida). Las ventas solo se
-- registran como montos reales capturados o importados por ti.
--
-- Idempotente. Reversible con supabase/rollbacks/20261022000000_mkt_leads.down.sql

create table if not exists mkt_leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  campaign_id uuid references mkt_campaigns (id) on delete set null,
  content_id uuid references mkt_content_items (id) on delete set null,
  occurred_on date not null default (now() at time zone 'America/Mexico_City')::date,
  source text not null default 'other' check (source in (
    'instagram_dm', 'facebook_messenger', 'whatsapp', 'phone', 'walk_in', 'referral', 'google', 'website', 'other')),
  contact_name text not null default '' check (length(contact_name) <= 120),
  contact_hint text not null default '' check (length(contact_hint) <= 120),
  status text not null default 'new' check (status in ('new', 'contacted', 'appointment', 'customer', 'lost')),
  appointment_at timestamptz,
  value_cents integer check (value_cents is null or value_cents between 0 and 100000000),
  attribution text not null default 'unknown' check (attribution in ('declared', 'campaign_code', 'unknown')),
  notes text not null default '' check (length(notes) <= 2000),
  import_batch uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una atribución declarada o por código exige saber a qué campaña.
  constraint mkt_leads_attribution_campaign check (attribution = 'unknown' or campaign_id is not null)
);
create index if not exists mkt_leads_business_idx on mkt_leads (business_id, occurred_on desc);
create index if not exists mkt_leads_campaign_idx on mkt_leads (campaign_id);
create index if not exists mkt_leads_content_idx on mkt_leads (content_id);

create or replace function mkt_guard_lead_links()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.campaign_id is not null and not exists (
    select 1 from mkt_campaigns where id = new.campaign_id and business_id = new.business_id) then
    raise exception 'La campaña pertenece a otro negocio.' using errcode = '42501';
  end if;
  if new.content_id is not null and not exists (
    select 1 from mkt_content_items where id = new.content_id and business_id = new.business_id) then
    raise exception 'La publicación pertenece a otro negocio.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'Un prospecto no se puede mover a otro negocio.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger mkt_leads_links before insert or update on mkt_leads
  for each row execute function mkt_guard_lead_links();
create or replace trigger mkt_leads_touch before update on mkt_leads
  for each row execute function mkt_touch_updated_at();
create or replace trigger mkt_leads_audit after insert or update or delete on mkt_leads
  for each row execute function mkt_audit();

alter table mkt_leads enable row level security;
do $$ begin
  create policy mkt_leads_read on mkt_leads for select to authenticated using (mkt_can_read(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mkt_leads_insert on mkt_leads for insert to authenticated with check (mkt_can_write(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mkt_leads_update on mkt_leads for update to authenticated
    using (mkt_can_write(business_id)) with check (mkt_can_write(business_id));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy mkt_leads_delete on mkt_leads for delete to authenticated using (mkt_can_write(business_id));
exception when duplicate_object then null; end $$;

revoke all on mkt_leads from anon;
revoke truncate, references, trigger on mkt_leads from authenticated;
grant select, insert, update, delete on mkt_leads to authenticated;
revoke execute on function mkt_guard_lead_links() from anon, public, authenticated;
