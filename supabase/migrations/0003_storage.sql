-- ============================================================
-- Storage buckets — both public
--
--   assets   — photos, logos, posters, thumbnails (small images)
--   shiurim  — self-hosted audio/video for the Shiurim library
--
-- Public reads (anon); admins write/update/delete.
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('assets',  'assets',  true),
  ('shiurim', 'shiurim', true)
on conflict (id) do nothing;

-- ============================================================
-- public reads (anon and authenticated)
-- ============================================================
create policy "public read assets" on storage.objects
  for select using (bucket_id = 'assets');

create policy "public read shiurim" on storage.objects
  for select using (bucket_id = 'shiurim');

-- ============================================================
-- admin writes
-- ============================================================
create policy "admins write assets" on storage.objects
  for insert with check (bucket_id = 'assets' and is_admin());

create policy "admins update assets" on storage.objects
  for update using (bucket_id = 'assets' and is_admin());

create policy "admins delete assets" on storage.objects
  for delete using (bucket_id = 'assets' and is_admin());

create policy "admins write shiurim" on storage.objects
  for insert with check (bucket_id = 'shiurim' and is_admin());

create policy "admins update shiurim" on storage.objects
  for update using (bucket_id = 'shiurim' and is_admin());

create policy "admins delete shiurim" on storage.objects
  for delete using (bucket_id = 'shiurim' and is_admin());
