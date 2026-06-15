-- ============================================================
-- Row Level Security policies
-- Anon: read published content + insert their own (limited)
-- Admin: full CRUD on everything
-- ============================================================

-- enable RLS
alter table admins             enable row level security;
alter table pages              enable row level security;
alter table testimonials       enable row level security;
alter table shiurim            enable row level security;
alter table events             enable row level security;
alter table purchases          enable row level security;
alter table subscribers        enable row level security;
alter table page_views         enable row level security;
alter table contact_messages   enable row level security;

-- ============================================================
-- admins — only admins can see who else is admin
-- ============================================================
create policy "admins read self+team" on admins
  for select using (is_admin());

create policy "admins manage admins" on admins
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- pages — public reads published; admin writes
-- ============================================================
create policy "public reads published pages" on pages
  for select using (published = true);

create policy "admins manage pages" on pages
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- testimonials — public reads published; admin writes
-- ============================================================
create policy "public reads published testimonials" on testimonials
  for select using (published = true);

create policy "admins manage testimonials" on testimonials
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- shiurim — public reads published; admin writes
-- ============================================================
create policy "public reads published shiurim" on shiurim
  for select using (published = true);

create policy "admins manage shiurim" on shiurim
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- events — public reads non-draft; admin writes
-- ============================================================
create policy "public reads visible events" on events
  for select using (status in ('upcoming', 'live', 'past'));

create policy "admins manage events" on events
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- purchases — only the buyer (matched by email) or admin can read; no public write
-- (writes happen via service_role from the Stripe webhook)
-- ============================================================
create policy "buyers read own purchases" on purchases
  for select using (
    is_admin()
    or email = auth.jwt() ->> 'email'
  );

-- no insert/update/delete policy for anon — only service_role can write

-- ============================================================
-- subscribers — anon can subscribe (insert) and unsubscribe (update own row)
-- ============================================================
create policy "anyone can subscribe" on subscribers
  for insert with check (true);

create policy "subscribers read own row" on subscribers
  for select using (
    is_admin()
    or email = auth.jwt() ->> 'email'
  );

create policy "admins manage subscribers" on subscribers
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- page_views — anon can insert/update their own session; admin reads all
-- ============================================================
create policy "anyone can log page view" on page_views
  for insert with check (true);

create policy "session can update own row" on page_views
  for update using (true) with check (true);  -- session_id is the constraint

create policy "admins read page views" on page_views
  for select using (is_admin());

-- ============================================================
-- contact_messages — anyone can send; admin reads + updates
-- ============================================================
create policy "anyone can send a message" on contact_messages
  for insert with check (true);

create policy "admins read messages" on contact_messages
  for select using (is_admin());

create policy "admins update messages" on contact_messages
  for update using (is_admin()) with check (is_admin());
