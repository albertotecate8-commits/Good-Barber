-- Marketing AI Studio — enlace real de cada publicación y distribución a grupos.
--
-- Meta retiró la API de grupos el 22-abr-2024 (publish_to_groups,
-- groups_access_member_info). Por eso la distribución a grupos es ASISTIDA: la
-- app prepara cada destino y abre el diálogo oficial de Facebook; la persona
-- elige el grupo y confirma. Nada se marca «confirmado» sin su confirmación.
--
--   * mkt_fb_groups: grupos registrados por negocio (sin mezclar negocios).
--   * mkt_distributions: una distribución por publicación (cola de grupos).
--   * mkt_distribution_tasks: una tarea por grupo. Un grupo no se repite para
--     la misma publicación (índice único).
--
-- Idempotente. Reversible con supabase/rollbacks/20261023000000_mkt_group_distribution.down.sql

-- Enlace permanente de la publicación (permalink_url de Meta) y grupos planeados.
alter table mkt_content_items
  add column if not exists external_post_url text,
  add column if not exists planned_group_ids uuid[] not null default '{}';
do $$ begin
  alter table mkt_content_items add constraint mkt_content_external_url check (external_post_url is null or external_post_url ~ '^https://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_content_items add constraint mkt_content_planned_groups_max check (cardinality(planned_group_ids) <= 50);
exception when duplicate_object then null; end $$;

-- El enlace del post lo guarda SOLO el servidor tras publicar (como external_post_id):
-- nadie puede «fabricar» un enlace confirmado por Meta desde la app.
create or replace function mkt_guard_content_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception 'Una publicación solo se marca como publicada cuando la plataforma lo confirma.'
        using errcode = '42501';
    end if;
    if new.status = 'error' and (tg_op = 'INSERT' or old.status is distinct from 'error') then
      raise exception 'El estado de error lo asigna el servidor al fallar una publicación.'
        using errcode = '42501';
    end if;
    if new.publish_mode = 'api' and (tg_op = 'INSERT' or old.publish_mode is distinct from 'api') then
      raise exception 'La publicación automática solo se activa al aprobarla el dueño del negocio desde la app.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.external_post_url := null;
      new.published_at := null;
      new.last_error := null;
      new.approved_by := null;
      new.approved_at := null;
      new.publish_lock_at := null;
      new.publish_attempts := 0;
    else
      new.external_post_id := old.external_post_id;
      new.external_post_url := old.external_post_url;
      new.published_at := old.published_at;
      new.last_error := old.last_error;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.publish_lock_at := old.publish_lock_at;
      new.publish_attempts := old.publish_attempts;
      -- Cualquier cambio a una publicación aprobada revoca la aprobación.
      if old.publish_mode = 'api' and (
           new.caption is distinct from old.caption or new.hashtags is distinct from old.hashtags
           or new.asset_id is distinct from old.asset_id or new.platform is distinct from old.platform
           or new.format is distinct from old.format or new.scheduled_at is distinct from old.scheduled_at
           or new.status is distinct from old.status or new.title is distinct from old.title) then
        new.publish_mode := 'manual';
        new.approved_by := null;
        new.approved_at := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create table if not exists mkt_fb_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 160),
  url text not null check (url ~ '^https://(www\.|m\.|web\.)?facebook\.com/groups/[A-Za-z0-9._-]+/?$'),
  posting_mode text not null default 'share_page_post'
    check (posting_mode in ('share_page_post', 'new_post_as_page', 'new_post_as_profile')),
  page_can_participate text not null default 'unknown' check (page_can_participate in ('unknown', 'yes', 'no')),
  page_checked_at timestamptz,
  requires_approval boolean not null default false,
  rules text not null default '' check (length(rules) <= 2000),
  min_days_between integer not null default 7 check (min_days_between between 1 and 90),
  active boolean not null default true,
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, url)
);
create index if not exists mkt_fb_groups_business_idx on mkt_fb_groups (business_id, active);

create table if not exists mkt_distributions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  content_id uuid not null references mkt_content_items (id) on delete cascade,
  source_url text not null check (source_url ~ '^https://'),
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'completed')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_distributions_business_idx on mkt_distributions (business_id, created_at desc);
create index if not exists mkt_distributions_content_idx on mkt_distributions (content_id);

create table if not exists mkt_distribution_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  distribution_id uuid not null references mkt_distributions (id) on delete cascade,
  content_id uuid not null references mkt_content_items (id) on delete cascade,
  group_id uuid not null references mkt_fb_groups (id) on delete cascade,
  position integer not null default 0 check (position between 0 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'awaiting_approval', 'confirmed', 'skipped', 'failed', 'cancelled')),
  post_text text not null default '' check (length(post_text) <= 5000),
  opened_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null,
  group_post_url text check (group_post_url is null or group_post_url ~ '^https://(www\.|m\.|web\.)?facebook\.com/'),
  note text not null default '' check (length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un grupo nunca se repite para la misma publicación.
  unique (content_id, group_id)
);
create index if not exists mkt_distribution_tasks_dist_idx on mkt_distribution_tasks (distribution_id, position);
create index if not exists mkt_distribution_tasks_group_idx on mkt_distribution_tasks (group_id, confirmed_at desc);

create or replace function mkt_guard_distribution()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'mkt_distributions' then
    if not exists (select 1 from mkt_content_items where id = new.content_id and business_id = new.business_id) then
      raise exception 'La publicación pertenece a otro negocio.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.business_id is distinct from old.business_id or new.content_id is distinct from old.content_id) then
      raise exception 'Una distribución no cambia de negocio ni de publicación.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_distribution_tasks' then
    if not exists (select 1 from mkt_distributions d where d.id = new.distribution_id and d.business_id = new.business_id and d.content_id = new.content_id) then
      raise exception 'La tarea no corresponde a la distribución.' using errcode = '42501';
    end if;
    if not exists (select 1 from mkt_fb_groups g where g.id = new.group_id and g.business_id = new.business_id) then
      raise exception 'El grupo pertenece a otro negocio.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.business_id is distinct from old.business_id or new.group_id is distinct from old.group_id
                             or new.distribution_id is distinct from old.distribution_id or new.content_id is distinct from old.content_id) then
      raise exception 'Una tarea no cambia de grupo ni de distribución.' using errcode = '42501';
    end if;
    -- La confirmación queda a nombre de quien la hace, con su fecha (no se puede falsear).
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      new.confirmed_by := auth.uid();
      new.confirmed_at := now();
    elsif new.status <> 'confirmed' then
      new.confirmed_by := null;
      new.confirmed_at := null;
    else
      new.confirmed_by := old.confirmed_by;
      new.confirmed_at := old.confirmed_at;
    end if;
    if new.status = 'opened' and new.opened_at is null then
      new.opened_at := now();
    end if;
  elsif tg_table_name = 'mkt_fb_groups' then
    if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
      raise exception 'Un grupo no se puede mover a otro negocio.' using errcode = '42501';
    end if;
    if new.page_can_participate is distinct from coalesce(old.page_can_participate, 'unknown') then
      new.page_checked_at := case when new.page_can_participate = 'unknown' then null else now() end;
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger mkt_fb_groups_guard before insert or update on mkt_fb_groups
  for each row execute function mkt_guard_distribution();
create or replace trigger mkt_distributions_guard before insert or update on mkt_distributions
  for each row execute function mkt_guard_distribution();
create or replace trigger mkt_distribution_tasks_guard before insert or update on mkt_distribution_tasks
  for each row execute function mkt_guard_distribution();

do $$
declare t text;
begin
  foreach t in array array['mkt_fb_groups', 'mkt_distributions', 'mkt_distribution_tasks'] loop
    execute format('create or replace trigger %I_touch before update on %I for each row execute function mkt_touch_updated_at()', t, t);
    execute format('create or replace trigger %I_audit after insert or update or delete on %I for each row execute function mkt_audit()', t, t);
    execute format('alter table %I enable row level security', t);
    begin
      execute format('create policy %I_read on %I for select to authenticated using (mkt_can_read(business_id))', t, t);
      execute format('create policy %I_insert on %I for insert to authenticated with check (mkt_can_write(business_id))', t, t);
      execute format('create policy %I_update on %I for update to authenticated using (mkt_can_write(business_id)) with check (mkt_can_write(business_id))', t, t);
      execute format('create policy %I_delete on %I for delete to authenticated using (mkt_can_write(business_id))', t, t);
    exception when duplicate_object then null;
    end;
    execute format('revoke all on %I from anon', t);
    execute format('revoke truncate, references, trigger on %I from authenticated', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
revoke execute on function mkt_guard_distribution() from anon, public, authenticated;
