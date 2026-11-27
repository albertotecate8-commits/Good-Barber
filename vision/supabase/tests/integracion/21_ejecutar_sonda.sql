\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
set role anon;
select 'anon', * from zz_sonda.conteos();
reset role;
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000001';
select 'admin_gb', * from zz_sonda.conteos();
set request.jwt.claim.sub = 'aaaaaaaa-0000-4000-8000-000000000002';
select 'barbero_gb', * from zz_sonda.conteos();
reset role;
select 'anon_admin_exists', public.admin_exists()::text, '';
