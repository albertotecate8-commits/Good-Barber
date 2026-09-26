-- =====================================================================
-- DULCE CONTROL — esquema inicial
--
-- Modelo mental (la regla más importante del sistema):
--
--   products.current_quantity  = lo que DEBERÍA haber en el estante:
--                                último conteo + compras confirmadas desde entonces.
--
--   Al guardar un conteo de sábado, por producto:
--     previous_quantity  = products.current_quantity   (referencia)
--     counted_quantity   = lo que contaste físicamente
--     units_sold         = max(previous - counted, 0)
--     sales_amount       = units_sold × unit_price
--     cost_amount        = units_sold × unit_cost
--     profit_amount      = units_sold × (unit_price − unit_cost)
--   y products.current_quantity pasa a ser counted_quantity.
--
--   Al confirmar una compra:
--     products.current_quantity = current_quantity + cantidad comprada
--
--   Ventas, compras e inventario son cosas distintas: las ventas sólo
--   existen como resultado de un conteo; las compras sólo suman inventario.
--
-- Las escrituras que mueven inventario pasan por funciones (RPC) atómicas;
-- el cliente no puede editar current_quantity directamente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  business_name text not null default 'Mi dulcería',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  emoji      text not null default '🍬',
  color      text not null default 'pink'
             check (color in ('pink', 'mango', 'mint', 'choco', 'grape', 'sky')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (id, owner_id)
);

create unique index categories_owner_name_uq on public.categories (owner_id, lower(btrim(name)));

-- ---------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id      uuid,
  name             text not null check (length(btrim(name)) between 1 and 80),
  emoji            text,
  cost_price       numeric(10, 2) not null check (cost_price >= 0),
  sale_price       numeric(10, 2) not null check (sale_price >= 0),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  min_quantity     integer not null default 0 check (min_quantity >= 0),
  is_active        boolean not null default true,
  -- Lista de compras: null = no está en la lista; número = cuántas comprar.
  shopping_qty     integer check (shopping_qty >= 0),
  shopping_checked boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (category_id, owner_id) references public.categories (id, owner_id)
    on delete set null (category_id)
);

create unique index products_owner_name_uq on public.products (owner_id, lower(btrim(name)));
create index products_owner_active_idx on public.products (owner_id, is_active);

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- product_cost_history (sólo se agrega; nunca se sobrescribe)
-- ---------------------------------------------------------------------
create table public.product_cost_history (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade,
  product_id     uuid not null,
  cost_price     numeric(10, 2) not null check (cost_price >= 0),
  sale_price     numeric(10, 2) not null check (sale_price >= 0),
  effective_from timestamptz not null default now(),
  source         text not null default 'edicion' check (source in ('alta', 'edicion', 'compra')),
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete cascade
);

create index product_cost_history_lookup_idx
  on public.product_cost_history (product_id, effective_from desc);

create or replace function public.log_product_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.cost_price is distinct from old.cost_price
     or new.sale_price is distinct from old.sale_price then
    insert into public.product_cost_history (owner_id, product_id, cost_price, sale_price, source)
    values (
      new.owner_id, new.id, new.cost_price, new.sale_price,
      case when tg_op = 'INSERT' then 'alta'
           else coalesce(nullif(current_setting('dulce.cost_source', true), ''), 'edicion') end
    );
  end if;
  return new;
end;
$$;

create trigger products_log_cost
  after insert or update of cost_price, sale_price on public.products
  for each row execute function public.log_product_cost();

-- ---------------------------------------------------------------------
-- weekly_counts + weekly_count_items
-- ---------------------------------------------------------------------
create table public.weekly_counts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind             text not null default 'weekly' check (kind in ('initial', 'weekly')),
  period_start     timestamptz,             -- fecha del conteo anterior
  counted_at       timestamptz not null default now(),
  products_counted integer not null default 0,
  total_units_sold integer not null default 0,
  total_sales      numeric(12, 2) not null default 0,
  total_cost       numeric(12, 2) not null default 0,
  total_profit     numeric(12, 2) not null default 0,
  notes            text,
  created_at       timestamptz not null default now(),
  unique (id, owner_id)
);

create index weekly_counts_owner_date_idx on public.weekly_counts (owner_id, counted_at desc);

create table public.weekly_count_items (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  weekly_count_id   uuid not null,
  product_id        uuid not null,
  product_name      text not null,
  previous_quantity integer not null check (previous_quantity >= 0),
  counted_quantity  integer not null check (counted_quantity >= 0),
  -- vendidos = anterior − contado (nunca negativo)
  units_sold        integer generated always as (greatest(previous_quantity - counted_quantity, 0)) stored,
  -- sobrante = contado − anterior cuando contaste MÁS de lo esperado
  -- (compra sin registrar o error de conteo). No cuenta como venta.
  surplus           integer generated always as (greatest(counted_quantity - previous_quantity, 0)) stored,
  unit_cost         numeric(10, 2) not null check (unit_cost >= 0),
  unit_price        numeric(10, 2) not null check (unit_price >= 0),
  sales_amount      numeric(12, 2) generated always as
                      (greatest(previous_quantity - counted_quantity, 0) * unit_price) stored,
  cost_amount       numeric(12, 2) generated always as
                      (greatest(previous_quantity - counted_quantity, 0) * unit_cost) stored,
  profit_amount     numeric(12, 2) generated always as
                      (greatest(previous_quantity - counted_quantity, 0) * (unit_price - unit_cost)) stored,
  min_quantity      integer not null,
  stock_status      text not null check (stock_status in ('ok', 'low', 'out')),
  suggested_qty     integer not null check (suggested_qty >= 0),
  unique (weekly_count_id, product_id),
  foreign key (weekly_count_id, owner_id) references public.weekly_counts (id, owner_id) on delete cascade,
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete restrict
);

create index weekly_count_items_count_idx on public.weekly_count_items (weekly_count_id);
create index weekly_count_items_product_idx on public.weekly_count_items (product_id);

-- ---------------------------------------------------------------------
-- purchases + purchase_items
-- ---------------------------------------------------------------------
create table public.purchases (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchased_at timestamptz not null default now(),
  store_name   text,
  source       text not null default 'manual' check (source in ('manual', 'ticket')),
  ticket_path  text,                       -- ruta en Storage (bucket "tickets")
  total_units  integer not null default 0,
  total_cost   numeric(12, 2) not null default 0,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (id, owner_id)
);

create index purchases_owner_date_idx on public.purchases (owner_id, purchased_at desc);

create table public.purchase_items (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references auth.users (id) on delete cascade,
  purchase_id       uuid not null,
  product_id        uuid not null,
  product_name      text not null,
  raw_name          text,                 -- texto tal como venía en el ticket
  quantity          integer not null check (quantity > 0),
  unit_cost         numeric(10, 2) check (unit_cost >= 0),
  line_total        numeric(12, 2) generated always as (quantity * unit_cost) stored,
  previous_quantity integer not null,
  new_quantity      integer not null,
  foreign key (purchase_id, owner_id) references public.purchases (id, owner_id) on delete cascade,
  foreign key (product_id, owner_id) references public.products (id, owner_id) on delete restrict
);

create index purchase_items_purchase_idx on public.purchase_items (purchase_id);
create index purchase_items_product_idx on public.purchase_items (product_id);

-- ---------------------------------------------------------------------
-- RLS: cada quien ve y toca sólo lo suyo
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_cost_history enable row level security;
alter table public.weekly_counts        enable row level security;
alter table public.weekly_count_items   enable row level security;
alter table public.purchases            enable row level security;
alter table public.purchase_items       enable row level security;

create policy "perfil propio: leer" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "perfil propio: editar" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "categorias propias" on public.categories
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "productos propios" on public.products
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "historial de costos propio" on public.product_cost_history
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "conteos propios" on public.weekly_counts
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "renglones de conteo propios" on public.weekly_count_items
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "compras propias" on public.purchases
  for select to authenticated using (owner_id = (select auth.uid()));

create policy "renglones de compra propios" on public.purchase_items
  for select to authenticated using (owner_id = (select auth.uid()));

-- Privilegios: anon no toca nada; el historial sólo se escribe vía RPC.
revoke all on public.profiles, public.categories, public.products, public.product_cost_history,
              public.weekly_counts, public.weekly_count_items, public.purchases, public.purchase_items
  from anon;

revoke insert, update, delete on public.product_cost_history, public.weekly_counts,
  public.weekly_count_items, public.purchases, public.purchase_items from authenticated;
revoke insert, delete on public.profiles from authenticated;

-- products: el inventario (current_quantity) sólo cambia con conteos y compras.
revoke update on public.products from authenticated;
grant update (category_id, name, emoji, cost_price, sale_price, min_quantity, is_active,
              shopping_qty, shopping_checked)
  on public.products to authenticated;

-- ---------------------------------------------------------------------
-- RPC: guardar conteo (semanal o inventario inicial)
--   p_items: [{ "product_id": uuid, "counted_quantity": int }, ...]
-- ---------------------------------------------------------------------
create or replace function public.save_weekly_count(
  p_items jsonb,
  p_kind  text default 'weekly',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_count_id  uuid;
  v_now       timestamptz := now();
  v_prev_date timestamptz;
  v_missing   integer;
  v_bad       integer;
  v_input     integer;
begin
  if v_uid is null then
    raise exception 'NO_AUTH' using errcode = '28000';
  end if;
  if p_kind not in ('initial', 'weekly') then
    raise exception 'TIPO_INVALIDO';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_PRODUCTOS';
  end if;

  create temp table _count_input on commit drop as
    select (e ->> 'product_id')::uuid as product_id,
           e -> 'counted_quantity'     as raw_qty
      from jsonb_array_elements(p_items) e;

  -- Cantidades: enteros, no negativos, sin repetir productos.
  select count(*) into v_bad from _count_input
   where raw_qty is null or jsonb_typeof(raw_qty) <> 'number'
      or (raw_qty::text)::numeric < 0
      or (raw_qty::text)::numeric <> trunc((raw_qty::text)::numeric);
  if v_bad > 0 then
    raise exception 'CANTIDAD_INVALIDA: % producto(s)', v_bad;
  end if;

  select count(*) - count(distinct product_id) into v_bad from _count_input;
  if v_bad > 0 then
    raise exception 'PRODUCTO_REPETIDO';
  end if;

  select count(*) into v_input from _count_input;
  select count(*) into v_bad
    from _count_input i
    left join public.products p on p.id = i.product_id and p.owner_id = v_uid
   where p.id is null;
  if v_bad > 0 then
    raise exception 'PRODUCTO_DESCONOCIDO';
  end if;

  -- Nunca asumimos 0: todo producto activo debe venir contado.
  select count(*) into v_missing
    from public.products p
   where p.owner_id = v_uid and p.is_active
     and not exists (select 1 from _count_input i where i.product_id = p.id);
  if v_missing > 0 then
    raise exception 'FALTAN_PRODUCTOS: %', v_missing;
  end if;

  -- Bloqueo para que nadie mueva el inventario a media operación.
  perform 1 from public.products p
   where p.owner_id = v_uid and p.id in (select product_id from _count_input)
   for update;

  select max(counted_at) into v_prev_date from public.weekly_counts where owner_id = v_uid;

  insert into public.weekly_counts (owner_id, kind, period_start, counted_at, notes)
  values (v_uid, p_kind, v_prev_date, v_now, nullif(btrim(p_notes), ''))
  returning id into v_count_id;

  insert into public.weekly_count_items (
    owner_id, weekly_count_id, product_id, product_name,
    previous_quantity, counted_quantity, unit_cost, unit_price,
    min_quantity, stock_status, suggested_qty
  )
  select v_uid, v_count_id, p.id, p.name,
         -- En el inventario inicial no hay "antes": no se calcula venta.
         case when p_kind = 'initial' then c.qty else p.current_quantity end,
         c.qty,
         coalesce(h.cost_price, p.cost_price),
         coalesce(h.sale_price, p.sale_price),
         p.min_quantity,
         case when c.qty = 0 then 'out'
              when c.qty < p.min_quantity then 'low'
              else 'ok' end,
         greatest(p.min_quantity - c.qty, 0)
    from (select product_id, (raw_qty::text)::integer as qty from _count_input) c
    join public.products p on p.id = c.product_id
    -- Costo y precio vigentes al momento del conteo (historial, no sobrescritura).
    left join lateral (
      select ch.cost_price, ch.sale_price
        from public.product_cost_history ch
       where ch.product_id = p.id and ch.effective_from <= v_now
       order by ch.effective_from desc
       limit 1
    ) h on true;

  update public.weekly_counts w
     set products_counted = s.n,
         total_units_sold = s.units,
         total_sales      = s.sales,
         total_cost       = s.cost,
         total_profit     = s.profit
    from (
      select count(*) as n,
             coalesce(sum(units_sold), 0)    as units,
             coalesce(sum(sales_amount), 0)  as sales,
             coalesce(sum(cost_amount), 0)   as cost,
             coalesce(sum(profit_amount), 0) as profit
        from public.weekly_count_items
       where weekly_count_id = v_count_id
    ) s
   where w.id = v_count_id;

  -- Nuevo inventario de referencia = lo contado. La lista de compras se
  -- regenera: entra lo agotado o por debajo del mínimo.
  update public.products p
     set current_quantity = i.counted_quantity,
         shopping_qty     = case when i.stock_status = 'ok' then null else i.suggested_qty end,
         shopping_checked = false
    from public.weekly_count_items i
   where i.weekly_count_id = v_count_id and p.id = i.product_id;

  -- Productos inactivos que no se contaron salen de la lista.
  update public.products
     set shopping_qty = null, shopping_checked = false
   where owner_id = v_uid and not is_active and shopping_qty is not null
     and id not in (select product_id from _count_input);

  return v_count_id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: confirmar compra (suma inventario)
--   p_items: [{ "product_id": uuid, "quantity": int, "unit_cost": number|null,
--               "raw_name": text|null, "update_cost": bool }, ...]
-- ---------------------------------------------------------------------
create or replace function public.confirm_purchase(
  p_items        jsonb,
  p_purchased_at timestamptz default null,
  p_store_name   text default null,
  p_source       text default 'manual',
  p_ticket_path  text default null,
  p_notes        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_purchase_id uuid;
  v_bad         integer;
  r             record;
  v_prev        integer;
begin
  if v_uid is null then
    raise exception 'NO_AUTH' using errcode = '28000';
  end if;
  if p_source not in ('manual', 'ticket') then
    raise exception 'ORIGEN_INVALIDO';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'SIN_PRODUCTOS';
  end if;
  if p_ticket_path is not null and split_part(p_ticket_path, '/', 1) <> v_uid::text then
    raise exception 'TICKET_AJENO';
  end if;

  create temp table _purchase_input on commit drop as
    select ord,
           (e ->> 'product_id')::uuid        as product_id,
           e -> 'quantity'                   as raw_qty,
           nullif(e ->> 'unit_cost', '')::numeric(10, 2) as unit_cost,
           nullif(btrim(e ->> 'raw_name'), '') as raw_name,
           coalesce((e ->> 'update_cost')::boolean, false) as update_cost
      from jsonb_array_elements(p_items) with ordinality as t(e, ord);

  select count(*) into v_bad from _purchase_input
   where raw_qty is null or jsonb_typeof(raw_qty) <> 'number'
      or (raw_qty::text)::numeric <= 0
      or (raw_qty::text)::numeric <> trunc((raw_qty::text)::numeric)
      or (unit_cost is not null and unit_cost < 0);
  if v_bad > 0 then
    raise exception 'CANTIDAD_INVALIDA: % renglón(es)', v_bad;
  end if;

  select count(*) into v_bad
    from _purchase_input i
    left join public.products p on p.id = i.product_id and p.owner_id = v_uid
   where p.id is null;
  if v_bad > 0 then
    raise exception 'PRODUCTO_DESCONOCIDO';
  end if;

  insert into public.purchases (owner_id, purchased_at, store_name, source, ticket_path, notes)
  values (v_uid, coalesce(p_purchased_at, now()), nullif(btrim(p_store_name), ''),
          p_source, p_ticket_path, nullif(btrim(p_notes), ''))
  returning id into v_purchase_id;

  -- El historial de costos registra estos cambios como "compra".
  perform set_config('dulce.cost_source', 'compra', true);

  for r in select * from _purchase_input order by ord loop
    select current_quantity into v_prev
      from public.products
     where id = r.product_id
       for update;

    update public.products
       set current_quantity = current_quantity + (r.raw_qty::text)::integer,
           cost_price = case when r.update_cost and r.unit_cost is not null
                             then r.unit_cost else cost_price end,
           shopping_checked = case when shopping_qty is not null then true else shopping_checked end
     where id = r.product_id;

    insert into public.purchase_items (
      owner_id, purchase_id, product_id, product_name, raw_name,
      quantity, unit_cost, previous_quantity, new_quantity
    )
    select v_uid, v_purchase_id, p.id, p.name, r.raw_name,
           (r.raw_qty::text)::integer, r.unit_cost, v_prev, p.current_quantity
      from public.products p where p.id = r.product_id;
  end loop;

  perform set_config('dulce.cost_source', '', true);

  update public.purchases pu
     set total_units = s.units, total_cost = s.cost
    from (
      select coalesce(sum(quantity), 0) as units, coalesce(sum(line_total), 0) as cost
        from public.purchase_items where purchase_id = v_purchase_id
    ) s
   where pu.id = v_purchase_id;

  return v_purchase_id;
end;
$$;

revoke execute on function public.save_weekly_count(jsonb, text, text) from public, anon;
revoke execute on function public.confirm_purchase(jsonb, timestamptz, text, text, text, text) from public, anon;
grant execute on function public.save_weekly_count(jsonb, text, text) to authenticated;
grant execute on function public.confirm_purchase(jsonb, timestamptz, text, text, text, text) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_product_cost() from public, anon, authenticated;
