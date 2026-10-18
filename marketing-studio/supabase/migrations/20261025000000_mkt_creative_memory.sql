-- Marketing AI Studio — chat creativo, estilos de referencia y memoria por negocio.
--
--   * mkt_styles: estilos con nombre creados desde imágenes de referencia (o a
--     mano). Sus atributos se dividen en «medido» (análisis real de píxeles) e
--     «interpretado» (lo que la persona o un análisis asistido describió).
--   * mkt_memory: lo que el estudio recuerda de cada negocio (preferencias,
--     correcciones, datos, restricciones, conclusiones de investigación). Solo
--     se guarda cuando la persona lo pide; se edita, desactiva o borra.
--   * mkt_creative_threads / mkt_creative_messages: conversaciones del chat
--     creativo. Cada conversación tiene un proyecto creativo; las propuestas e
--     imágenes son versiones de ese proyecto (mkt_creative_versions).
--
-- Todo queda aislado por negocio: los guardas rechazan cualquier vínculo con
-- archivos, estilos, hallazgos o versiones de otro negocio (precios, logotipos
-- y promociones nunca pasan de una marca a otra).
--
-- Idempotente y sin borrar datos. Reversible con
-- supabase/rollbacks/20261025000000_mkt_creative_memory.down.sql

create table if not exists mkt_styles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 1000),
  -- { measured: {...}, interpreted: {...} } — lo valida la app.
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object' and pg_column_size(attributes) <= 40000),
  reference_asset_ids uuid[] not null default '{}' check (cardinality(reference_asset_ids) <= 8),
  source text not null default 'manual' check (source in ('reference_image', 'manual', 'research', 'approved_design')),
  source_finding_id uuid references mkt_research_findings (id) on delete set null,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists mkt_styles_business_name_idx on mkt_styles (business_id, lower(btrim(name)));
create index if not exists mkt_styles_business_idx on mkt_styles (business_id, updated_at desc);

create table if not exists mkt_memory (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  kind text not null check (kind in ('preference', 'correction', 'fact', 'restriction', 'audience', 'research_insight')),
  text text not null check (length(btrim(text)) between 3 and 1000),
  source text not null default 'manual' check (source in ('chat', 'manual', 'research', 'approval')),
  -- Mensaje, hallazgo o versión de donde salió (informativo, sin llave foránea).
  source_ref uuid,
  source_url text check (source_url is null or (source_url ~ '^https://' and length(source_url) <= 2000)),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_memory_business_idx on mkt_memory (business_id, active, created_at desc);

create table if not exists mkt_creative_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  style_id uuid references mkt_styles (id) on delete set null,
  project_id uuid references mkt_creative_projects (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_creative_threads_business_idx on mkt_creative_threads (business_id, updated_at desc);

create table if not exists mkt_creative_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  thread_id uuid not null references mkt_creative_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '' check (length(content) <= 8000),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 100000),
  asset_ids uuid[] not null default '{}' check (cardinality(asset_ids) <= 10),
  version_id uuid references mkt_creative_versions (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists mkt_creative_messages_thread_idx on mkt_creative_messages (thread_id, created_at);

-- Cada versión (propuesta o imagen) recuerda el estilo con que se creó, y cada
-- publicación la versión aprobada de la que salió.
alter table mkt_creative_versions add column if not exists style_id uuid references mkt_styles (id) on delete set null;
alter table mkt_content_items add column if not exists creative_version_id uuid references mkt_creative_versions (id) on delete set null;
-- Una versión aprobada genera como máximo una publicación por red: reintentar
-- reutiliza la misma fila (nunca duplica el post).
create unique index if not exists mkt_content_items_creative_version_idx on mkt_content_items (creative_version_id, platform) where creative_version_id is not null;

create or replace function mkt_guard_creative_memory()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.business_id is distinct from old.business_id then
    raise exception 'Un registro no se puede mover a otro negocio.' using errcode = '42501';
  end if;
  if tg_table_name = 'mkt_styles' then
    if exists (
      select 1 from unnest(new.reference_asset_ids) r(id)
      where not exists (select 1 from mkt_assets a where a.id = r.id and a.business_id = new.business_id)) then
      raise exception 'Las referencias deben ser archivos del mismo negocio.' using errcode = '42501';
    end if;
    if new.source_finding_id is not null and not exists (
      select 1 from mkt_research_findings where id = new.source_finding_id and business_id = new.business_id) then
      raise exception 'El hallazgo pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_creative_threads' then
    if new.style_id is not null and not exists (select 1 from mkt_styles where id = new.style_id and business_id = new.business_id) then
      raise exception 'El estilo pertenece a otro negocio.' using errcode = '42501';
    end if;
    if new.project_id is not null and not exists (
      select 1 from mkt_creative_projects where id = new.project_id and business_id = new.business_id) then
      raise exception 'El proyecto pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_creative_messages' then
    if not exists (select 1 from mkt_creative_threads where id = new.thread_id and business_id = new.business_id) then
      raise exception 'La conversación pertenece a otro negocio.' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.thread_id is distinct from old.thread_id or new.role is distinct from old.role) then
      raise exception 'Un mensaje no cambia de conversación ni de autor.' using errcode = '42501';
    end if;
    if exists (
      select 1 from unnest(new.asset_ids) r(id)
      where not exists (select 1 from mkt_assets a where a.id = r.id and a.business_id = new.business_id)) then
      raise exception 'Los archivos deben ser del mismo negocio.' using errcode = '42501';
    end if;
    if new.version_id is not null and not exists (
      select 1 from mkt_creative_versions where id = new.version_id and business_id = new.business_id) then
      raise exception 'La versión pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_creative_versions' then
    if new.style_id is not null and not exists (select 1 from mkt_styles where id = new.style_id and business_id = new.business_id) then
      raise exception 'El estilo pertenece a otro negocio.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'mkt_content_items' then
    if new.creative_version_id is not null and not exists (
      select 1 from mkt_creative_versions where id = new.creative_version_id and business_id = new.business_id) then
      raise exception 'La versión pertenece a otro negocio.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace trigger mkt_styles_guard before insert or update on mkt_styles
  for each row execute function mkt_guard_creative_memory();
create or replace trigger mkt_memory_guard before insert or update on mkt_memory
  for each row execute function mkt_guard_creative_memory();
create or replace trigger mkt_creative_threads_guard before insert or update on mkt_creative_threads
  for each row execute function mkt_guard_creative_memory();
create or replace trigger mkt_creative_messages_guard before insert or update on mkt_creative_messages
  for each row execute function mkt_guard_creative_memory();
create or replace trigger mkt_creative_versions_style_guard before insert or update of style_id on mkt_creative_versions
  for each row execute function mkt_guard_creative_memory();
create or replace trigger mkt_content_items_creative_guard before insert or update of creative_version_id on mkt_content_items
  for each row execute function mkt_guard_creative_memory();

do $$
declare t text;
begin
  foreach t in array array['mkt_styles', 'mkt_memory', 'mkt_creative_threads', 'mkt_creative_messages'] loop
    if t <> 'mkt_creative_messages' then
      execute format('create or replace trigger %I_touch before update on %I for each row execute function mkt_touch_updated_at()', t, t);
    end if;
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
revoke execute on function mkt_guard_creative_memory() from anon, public, authenticated;
