-- Fotos de tickets de compra: bucket privado, una carpeta por usuario
-- (ruta: <user_id>/<archivo>.jpg).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "tickets: leer los propios" on storage.objects
  for select to authenticated
  using (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "tickets: subir a la carpeta propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "tickets: borrar los propios" on storage.objects
  for delete to authenticated
  using (bucket_id = 'tickets' and (storage.foldername(name))[1] = (select auth.uid())::text);
