-- ============================================================
-- On-site 1:1 booking: session types (admin-priced), recurring
-- weekly availability, and paid bookings tied to user accounts.
-- Run in the Supabase SQL editor after 0005.
-- ============================================================

-- What can be booked, at what price
create table if not exists session_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,                         -- "Discovery Call", "Coaching Session"
  description text,
  duration_minutes int not null default 60,
  price_cents int not null,
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger session_types_updated_at
  before update on session_types
  for each row execute function set_updated_at();

-- Recurring weekly windows, stored as America/New_York wall-clock times.
-- Slot starts are generated every session-duration minutes inside a window.
create table if not exists availability_rules (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- Booked 1:1 sessions. Row is inserted as 'pending' (holds the slot for
-- 30 minutes) by create-booking-checkout, flipped to 'paid' by the Stripe
-- webhook. Zoom fields are filled by the webhook when ZOOM_* creds exist.
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  session_type_id uuid references session_types(id) on delete set null,
  email citext not null,
  name text,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  price_cents int not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired')),
  stripe_session_id text unique,
  zoom_join_url text,
  zoom_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create index if not exists bookings_user_idx on bookings (user_id, starts_at);
create index if not exists bookings_active_slot_idx on bookings (starts_at) where status in ('pending', 'paid');
-- one live hold/sale per exact start time
create unique index if not exists bookings_slot_unique on bookings (starts_at) where status in ('pending', 'paid');

-- ============================================================
-- RLS
-- ============================================================
alter table session_types      enable row level security;
alter table availability_rules enable row level security;
alter table bookings           enable row level security;

create policy "public reads active session types" on session_types
  for select using (active or is_admin());
create policy "admins manage session types" on session_types
  for all using (is_admin()) with check (is_admin());

create policy "public reads availability" on availability_rules
  for select using (true);
create policy "admins manage availability" on availability_rules
  for all using (is_admin()) with check (is_admin());

create policy "own or admin reads bookings" on bookings
  for select using (is_admin() or user_id = auth.uid());
create policy "admins update bookings" on bookings
  for update using (is_admin()) with check (is_admin());
-- inserts happen via service role only (create-booking-checkout / webhook)

-- Occupied slots for the public picker — times only, no identities.
create or replace view v_booked_slots as
  select starts_at, duration_minutes
  from bookings
  where status = 'paid'
     or (status = 'pending' and created_at > now() - interval '30 minutes');

grant select on v_booked_slots to anon, authenticated;

-- ============================================================
-- Public signups exist now, so `authenticated` must not read Zoom
-- credentials off events directly (0005 only restricted anon).
-- Admin UIs read full rows through the is_admin()-gated view below;
-- column UPDATE privileges are untouched, so the admin panel still
-- writes zoom fields directly to events.
-- ============================================================
revoke select on table events from authenticated;
grant select (
  id, slug, title, description, starts_at, duration_minutes,
  price_cents, capacity, status, created_at, updated_at
) on events to authenticated;

create or replace view v_admin_events as
  select * from events where is_admin();

grant select on v_admin_events to authenticated;
