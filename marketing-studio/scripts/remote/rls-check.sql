-- Verificación de aislamiento y permisos de Marketing AI Studio contra una base
-- REAL (Supabase) o local. No deja rastro: crea usuarios y datos de prueba
-- dentro de un bloque que termina con un error intencional, por lo que
-- PostgreSQL revierte todo. El mensaje de ese error es el informe:
--   «RLS-CHECK ok=N fail=M | detalle…»
-- Se ejecuta con el rol postgres (SQL Editor de Supabase o psql).
do $$
declare
  a uuid := gen_random_uuid();  -- administradora, dueña del negocio 1
  b uuid := gen_random_uuid();  -- administradora, dueña del negocio 2
  c uuid := gen_random_uuid();  -- usuario sin negocios
  biz1 uuid; biz2 uuid; camp1 uuid; asset2 uuid; asset1 uuid; proj1 uuid;
  n int; ok int := 0; fail int := 0; log text[] := '{}';
  path1 text; path2 text;

begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'rls-check-' || u || '@example.invalid', '', now(), now(), now(), '{}', '{}'
  from unnest(array[a, b, c]) u;
  insert into mkt_admins (user_id) values (a), (b);

  -- Cada negocio lo crea su dueña (el trigger la hace owner).
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  -- Sin RETURNING: la membresía la crea un trigger AFTER INSERT (igual que hace la app).
  insert into mkt_businesses (slug, name) values ('rls-check-1-' || left(a::text, 8), 'RLS Check 1');
  select id into biz1 from mkt_businesses where slug = 'rls-check-1-' || left(a::text, 8);
  insert into mkt_campaigns (business_id, name) values (biz1, 'Campaña 1') returning id into camp1;
  path1 := biz1 || '/rls/foto.jpg';
  insert into mkt_assets (business_id, kind, title, storage_backend, storage_path, original_name, mime_type)
    values (biz1, 'image', 'Foto 1', 'supabase', path1, 'foto.jpg', 'image/jpeg') returning id into asset1;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into mkt_businesses (slug, name) values ('rls-check-2-' || left(b::text, 8), 'RLS Check 2');
  select id into biz2 from mkt_businesses where slug = 'rls-check-2-' || left(b::text, 8);
  path2 := biz2 || '/rls/foto.jpg';
  insert into mkt_assets (business_id, kind, title, storage_backend, storage_path, original_name, mime_type)
    values (biz2, 'image', 'Foto 2', 'supabase', path2, 'foto.jpg', 'image/jpeg') returning id into asset2;
  execute 'reset role';

  -- 1. Cada dueña ve solo su negocio; el usuario sin negocios no ve ninguno.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from mkt_businesses where id in (biz1, biz2);
  execute 'reset role';
  if n = 1 then ok := ok + 1; else fail := fail + 1; log := log || ('A ve ' || n || ' negocios (esperado 1)'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from mkt_businesses where id in (biz1, biz2);
  select n + count(*) into n from mkt_assets where business_id in (biz1, biz2);
  select n + count(*) into n from mkt_campaigns where business_id in (biz1, biz2);
  execute 'reset role';
  if n = 0 then ok := ok + 1; else fail := fail + 1; log := log || ('C ve ' || n || ' filas (esperado 0)'); end if;

  -- 2. A no puede escribir en el negocio de B.
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    insert into mkt_campaigns (business_id, name) values (biz2, 'Intrusa');
    execute 'reset role';
    fail := fail + 1; log := log || 'A insertó campaña en negocio de B'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  begin
    execute 'set local role authenticated';
    update mkt_businesses set name = 'Cambiado' where id = biz2;
    get diagnostics n = row_count;
    execute 'reset role';
    if n = 0 then ok := ok + 1; else fail := fail + 1; log := log || 'A editó el negocio de B'::text; end if;
  end;

  -- 3. Una publicación no puede usar un recurso de otro negocio.
  begin
    execute 'set local role authenticated';
    insert into mkt_content_items (business_id, title, asset_id) values (biz1, 'Mezcla', asset2);
    execute 'reset role';
    fail := fail + 1; log := log || 'Publicación de A usó recurso de B'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  -- 4. El navegador no puede marcar «conectado» ni «publicado».
  begin
    execute 'set local role authenticated';
    insert into mkt_social_accounts (business_id, platform, handle, connection_status) values (biz1, 'facebook_page', 'x', 'connected');
    execute 'reset role';
    fail := fail + 1; log := log || 'Se marcó una red como conectada desde el navegador'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into mkt_content_items (business_id, title, status) values (biz1, 'Pub', 'published');
    execute 'reset role';
    fail := fail + 1; log := log || 'Se marcó una publicación como publicada'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  -- 5. Un material no es definitivo sin archivo y revisión aprobada.
  execute 'set local role authenticated';
  insert into mkt_creative_projects (business_id, title, material_type, format_key, width, height)
    values (biz1, 'Proyecto', 'ad', 'ig_portrait', 1080, 1350) returning id into proj1;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into mkt_creative_versions (business_id, project_id, version_no, kind, is_final) values (biz1, proj1, 1, 'code_edit', true);
    execute 'reset role';
    fail := fail + 1; log := log || 'Versión definitiva sin revisión'::text;
  exception when check_violation then ok := ok + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into mkt_creative_projects (business_id, title, material_type, format_key, width, height, reference_asset_ids)
      values (biz1, 'Proyecto 2', 'ad', 'ig_portrait', 1080, 1350, array[asset2]);
    execute 'reset role';
    fail := fail + 1; log := log || 'Proyecto de A usó referencia de B'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  -- 6. Storage: solo se sube a la ruta de un registro pendiente propio, y solo
  --    se leen archivos del propio negocio.
  if to_regclass('storage.objects') is not null then
    begin
      execute 'set local role authenticated';
      insert into storage.objects (bucket_id, name) values ('mkt-assets', path2);
      execute 'reset role';
      fail := fail + 1; log := log || 'A subió un archivo a la carpeta de B'::text;
    exception when insufficient_privilege then ok := ok + 1;
    end;
    execute 'reset role';
    begin
      execute 'set local role authenticated';
      insert into storage.objects (bucket_id, name) values ('mkt-assets', biz1 || '/rls/sin-registro.jpg');
      execute 'reset role';
      fail := fail + 1; log := log || 'A subió un archivo sin registro pendiente'::text;
    exception when insufficient_privilege then ok := ok + 1;
    end;
    execute 'reset role';
    execute 'set local role authenticated';
    insert into storage.objects (bucket_id, name) values ('mkt-assets', path1);
    select count(*) into n from storage.objects where bucket_id = 'mkt-assets' and name = path1;
    execute 'reset role';
    if n = 1 then ok := ok + 1; else fail := fail + 1; log := log || 'A no ve su propio archivo'::text; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from storage.objects where bucket_id = 'mkt-assets' and name = path1;
    delete from storage.objects where bucket_id = 'mkt-assets' and name = path1;
    execute 'reset role';
    select n + (1 - count(*)) into n from storage.objects where bucket_id = 'mkt-assets' and name = path1;
    if n = 0 then ok := ok + 1; else fail := fail + 1; log := log || 'B vio o borró el archivo de A'::text; end if;
  else
    log := log || 'storage.objects no existe: pruebas de Storage omitidas'::text;
  end if;

  -- 7. anon no tiene acceso; authenticated no puede vaciar tablas ni escribir
  --    en tablas de solo lectura.
  begin
    execute 'set local role anon';
    perform count(*) from mkt_businesses;
    execute 'reset role';
    fail := fail + 1; log := log || 'anon pudo leer mkt_businesses'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    execute 'set local role authenticated';
    execute 'truncate mkt_ai_usage';
    execute 'reset role';
    fail := fail + 1; log := log || 'authenticated pudo hacer TRUNCATE'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into mkt_admins (user_id) values (c);
    execute 'reset role';
    fail := fail + 1; log := log || 'authenticated se agregó un administrador'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    insert into mkt_audit_log (business_id, action, entity) values (biz1, 'x', 'x');
    execute 'reset role';
    fail := fail + 1; log := log || 'authenticated escribió en la auditoría'::text;
  exception when insufficient_privilege then ok := ok + 1;
  end;
  execute 'reset role';

  -- 8. La auditoría registró las operaciones de A y B.
  select count(*) into n from mkt_audit_log where business_id in (biz1, biz2);
  if n >= 5 then ok := ok + 1; else fail := fail + 1; log := log || ('auditoría con ' || n || ' filas'); end if;

  raise exception 'RLS-CHECK ok=% fail=% | %', ok, fail, coalesce(array_to_string(log, ' ; '), '');
end $$;
