-- ============================================================
-- Storage buckets
--
-- Three buckets:
--   assets        — public images (logos, photos, shiur posters)
--   shiurim       — public audio/video (large; CDN-cached)
--   private       — admin-only files (drafts, backups, originals)
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('assets',  'assets',  true),
  ('shiurim', 'shiurim', true),
  ('private', 'private', false)
on conflict (id) do nothing;

-- ============================================================
-- assets — public read, admin write
-- ============================================================
create policy "public read assets" on storage.objects
  for select using (bucket_id = 'assets');

create policy "admins write assets" on storage.objects
  for insert with check (bucket_id = 'assets' and is_admin());

create policy "admins update assets" on storage.objects
  for update using (bucket_id = 'assets' and is_admin());

create policy "admins delete assets" on storage.objects
  for delete using (bucket_id = 'assets' and is_admin());

-- ============================================================
-- shiurim — public read, admin write
-- ============================================================
create policy "public read shiurim" on storage.objects
  for select using (bucket_id = 'shiurim');

create policy "admins write shiurim" on storage.objects
  for insert with check (bucket_id = 'shiurim' and is_admin());

create policy "admins update shiurim" on storage.objects
  for update using (bucket_id = 'shiurim' and is_admin());

create policy "admins delete shiurim" on storage.objects
  for delete using (bucket_id = 'shiurim' and is_admin());

-- ============================================================
-- private — admin only
-- ============================================================
create policy "admins read private" on storage.objects
  for select using (bucket_id = 'private' and is_admin());

create policy "admins write private" on storage.objects
  for insert with check (bucket_id = 'private' and is_admin());

create policy "admins update private" on storage.objects
  for update using (bucket_id = 'private' and is_admin());

create policy "admins delete private" on storage.objects
  for delete using (bucket_id = 'private' and is_admin());
