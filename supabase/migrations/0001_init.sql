-- ============================================================
-- ShmuelGoldstein.com — Initial schema
-- Run order: 0001_init.sql → 0002_rls.sql → 0003_storage.sql → 0004_seed.sql
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- ============================================================
-- helpers
-- ============================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- admins — single-table RBAC; the rabbi (and anyone he adds) lives here
-- ============================================================
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer as $$
  select exists (select 1 from admins where user_id = uid)
$$;

-- ============================================================
-- pages — admin-editable site copy
--   Each row holds one page's content; the public reads this with anon key.
-- ============================================================
create table if not exists pages (
  slug text primary key,                      -- 'home', 'about', 'approach', ...
  title text,
  hero_eyebrow text,
  hero_heading text,
  hero_lead text,
  hero_cta_label text,
  body_md text,                               -- full markdown body
  data jsonb not null default '{}'::jsonb,    -- page-specific extras
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger pages_updated_at
  before update on pages
  for each row execute function set_updated_at();

-- ============================================================
-- testimonials — Swiper-driven carousel on the home page
-- ============================================================
create table if not exists testimonials (
  id uuid primary key default gen_random_uuid(),
  quote_text text not null,
  attributed_to text not null,                -- "Relationship Coaching Client"
  role text,                                  -- optional: "Wife & Mother"
  category text,                              -- 'relationship', 'mens', 'group', ...
  featured boolean not null default false,    -- show in carousel?
  sort_order int not null default 100,        -- low = early
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger testimonials_updated_at
  before update on testimonials
  for each row execute function set_updated_at();

create index if not exists testimonials_published_idx
  on testimonials (published, featured, sort_order);

-- ============================================================
-- shiurim — Torah classes; sourced from YouTube, Vimeo, or self-hosted (Supabase Storage)
-- ============================================================
create type shiur_source as enum ('youtube', 'vimeo', 'supabase');

create table if not exists shiurim (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  source shiur_source not null,
  source_id text,                             -- e.g. 'dQw4w9WgXcQ' for YouTube
  source_url text,                            -- canonical URL for direct linking
  storage_path text,                          -- when source='supabase'  (e.g. 'shiurim/2026/parsha-vayikra.mp4')
  poster_path text,                           -- optional thumbnail in storage
  topic text,                                 -- 'parsha', 'halacha', 'mussar', 'tefila'
  duration_seconds int,
  recorded_at date,
  tags text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger shiurim_updated_at
  before update on shiurim
  for each row execute function set_updated_at();

create index if not exists shiurim_published_idx
  on shiurim (published, recorded_at desc);

create index if not exists shiurim_topic_idx on shiurim (topic);

-- ============================================================
-- events — paid live group coaching sessions
-- ============================================================
create type event_status as enum ('draft', 'upcoming', 'live', 'past', 'cancelled');

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  description text,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  price_cents int not null,
  capacity int,                               -- null = unlimited
  zoom_join_url text,
  zoom_password text,
  stripe_price_id text,                       -- preferred: dynamic Checkout Sessions
  stripe_payment_link text,                   -- fallback: pre-built Payment Link
  status event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger events_updated_at
  before update on events
  for each row execute function set_updated_at();

create index if not exists events_status_idx on events (status, starts_at);

-- ============================================================
-- purchases — written by Stripe webhook
-- ============================================================
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  email citext not null,
  name text,
  stripe_session_id text unique not null,
  amount_paid_cents int,
  currency text default 'usd',
  reminder_sent_at timestamptz,               -- set by send-reminders cron
  confirmation_sent_at timestamptz,           -- set by stripe-webhook
  created_at timestamptz not null default now()
);

create index if not exists purchases_event_idx on purchases (event_id);
create index if not exists purchases_email_idx on purchases (email);
create index if not exists purchases_reminder_pending_idx
  on purchases (reminder_sent_at) where reminder_sent_at is null;

-- ============================================================
-- subscribers — newsletter signups (Netlify Forms mirror, optional sync)
-- ============================================================
create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  source text,                                -- 'footer', 'manual', 'event'
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- page_views — lightweight analytics (per khalyereim pattern)
-- ============================================================
create table if not exists page_views (
  id bigserial primary key,
  session_id text not null,                   -- random; persisted in localStorage
  path text not null,
  referrer text,
  user_agent text,
  duration_ms int,                            -- updated on unload
  max_scroll_pct smallint,                    -- 0-100
  created_at timestamptz not null default now()
);

create index if not exists page_views_path_day_idx
  on page_views (path, created_at);

create index if not exists page_views_session_idx on page_views (session_id);

-- Aggregate view: per-page stats (last 30d window — adjust as needed)
create or replace view v_page_analytics as
select
  path,
  count(*)                                       as views,
  count(distinct session_id)                     as uniques,
  round(avg(duration_ms) / 1000.0, 1)            as avg_seconds,
  round(avg(max_scroll_pct), 0)                  as avg_scroll_pct
from page_views
where created_at > now() - interval '30 days'
group by path
order by views desc;

-- ============================================================
-- contact_messages — for a "Send Rabbi a note" form (optional Phase B+)
-- ============================================================
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email citext not null,
  subject text,
  message text not null,
  status text not null default 'new',         -- 'new' | 'read' | 'replied'
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_status_idx on contact_messages (status, created_at desc);
