-- Escenario de la especificación. Ejecutar sobre una BD con local_stubs + migración 1.
\set ON_ERROR_STOP on
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@x.com'),
                              ('22222222-2222-2222-2222-222222222222','b@x.com');
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

insert into public.categories (name, emoji, color) values ('Botanas','🌶️','mango');
insert into public.products (name, category_id, cost_price, sale_price, min_quantity, current_quantity)
select n, (select id from public.categories limit 1), c, s, m, q from (values
  ('Takis Fuego',12,20,10,20),('Mazapán',5,10,15,30),('Pulparindo',6,12,10,25)) v(n,c,s,m,q);

-- inventario inicial
select public.save_weekly_count(
  (select jsonb_agg(jsonb_build_object('product_id',id,'counted_quantity',current_quantity)) from public.products),
  'initial');

-- faltan productos -> error
do $$ begin
  perform public.save_weekly_count(jsonb_build_array(jsonb_build_object(
    'product_id',(select id from public.products where name='Takis Fuego'),'counted_quantity',12)));
  raise exception 'debió fallar';
exception when others then
  if sqlerrm not like 'FALTAN_PRODUCTOS%' then raise; end if;
  raise notice 'OK falta de productos detectada: %', sqlerrm;
end $$;

-- negativos -> error
do $$ begin
  perform public.save_weekly_count((select jsonb_agg(jsonb_build_object('product_id',id,'counted_quantity',-1)) from public.products));
  raise exception 'debió fallar';
exception when others then
  if sqlerrm not like 'CANTIDAD_INVALIDA%' then raise; end if;
  raise notice 'OK negativo rechazado';
end $$;

-- inventario no editable directamente
do $$ begin
  update public.products set current_quantity = 99;
  raise exception 'debió fallar';
exception when insufficient_privilege then raise notice 'OK current_quantity protegido';
end $$;

-- Sábado 1: Takis 12, Mazapán 21, Pulparindo 0
select public.save_weekly_count((select jsonb_agg(jsonb_build_object('product_id',id,'counted_quantity',
  case name when 'Takis Fuego' then 12 when 'Mazapán' then 21 else 0 end)) from public.products));

select product_name, previous_quantity prev, counted_quantity cont, units_sold vend, sales_amount ventas,
       cost_amount costo, profit_amount ganancia, stock_status, suggested_qty
  from public.weekly_count_items i join public.weekly_counts w on w.id=i.weekly_count_id
 where w.kind='weekly' order by product_name;
select kind, total_units_sold, total_sales, total_cost, total_profit from public.weekly_counts order by counted_at;

do $$ declare r record; begin
  select * into r from public.weekly_count_items where product_name='Takis Fuego' and units_sold>0;
  assert r.units_sold=8 and r.sales_amount=160 and r.cost_amount=96 and r.profit_amount=64, 'Takis mal';
  select * into r from public.weekly_counts where kind='weekly';
  assert r.total_units_sold = 8+9+25, 'total unidades';
  assert r.total_sales = 160+90+300 and r.total_profit = 64+45+150, 'totales';
  raise notice 'OK fórmulas de la semana 1';
end $$;

select name, current_quantity, shopping_qty from public.products order by name;

-- Compra: 20 Takis a $13 (actualiza costo), 30 Pulparindo
select public.confirm_purchase(jsonb_build_array(
  jsonb_build_object('product_id',(select id from public.products where name='Takis Fuego'),'quantity',20,'unit_cost',13,'update_cost',true,'raw_name','TAKIS FGO 70G'),
  jsonb_build_object('product_id',(select id from public.products where name='Pulparindo'),'quantity',30,'unit_cost',6)),
  null,'Bodega','ticket');
select name, current_quantity, cost_price, shopping_qty, shopping_checked from public.products order by name;
select total_units, total_cost from public.purchases;
select p.name, h.cost_price, h.source from public.product_cost_history h join public.products p on p.id=h.product_id order by p.name, h.effective_from;

-- Sábado 2: Takis 32 -> 25 (7 vendidos a costo nuevo 13)
select public.save_weekly_count((select jsonb_agg(jsonb_build_object('product_id',id,'counted_quantity',
  case name when 'Takis Fuego' then 25 when 'Mazapán' then 21 else 28 end)) from public.products));
do $$ declare r record; begin
  select i.* into r from public.weekly_count_items i join public.weekly_counts w on w.id=i.weekly_count_id
   where i.product_name='Takis Fuego' order by w.counted_at desc limit 1;
  assert r.previous_quantity=32 and r.units_sold=7 and r.unit_cost=13 and r.profit_amount=49, 'semana 2 takis';
  -- la semana 1 conserva su costo de 12
  assert (select count(*) from public.weekly_count_items where product_name='Takis Fuego' and unit_cost=12) = 2, 'historial';
  raise notice 'OK semana 2 usa costo nuevo y la semana 1 conserva el anterior';
end $$;

-- Aislamiento entre usuarios
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  assert (select count(*) from public.products)=0 and (select count(*) from public.weekly_counts)=0, 'fuga RLS';
  raise notice 'OK otro usuario no ve nada';
end $$;
reset role;
