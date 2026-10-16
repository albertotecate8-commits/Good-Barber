-- Marketing AI Studio — alta del administrador sin manejar su contraseña.
--
-- Se registra el correo autorizado en mkt_admin_invites. Cuando esa persona
-- crea su propia cuenta (Supabase → Authentication → Add user, escribiendo ella
-- su contraseña) y el correo queda CONFIRMADO, la base la agrega a mkt_admins.
--
--   * Solo correos confirmados: un registro público con ese correo sin
--     confirmarlo no obtiene permisos.
--   * Cada invitación se usa una vez y caduca.
--   * La tabla no tiene ningún privilegio para anon/authenticated.
--
-- Idempotente. Reversible con supabase/rollbacks/20261024000000_mkt_admin_invites.down.sql

create table if not exists mkt_admin_invites (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);
alter table mkt_admin_invites enable row level security;
revoke all on mkt_admin_invites from anon, authenticated;

create or replace function mkt_claim_admin_invite()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null and old.email is not distinct from new.email then
    return new;
  end if;
  update mkt_admin_invites
     set used_at = now(), used_by = new.id
   where email = lower(btrim(new.email)) and used_at is null and expires_at > now();
  if found then
    insert into mkt_admins (user_id) values (new.id) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function mkt_claim_admin_invite() from anon, public, authenticated;

create or replace trigger mkt_claim_admin_invite_on_insert after insert on auth.users
  for each row execute function mkt_claim_admin_invite();
create or replace trigger mkt_claim_admin_invite_on_confirm after update of email_confirmed_at, email on auth.users
  for each row execute function mkt_claim_admin_invite();
