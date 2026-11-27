-- Datos ficticios mínimos SOLO para la prueba local de no interferencia.
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@gb.test', '{"name":"Admin GB"}'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'barbero@gb.test', '{"name":"Barbero GB"}');
set request.jwt.claim.role = 'service_role';  -- como lo hace bootstrap-admin
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-8000-000000000001';
reset request.jwt.claim.role;
insert into public.barbers (id, profile_id, name)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'Barbero GB');
insert into public.clients (id, barber_id, name, phone)
values ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'Cliente Prueba', '6180000000');
insert into public.service_records (barber_id, client_id, service_id, service_name, price_cents, record_date, record_time)
select 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', s.id, s.name, s.price_cents, '2026-11-20', '15:00'
from public.services s order by s.sort_order limit 1;
