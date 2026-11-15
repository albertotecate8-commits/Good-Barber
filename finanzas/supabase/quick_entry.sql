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
  v_week_start date;
  v_week_total numeric;
  v_local numeric;
  v_split numeric;
  v_partner text;
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


  select coalesce((select (value #>> '{}')::numeric from public.meta where key = 'initialBalance'), 0)
       + coalesce(sum(case when type = 'income' then amount else -amount end), 0)
    into v_before from public.movements
   where not (type = 'income' and coalesce(business_id, '') in ('barberia', 'unas'))
     and not (type = 'expense' and category = 'local');
  -- Barbería y Uñas son dinero para gastar entre los dos, y los pagos del local
  -- salen del fondo del local: ninguno mueve el disponible.
  v_after := case when v_type = 'expense' then v_before - v_amount
                  when v_business in ('barberia', 'unas') then v_before
                  else v_before + v_amount end;

  insert into public.movements (id, type, concept, category, kind, amount, date, status, note,
                                partial, balance_before, balance_after, business_id, created_by)
  values ('mv_' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12), v_type, v_concept, v_category,
          v_type, v_amount, v_today, 'done', v_note, false, v_before, v_after, v_business, v_user);

  if v_business in ('barberia', 'unas') then
    -- Aparte del Afore: semana sábado→viernes, se descuenta el local ($1,100)
    -- y lo que queda se reparte entre los dos.
    v_week_start := v_today - ((extract(dow from v_today)::int + 1) % 7);
    select coalesce(sum(amount), 0) into v_week_total from public.movements
     where type = 'income' and business_id in ('barberia', 'unas')
       and date between v_week_start and v_week_start + 6;
    v_local := least(v_week_total, 1100);
    v_split := v_week_total - v_local;
    select initcap(name) into v_partner from public.profiles
     where id <> v_user and is_test is not true and name <> '' limit 1;
    return 'Guardado: ' || v_concept || ' ' || to_char(v_amount, 'FM$999,999,990.00')
        || '. Semana: entradas ' || to_char(v_week_total, 'FM$999,999,990.00')
        || ', local -' || to_char(v_local, 'FM$999,999,990.00')
        || '. Tú ' || to_char(round(v_split / 2, 2), 'FM$999,999,990.00')
        || ' · ' || coalesce(v_partner, 'Socia') || ' ' || to_char(v_split - round(v_split / 2, 2), 'FM$999,999,990.00');
  end if;

  return 'Guardado: ' || v_concept || ' ' || to_char(v_amount, 'FM$999,999,990.00')
      || '. Disponible: ' || to_char(v_after, 'FM$999,999,990.00');
end;
$$;

revoke all on function public.quick_entry(text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.quick_entry(text, text, text, numeric) to service_role;
