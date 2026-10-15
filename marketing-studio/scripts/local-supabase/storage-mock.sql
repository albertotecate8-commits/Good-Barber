-- MOCK mínimo del esquema "storage" de Supabase. SOLO para el stack local:
-- permite ejecutar la migración y probar las políticas RLS de storage.objects
-- con SQL. No hay servidor de Storage local: la app usa el almacenamiento de
-- desarrollo (MKT_STORAGE_BACKEND=local) para guardar archivos aquí.
-- En Supabase real este esquema ya existe y este archivo no se usa.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
