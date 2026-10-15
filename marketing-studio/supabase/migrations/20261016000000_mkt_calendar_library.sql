-- Marketing AI Studio — Calendario de contenido + Biblioteca de recursos.
-- Reversible con supabase/rollbacks/20261016000000_mkt_calendar_library.down.sql
-- Idempotente: se puede volver a ejecutar sin perder datos.

-- ---------------------------------------------------------------------------
-- 1. Estado "pending" pasa a llamarse "review" («En revisión»)
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'mkt_content_status' and e.enumlabel = 'pending'
  ) then
    alter type mkt_content_status rename value 'pending' to 'review';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Biblioteca de recursos
-- ---------------------------------------------------------------------------
-- Los archivos viven en Supabase Storage (bucket privado "mkt-assets") o, solo
-- en desarrollo, en el disco del servidor local ("local_dev"). La ruta siempre
-- empieza con el id del negocio: es la frontera de aislamiento en Storage.
create table if not exists mkt_assets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'logo', 'document', 'other')),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  asset_date date,
  storage_backend text not null check (storage_backend in ('supabase', 'local_dev')),
  storage_path text not null check (
    starts_with(storage_path, business_id::text || '/')
    and storage_path !~ '\.\.'
    and length(storage_path) <= 400
  ),
  original_name text not null check (length(original_name) between 1 and 255),
  mime_type text not null check (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  size_bytes bigint check (size_bytes is null or size_bytes between 1 and 52428800),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'ready')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_backend, storage_path)
);
create index if not exists mkt_assets_business_idx on mkt_assets (business_id, created_at desc);
create index if not exists mkt_assets_tags_idx on mkt_assets using gin (tags);

-- Una vez subido, el archivo no se puede "mover" a otro negocio ni cambiar de
-- ruta: eso rompería el aislamiento por carpeta en Storage.
create or replace function mkt_guard_asset()
returns trigger language plpgsql as $$
begin
  if new.business_id is distinct from old.business_id
     or new.storage_backend is distinct from old.storage_backend
     or new.storage_path is distinct from old.storage_path then
    raise exception 'No se puede cambiar el negocio ni la ubicación de un archivo ya registrado.'
      using errcode = '42501';
  end if;
  if old.upload_status = 'ready' and (
       new.upload_status <> 'ready'
       or new.mime_type is distinct from old.mime_type
       or new.size_bytes is distinct from old.size_bytes
       or new.original_name is distinct from old.original_name) then
    raise exception 'Los datos técnicos de un archivo ya subido no se pueden modificar.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists mkt_assets_guard on mkt_assets;
create trigger mkt_assets_guard before update on mkt_assets
  for each row execute function mkt_guard_asset();
drop trigger if exists mkt_assets_touch on mkt_assets;
create trigger mkt_assets_touch before update on mkt_assets
  for each row execute function mkt_touch_updated_at();
drop trigger if exists mkt_assets_audit on mkt_assets;
create trigger mkt_assets_audit after insert or update or delete on mkt_assets
  for each row execute function mkt_audit();

alter table mkt_assets enable row level security;
drop policy if exists mkt_assets_read on mkt_assets;
create policy mkt_assets_read on mkt_assets for select to authenticated using (mkt_can_read(business_id));
drop policy if exists mkt_assets_insert on mkt_assets;
create policy mkt_assets_insert on mkt_assets for insert to authenticated with check (mkt_can_write(business_id));
drop policy if exists mkt_assets_update on mkt_assets;
create policy mkt_assets_update on mkt_assets for update to authenticated
  using (mkt_can_write(business_id)) with check (mkt_can_write(business_id));
drop policy if exists mkt_assets_delete on mkt_assets;
create policy mkt_assets_delete on mkt_assets for delete to authenticated using (mkt_can_write(business_id));
revoke all on mkt_assets from anon;
grant select, insert, update, delete on mkt_assets to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Calendario: campos nuevos en las publicaciones
-- ---------------------------------------------------------------------------
alter table mkt_content_items
  add column if not exists hashtags text[] not null default '{}',
  add column if not exists asset_id uuid references mkt_assets (id) on delete set null,
  -- "manual": tú publicas en la red y la app solo organiza. "api": la publicará
  -- el servidor con una integración oficial (todavía no existe ninguna).
  add column if not exists publish_mode text not null default 'manual',
  -- Declaración del usuario de que publicó a mano. NO es una confirmación de
  -- la plataforma: el estado "published" sigue reservado al servidor.
  add column if not exists manual_posted_at timestamptz,
  add column if not exists manual_post_url text;

do $$ begin
  alter table mkt_content_items add constraint mkt_content_hashtags_max check (cardinality(hashtags) <= 30);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_content_items add constraint mkt_content_publish_mode check (publish_mode in ('manual', 'api'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_content_items add constraint mkt_content_manual_url check (manual_post_url is null or manual_post_url ~ '^https://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table mkt_content_items add constraint mkt_content_scheduled_needs_date
    check (status <> 'scheduled' or scheduled_at is not null);
exception when duplicate_object then null; end $$;
create index if not exists mkt_content_items_asset_idx on mkt_content_items (asset_id);

-- Guardián ampliado: además de "published", el navegador no puede fijar el
-- modo "api" (no hay integración) ni escribir errores de la plataforma.
create or replace function mkt_guard_content_status()
returns trigger language plpgsql as $$
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
      raise exception 'La publicación automática aún no está disponible: no hay integración oficial conectada.'
        using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      new.external_post_id := null;
      new.published_at := null;
      new.last_error := null;
    else
      new.external_post_id := old.external_post_id;
      new.published_at := old.published_at;
      new.last_error := old.last_error;
    end if;
  end if;
  return new;
end;
$$;

-- Un recurso o una campaña solo se pueden enlazar a publicaciones del MISMO
-- negocio (evita filtrar archivos de otro negocio por medio de un enlace).
create or replace function mkt_guard_content_links()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.asset_id is not null and not exists (
    select 1 from mkt_assets where id = new.asset_id and business_id = new.business_id
  ) then
    raise exception 'El recurso creativo pertenece a otro negocio o no existe.' using errcode = '42501';
  end if;
  if new.campaign_id is not null and not exists (
    select 1 from mkt_campaigns where id = new.campaign_id and business_id = new.business_id
  ) then
    raise exception 'La campaña pertenece a otro negocio o no existe.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists mkt_content_items_links on mkt_content_items;
create trigger mkt_content_items_links before insert or update on mkt_content_items
  for each row execute function mkt_guard_content_links();

-- ---------------------------------------------------------------------------
-- 4. Intentos de publicación (arquitectura para las APIs oficiales)
-- ---------------------------------------------------------------------------
-- Solo el servidor (service_role) escribe aquí cuando exista una integración.
create table if not exists mkt_publish_attempts (
  id bigint generated always as identity primary key,
  content_id uuid not null references mkt_content_items (id) on delete cascade,
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  platform mkt_social_platform not null,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('success', 'error', 'skipped')),
  external_post_id text,
  error text,
  response jsonb
);
create index if not exists mkt_publish_attempts_content_idx on mkt_publish_attempts (content_id, attempted_at desc);
alter table mkt_publish_attempts enable row level security;
drop policy if exists mkt_publish_attempts_read on mkt_publish_attempts;
create policy mkt_publish_attempts_read on mkt_publish_attempts for select to authenticated
  using (mkt_can_read(business_id));
revoke all on mkt_publish_attempts from anon, authenticated;
grant select on mkt_publish_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Supabase Storage: bucket privado y políticas por negocio
-- ---------------------------------------------------------------------------
-- Primer segmento de la ruta = id del negocio. Devuelve null si no es un uuid.
create or replace function mkt_storage_business(p_name text)
returns uuid language sql immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end;
$$;

-- Solo se puede subir un objeto si existe su registro "pendiente" en la
-- biblioteca y el usuario puede editar ese negocio: no hay subidas sueltas.
create or replace function mkt_storage_upload_allowed(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from mkt_assets
    where storage_backend = 'supabase'
      and storage_path = p_name
      and upload_status = 'pending'
      and mkt_can_write(business_id)
  );
$$;

revoke execute on function mkt_storage_upload_allowed(text) from anon, public;
grant execute on function mkt_storage_upload_allowed(text), mkt_storage_business(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Esquema storage no disponible: se omiten bucket y políticas de Storage.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'mkt-assets', 'mkt-assets', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml',
          'video/mp4', 'video/webm', 'video/quicktime',
          'application/pdf', 'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation']
  )
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists mkt_assets_storage_read on storage.objects;
  create policy mkt_assets_storage_read on storage.objects for select to authenticated
    using (bucket_id = 'mkt-assets' and mkt_can_read(mkt_storage_business(name)));

  drop policy if exists mkt_assets_storage_insert on storage.objects;
  create policy mkt_assets_storage_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'mkt-assets' and mkt_storage_upload_allowed(name));

  drop policy if exists mkt_assets_storage_delete on storage.objects;
  create policy mkt_assets_storage_delete on storage.objects for delete to authenticated
    using (bucket_id = 'mkt-assets' and mkt_can_write(mkt_storage_business(name)));
  -- Sin política de UPDATE: un archivo subido no se sobrescribe; se sube otro.
end $$;
