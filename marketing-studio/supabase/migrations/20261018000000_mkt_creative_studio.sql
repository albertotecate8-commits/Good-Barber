-- Marketing AI Studio — Estudio creativo (proyectos, versiones, revisión y video).
-- Reversible con supabase/rollbacks/20261018000000_mkt_creative_studio.down.sql
-- Idempotente.

-- ---------------------------------------------------------------------------
-- 1. Biblioteca: audio (música con licencia), dimensiones reales y licencia
-- ---------------------------------------------------------------------------
alter table mkt_assets
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists license_note text not null default '';

do $$ begin
  alter table mkt_assets add constraint mkt_assets_dimensions check (
    (width is null or width between 1 and 20000) and (height is null or height between 1 and 20000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_assets add constraint mkt_assets_license_len check (length(license_note) <= 1000);
exception when duplicate_object then null; end $$;

-- El tipo «audio» se agrega a los tipos de recurso.
alter table mkt_assets drop constraint if exists mkt_assets_kind_check;
alter table mkt_assets add constraint mkt_assets_kind_check
  check (kind in ('image', 'video', 'logo', 'document', 'audio', 'other'));

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
      set allowed_mime_types = (
        select array_agg(distinct m) from unnest(coalesce(allowed_mime_types, '{}') ||
          array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/ogg']) as m)
      where id = 'mkt-assets';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Proyectos creativos
-- ---------------------------------------------------------------------------
create table if not exists mkt_creative_projects (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  campaign_id uuid references mkt_campaigns (id) on delete set null,
  title text not null check (length(btrim(title)) between 2 and 160),
  material_type text not null check (material_type in ('ad', 'flyer', 'product_photo', 'story', 'cover', 'reel', 'video')),
  format_key text not null check (format_key ~ '^[a-z0-9_]{2,40}$'),
  width integer not null check (width between 100 and 8000),
  height integer not null check (height between 100 and 8000),
  instruction text not null default '' check (length(instruction) <= 2000),
  reference_asset_ids uuid[] not null default '{}' check (cardinality(reference_asset_ids) <= 12),
  -- Plan de video (escenas, textos, música con licencia, CTA). Lo valida la app.
  video_plan jsonb not null default '{}'::jsonb check (jsonb_typeof(video_plan) = 'object' and pg_column_size(video_plan) <= 100000),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'archived')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_creative_projects_business_idx on mkt_creative_projects (business_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- 3. Versiones (conceptos, prompts, resultados importados, ediciones, videos)
-- ---------------------------------------------------------------------------
create table if not exists mkt_creative_versions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  project_id uuid not null references mkt_creative_projects (id) on delete cascade,
  version_no integer not null check (version_no between 1 and 10000),
  -- concept: idea + prompts (no hay imagen). imported_result: archivo traído de
  -- ChatGPT/Gemini/Flow. code_edit: diseño hecho con el editor (código, no IA).
  -- video_render: montaje con FFmpeg de material existente.
  kind text not null check (kind in ('concept', 'imported_result', 'code_edit', 'video_render')),
  title text not null default '' check (length(title) <= 200),
  concept jsonb not null default '{}'::jsonb check (jsonb_typeof(concept) = 'object' and pg_column_size(concept) <= 60000),
  design jsonb not null default '{}'::jsonb check (jsonb_typeof(design) = 'object' and pg_column_size(design) <= 60000),
  asset_id uuid references mkt_assets (id) on delete set null,
  parent_version_id uuid references mkt_creative_versions (id) on delete set null,
  tool text not null default '' check (length(tool) <= 60),
  format_key text not null default '' check (length(format_key) <= 40),
  qa jsonb not null default '[]'::jsonb check (jsonb_typeof(qa) = 'array'),
  qa_status text not null default 'pending' check (qa_status in ('pending', 'passed', 'passed_with_warnings', 'failed')),
  qa_reviewed_at timestamptz,
  is_final boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (project_id, version_no),
  -- Un material definitivo exige archivo y revisión aprobada.
  constraint mkt_creative_final_requires_qa check (
    not is_final or (asset_id is not null and qa_status in ('passed', 'passed_with_warnings')))
);
create index if not exists mkt_creative_versions_project_idx on mkt_creative_versions (project_id, version_no desc);

-- ---------------------------------------------------------------------------
-- 4. Coherencia entre negocios
-- ---------------------------------------------------------------------------
create or replace function mkt_guard_creative_links()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'mkt_creative_projects' then
    if new.campaign_id is not null and not exists (
      select 1 from mkt_campaigns where id = new.campaign_id and business_id = new.business_id) then
      raise exception 'La campaña pertenece a otro negocio.' using errcode = '42501';
    end if;
    if exists (
      select 1 from unnest(new.reference_asset_ids) r(id)
      where not exists (select 1 from mkt_assets a where a.id = r.id and a.business_id = new.business_id)) then
      raise exception 'Las referencias deben ser archivos del mismo negocio.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
      raise exception 'Un proyecto no se puede mover a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_creative_versions' then
    if not exists (select 1 from mkt_creative_projects where id = new.project_id and business_id = new.business_id) then
      raise exception 'El proyecto pertenece a otro negocio.' using errcode = '42501';
    end if;
    if new.asset_id is not null and not exists (
      select 1 from mkt_assets where id = new.asset_id and business_id = new.business_id) then
      raise exception 'El archivo pertenece a otro negocio.' using errcode = '42501';
    end if;
    if new.parent_version_id is not null and not exists (
      select 1 from mkt_creative_versions where id = new.parent_version_id and project_id = new.project_id) then
      raise exception 'La versión de origen pertenece a otro proyecto.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mkt_creative_projects_links on mkt_creative_projects;
create trigger mkt_creative_projects_links before insert or update on mkt_creative_projects
  for each row execute function mkt_guard_creative_links();
drop trigger if exists mkt_creative_versions_links on mkt_creative_versions;
create trigger mkt_creative_versions_links before insert or update on mkt_creative_versions
  for each row execute function mkt_guard_creative_links();

drop trigger if exists mkt_creative_projects_touch on mkt_creative_projects;
create trigger mkt_creative_projects_touch before update on mkt_creative_projects
  for each row execute function mkt_touch_updated_at();
do $$
declare t text;
begin
  foreach t in array array['mkt_creative_projects', 'mkt_creative_versions'] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function mkt_audit()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mkt_creative_projects', 'mkt_creative_versions'] loop
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
