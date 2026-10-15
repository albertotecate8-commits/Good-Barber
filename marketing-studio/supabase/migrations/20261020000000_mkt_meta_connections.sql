-- Marketing AI Studio — conexión oficial con Meta (Facebook Login).
--
-- Dos tablas SOLO del servidor: el navegador (anon/authenticated) no puede
-- leerlas ni escribirlas. Las usa el servidor con la service_role tras validar
-- la autorización real del usuario en Facebook:
--   * mkt_meta_oauth_sessions: token de usuario cifrado, válido 20 minutos,
--     mientras eliges qué página EXISTENTE vincular.
--   * mkt_social_tokens: token de página cifrado (AES-256-GCM con MKT_TOKEN_KEY,
--     que vive solo en el hosting; la base nunca ve el token en claro).
-- Nunca se guardan contraseñas. La app no crea páginas ni cambia propietarios.
--
-- Idempotente. Reversible con supabase/rollbacks/20261020000000_mkt_meta_connections.down.sql

create table if not exists mkt_meta_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  token_ciphertext text not null check (length(token_ciphertext) between 20 and 4000),
  granted_scopes text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists mkt_meta_oauth_sessions_user_idx on mkt_meta_oauth_sessions (user_id);
create index if not exists mkt_meta_oauth_sessions_business_idx on mkt_meta_oauth_sessions (business_id);

create table if not exists mkt_social_tokens (
  social_account_id uuid primary key references mkt_social_accounts (id) on delete cascade,
  business_id uuid not null references mkt_businesses (id) on delete cascade,
  provider text not null default 'meta' check (provider in ('meta')),
  token_ciphertext text not null check (length(token_ciphertext) between 20 and 4000),
  scopes text[] not null default '{}',
  page_tasks text[] not null default '{}',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mkt_social_tokens_business_idx on mkt_social_tokens (business_id);

create or replace trigger mkt_social_tokens_touch before update on mkt_social_tokens
  for each row execute function mkt_touch_updated_at();

alter table mkt_meta_oauth_sessions enable row level security;
alter table mkt_social_tokens enable row level security;
-- Sin políticas: con RLS activo y sin privilegios, solo service_role accede.
revoke all on mkt_meta_oauth_sessions, mkt_social_tokens from anon, authenticated;
