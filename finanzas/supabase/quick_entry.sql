-- Atajos del iPhone: anotar Barbería, Uñas o un gasto sin abrir la app.
-- Aplicado en el proyecto como la migración "quick_entry_shortcuts".
-- La función de Edge "anotar" (supabase/functions/anotar) recibe
-- t (llave), tipo (barberia | unas | gasto), concepto y cantidad, y llama a
-- public.quick_entry con la llave de servicio. Solo se guarda el hash de cada llave.
--
-- Revocar una llave:  delete from public.quick_tokens where label = 'Ofelia';
-- Nueva llave:        insertar encode(digest(<llave>, 'sha256'), 'hex') con su user_id.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.quick_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  created_at timestamptz not null default now()
);
alter table public.quick_tokens enable row level security;
revoke all on public.quick_tokens from anon, authenticated;

create or replace function public.quick_entry(p_token text, p_tipo text, p_concepto text, p_cantidad numeric)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid;
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_amount numeric := round(coalesce(p_cantidad, 0), 2);
  v_concept text := left(trim(coalesce(p_concepto, '')), 80);
  v_before numeric;
  v_after numeric;
  v_type text;
  v_category text;
  v_business text;
  v_note text := '';
  v_today date := (now() at time zone 'America/Tijuana')::date;
begin
  select user_id into v_user from public.quick_tokens
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_user is null then
    raise exception 'Llave no válida' using errcode = '28000';
  end if;
  if not exists (select 1 from public.profiles where id = v_user and is_test is not true) then
    raise exception 'Cuenta no autorizada' using errcode = '28000';
  end if;
  if v_amount <= 0 or v_amount > 100000000 then
    raise exception 'Escribe una cantidad mayor a cero' using errcode = '22023';
  end if;

  if v_tipo in ('barberia', 'barbería') then
    v_type := 'income'; v_business := 'barberia'; v_category := 'cortes'; v_concept := 'Entrada Barbería';
  elsif v_tipo in ('unas', 'uñas') then
    v_type := 'income'; v_business := 'unas'; v_category := 'servicios-unas'; v_concept := 'Entrada Uñas';
  elsif v_tipo = 'gasto' then
    v_type := 'expense'; v_business := null; v_category := 'otros';
    if v_concept = '' then
      raise exception 'Escribe el nombre del gasto' using errcode = '22023';
    end if;
  else
    raise exception 'Tipo no válido' using errcode = '22023';
  end if;

  if v_type = 'income' then
    v_note := 'Tu parte ' || to_char(round(v_amount / 2, 2), 'FM$999,999,990.00')
           || ' · Tu socia ' || to_char(v_amount - round(v_amount / 2, 2), 'FM$999,999,990.00');
  end if;

  select coalesce((select (value #>> '{}')::numeric from public.meta where key = 'initialBalance'), 0)
       + coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_before from public.movements;
  v_after := case when v_type = 'income' then v_before + v_amount else v_before - v_amount end;

  insert into public.movements (id, type, concept, category, kind, amount, date, status, note,
                                partial, balance_before, balance_after, business_id, created_by)
  values ('mv_' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12), v_type, v_concept, v_category,
          v_type, v_amount, v_today, 'done', v_note, false, v_before, v_after, v_business, v_user);

  return 'Guardado: ' || v_concept || ' ' || to_char(v_amount, 'FM$999,999,990.00')
      || '. Disponible: ' || to_char(v_after, 'FM$999,999,990.00');
end;
$$;

revoke all on function public.quick_entry(text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.quick_entry(text, text, text, numeric) to service_role;
