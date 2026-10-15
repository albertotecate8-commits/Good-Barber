-- Marketing AI Studio — esquema base (Etapa 2)
--
-- Todas las tablas y funciones llevan el prefijo mkt_ para que este esquema
-- pueda vivir en cualquier proyecto Supabase sin chocar con otras apps (por
-- ejemplo, la app de citas de Good Barber ya usa services, clients, settings…).
-- Aun así se recomienda un proyecto Supabase propio: ver docs/DESPLIEGUE.md.
--
-- Modelo de aislamiento:
--   * Cada negocio (mkt_businesses) es la frontera de datos.
--   * mkt_business_members dice qué usuario puede ver/editar qué negocio.
--   * TODAS las tablas con datos de un negocio tienen RLS que exige ser miembro
--     de ese negocio (mkt_can_read / mkt_can_write).
--   * Crear negocios solo lo pueden hacer administradores (mkt_admins).
--   * La auditoría se escribe por triggers SECURITY DEFINER: el cliente no
--     puede insertarla ni alterarla.
--
-- Idempotente: se puede volver a ejecutar sin perder datos.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
do $$ begin
  create type mkt_member_role as enum ('owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mkt_social_platform as enum (
    'facebook_page', 'instagram', 'tiktok', 'whatsapp', 'google_business', 'youtube', 'website', 'other'
  );
exception when duplicate_object then null; end $$;

-- Estado de la conexión. "connected" SOLO lo puede fijar el servidor tras
-- validar un token oficial (ver trigger mkt_guard_social_status).
do $$ begin
  create type mkt_connection_status as enum ('not_connected', 'manual', 'connected', 'expired', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mkt_campaign_status as enum ('idea', 'research', 'draft', 'review', 'approved', 'active', 'finished', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mkt_content_status as enum ('draft', 'pending', 'approved', 'scheduled', 'published', 'error');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Administradores de la aplicación
-- ---------------------------------------------------------------------------
create table if not exists mkt_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function mkt_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from mkt_admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Negocios y membresía
-- ---------------------------------------------------------------------------
create table if not exists mkt_businesses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  name text not null check (length(btrim(name)) between 2 and 80),
  sector text not null default '' check (length(sector) <= 80),
  description text not null default '' check (length(description) <= 2000),
  city text not null default '' check (length(city) <= 120),
  service_area text not null default '' check (length(service_area) <= 500),
  address text not null default '' check (length(address) <= 300),
  target_audience text not null default '' check (length(target_audience) <= 2000),
  timezone text not null default 'America/Mexico_City',
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mkt_business_members (
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role mkt_member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index if not exists mkt_business_members_user_idx on mkt_business_members (user_id);

-- SECURITY DEFINER para que las políticas de otras tablas puedan consultar la
-- membresía sin recursión de RLS.
create or replace function mkt_can_read(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from mkt_business_members
    where business_id = p_business and user_id = auth.uid()
  );
$$;

create or replace function mkt_can_write(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from mkt_business_members
    where business_id = p_business and user_id = auth.uid() and role in ('owner', 'editor')
  );
$$;

create or replace function mkt_is_owner(p_business uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from mkt_business_members
    where business_id = p_business and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- Identidad de marca (1:1 con el negocio)
-- ---------------------------------------------------------------------------
create table if not exists mkt_brand_profiles (
  business_id uuid primary key references mkt_businesses (id) on delete cascade,
  color_primary text not null default '#C9A227' check (color_primary ~ '^#[0-9A-Fa-f]{6}$'),
  color_secondary text not null default '#1F1F23' check (color_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  color_accent text not null default '#7C5CFF' check (color_accent ~ '^#[0-9A-Fa-f]{6}$'),
  color_background text not null default '#0B0B0D' check (color_background ~ '^#[0-9A-Fa-f]{6}$'),
  font_heading text not null default '' check (length(font_heading) <= 80),
  font_body text not null default '' check (length(font_body) <= 80),
  tone_of_voice text not null default '' check (length(tone_of_voice) <= 1000),
  visual_rules text not null default '' check (length(visual_rules) <= 3000),
  dos text[] not null default '{}',
  donts text[] not null default '{}',
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Servicios / productos con precio, y promociones
-- ---------------------------------------------------------------------------
create table if not exists mkt_offerings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  kind text not null default 'service' check (kind in ('service', 'product', 'package')),
  -- Precio en centavos (MXN) para evitar errores de coma flotante. NULL =
  -- precio no definido (no se debe inventar en los anuncios).
  price_cents integer check (price_cents is null or price_cents between 0 and 100000000),
  currency text not null default 'MXN' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_offerings_business_idx on mkt_offerings (business_id, sort_order);

create table if not exists mkt_promotions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  title text not null check (length(btrim(title)) between 2 and 120),
  details text not null default '' check (length(details) <= 2000),
  restrictions text not null default '' check (length(restrictions) <= 2000),
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists mkt_promotions_business_idx on mkt_promotions (business_id);

-- ---------------------------------------------------------------------------
-- Perfiles sociales. NUNCA se guardan contraseñas. Los tokens OAuth (cuando
-- existan) irán en una tabla aparte sin acceso desde el navegador.
-- ---------------------------------------------------------------------------
create table if not exists mkt_social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  platform mkt_social_platform not null,
  handle text not null default '' check (length(handle) <= 120),
  url text check (url is null or url ~ '^https://'),
  connection_status mkt_connection_status not null default 'not_connected',
  external_id text,
  token_expires_at timestamptz,
  last_checked_at timestamptz,
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, platform, handle)
);
create index if not exists mkt_social_accounts_business_idx on mkt_social_accounts (business_id);

-- ---------------------------------------------------------------------------
-- Campañas y calendario de contenido
-- ---------------------------------------------------------------------------
create table if not exists mkt_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 120),
  objective text not null default '' check (length(objective) <= 1000),
  status mkt_campaign_status not null default 'idea',
  starts_on date,
  ends_on date,
  budget_cents integer check (budget_cents is null or budget_cents >= 0),
  kpi text not null default '' check (length(kpi) <= 300),
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists mkt_campaigns_business_idx on mkt_campaigns (business_id, status);

create table if not exists mkt_content_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  campaign_id uuid references mkt_campaigns (id) on delete set null,
  platform mkt_social_platform not null default 'instagram',
  format text not null default 'post' check (format in ('post', 'story', 'reel', 'carousel', 'video', 'flyer', 'other')),
  title text not null default '' check (length(title) <= 200),
  caption text not null default '' check (length(caption) <= 5000),
  scheduled_at timestamptz,
  status mkt_content_status not null default 'draft',
  -- Solo el servidor (tras confirmación de la plataforma) puede llenar estos
  -- campos y poner status = 'published'. Ver trigger mkt_guard_content_status.
  external_post_id text,
  published_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_content_items_business_idx on mkt_content_items (business_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------------
create table if not exists mkt_audit_log (
  id bigint generated always as identity primary key,
  business_id uuid references mkt_businesses (id) on delete cascade,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists mkt_audit_log_business_idx on mkt_audit_log (business_id, created_at desc);

create or replace function mkt_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_row jsonb;
  v_business uuid;
  v_entity_id text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_business := case
    when tg_table_name = 'mkt_businesses' then (v_row ->> 'id')::uuid
    else (v_row ->> 'business_id')::uuid
  end;
  v_entity_id := coalesce(v_row ->> 'id', v_row ->> 'business_id');
  -- Al borrar un negocio, sus filas hijas se borran en cascada; no se
  -- registran por separado (la FK del log ya no existiría).
  if tg_op = 'DELETE' and tg_table_name <> 'mkt_businesses'
     and not exists (select 1 from mkt_businesses where id = v_business) then
    return old;
  end if;
  insert into mkt_audit_log (business_id, actor_id, action, entity, entity_id, details)
  values (
    case when tg_op = 'DELETE' and tg_table_name = 'mkt_businesses' then null else v_business end,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op = 'UPDATE'
      then jsonb_build_object('changed', (
        select coalesce(jsonb_agg(key), '[]'::jsonb)
        from jsonb_each(to_jsonb(new)) n
        where n.value is distinct from (to_jsonb(old) -> n.key) and n.key <> 'updated_at'
      ))
      else jsonb_build_object('name', coalesce(v_row ->> 'name', v_row ->> 'title'))
    end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers comunes
-- ---------------------------------------------------------------------------
create or replace function mkt_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Al crear un negocio: su creador queda como owner y se crea su perfil de marca.
create or replace function mkt_on_business_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into mkt_business_members (business_id, user_id, role)
    values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  end if;
  insert into mkt_brand_profiles (business_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

-- El navegador no puede marcar una cuenta como "connected": eso solo lo hace
-- el servidor (service_role) después de validar un token oficial.
create or replace function mkt_guard_social_status()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.connection_status in ('connected', 'expired', 'error')
       and (tg_op = 'INSERT' or new.connection_status is distinct from old.connection_status) then
      raise exception 'El estado de conexión "%" solo lo puede fijar el servidor tras validar la integración oficial.', new.connection_status
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' or new.external_id is distinct from old.external_id
       or new.token_expires_at is distinct from old.token_expires_at then
      if tg_op = 'INSERT' then
        new.external_id := null;
        new.token_expires_at := null;
      else
        new.external_id := old.external_id;
        new.token_expires_at := old.token_expires_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- El navegador no puede marcar contenido como publicado: eso solo ocurre
-- cuando el servidor recibe la confirmación de la plataforma.
create or replace function mkt_guard_content_status()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception 'Una publicación solo se marca como publicada cuando la plataforma lo confirma.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.published_at := null;
    else
      new.external_post_id := old.external_post_id;
      new.published_at := old.published_at;
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['mkt_businesses','mkt_brand_profiles','mkt_offerings','mkt_promotions',
                           'mkt_social_accounts','mkt_campaigns','mkt_content_items']
  loop
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format('create trigger %I_touch before update on %I for each row execute function mkt_touch_updated_at()', t, t);
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function mkt_audit()', t, t);
  end loop;
end $$;

drop trigger if exists mkt_businesses_created on mkt_businesses;
create trigger mkt_businesses_created after insert on mkt_businesses
  for each row execute function mkt_on_business_created();

drop trigger if exists mkt_social_accounts_guard on mkt_social_accounts;
create trigger mkt_social_accounts_guard before insert or update on mkt_social_accounts
  for each row execute function mkt_guard_social_status();

drop trigger if exists mkt_content_items_guard on mkt_content_items;
create trigger mkt_content_items_guard before insert or update on mkt_content_items
  for each row execute function mkt_guard_content_status();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table mkt_admins enable row level security;
alter table mkt_businesses enable row level security;
alter table mkt_business_members enable row level security;
alter table mkt_brand_profiles enable row level security;
alter table mkt_offerings enable row level security;
alter table mkt_promotions enable row level security;
alter table mkt_social_accounts enable row level security;
alter table mkt_campaigns enable row level security;
alter table mkt_content_items enable row level security;
alter table mkt_audit_log enable row level security;

-- mkt_admins: cada quien solo puede ver si él mismo es admin. Sin escrituras
-- desde el navegador (se gestiona con service_role / SQL Editor).
drop policy if exists mkt_admins_self_read on mkt_admins;
create policy mkt_admins_self_read on mkt_admins for select to authenticated
  using (user_id = auth.uid());

-- Negocios
drop policy if exists mkt_businesses_read on mkt_businesses;
create policy mkt_businesses_read on mkt_businesses for select to authenticated
  using (mkt_can_read(id));
drop policy if exists mkt_businesses_insert on mkt_businesses;
create policy mkt_businesses_insert on mkt_businesses for insert to authenticated
  with check (mkt_is_admin() and created_by = auth.uid());
drop policy if exists mkt_businesses_update on mkt_businesses;
create policy mkt_businesses_update on mkt_businesses for update to authenticated
  using (mkt_can_write(id)) with check (mkt_can_write(id));
drop policy if exists mkt_businesses_delete on mkt_businesses;
create policy mkt_businesses_delete on mkt_businesses for delete to authenticated
  using (mkt_is_owner(id));

-- Membresía: se lee la propia y la de negocios propios; solo owners gestionan.
drop policy if exists mkt_members_read on mkt_business_members;
create policy mkt_members_read on mkt_business_members for select to authenticated
  using (user_id = auth.uid() or mkt_is_owner(business_id));
drop policy if exists mkt_members_write on mkt_business_members;
create policy mkt_members_write on mkt_business_members for all to authenticated
  using (mkt_is_owner(business_id)) with check (mkt_is_owner(business_id));

-- Tablas hijas: misma regla para todas.
do $$
declare t text;
begin
  foreach t in array array['mkt_brand_profiles','mkt_offerings','mkt_promotions',
                           'mkt_social_accounts','mkt_campaigns','mkt_content_items']
  loop
    execute format('drop policy if exists %I_read on %I', t, t);
    execute format('create policy %I_read on %I for select to authenticated using (mkt_can_read(business_id))', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('create policy %I_insert on %I for insert to authenticated with check (mkt_can_write(business_id))', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('create policy %I_update on %I for update to authenticated using (mkt_can_write(business_id)) with check (mkt_can_write(business_id))', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format('create policy %I_delete on %I for delete to authenticated using (mkt_can_write(business_id))', t, t);
  end loop;
end $$;

-- Auditoría: solo lectura para miembros; nadie escribe desde el navegador.
drop policy if exists mkt_audit_read on mkt_audit_log;
create policy mkt_audit_read on mkt_audit_log for select to authenticated
  using (business_id is not null and mkt_can_read(business_id));

-- ---------------------------------------------------------------------------
-- Privilegios: anon no tiene acceso a nada de Marketing AI Studio.
-- ---------------------------------------------------------------------------
revoke all on mkt_admins, mkt_businesses, mkt_business_members, mkt_brand_profiles, mkt_offerings,
  mkt_promotions, mkt_social_accounts, mkt_campaigns, mkt_content_items, mkt_audit_log from anon;
grant select on mkt_admins, mkt_audit_log to authenticated;
grant select, insert, update, delete on mkt_businesses, mkt_business_members, mkt_brand_profiles,
  mkt_offerings, mkt_promotions, mkt_social_accounts, mkt_campaigns, mkt_content_items to authenticated;
revoke insert, update, delete on mkt_audit_log from authenticated;

revoke execute on function mkt_is_admin(), mkt_can_read(uuid), mkt_can_write(uuid), mkt_is_owner(uuid) from anon, public;
grant execute on function mkt_is_admin(), mkt_can_read(uuid), mkt_can_write(uuid), mkt_is_owner(uuid) to authenticated;
