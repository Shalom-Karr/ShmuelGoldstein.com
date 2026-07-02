-- ============================================================
-- Zoom credentials are paid content — the anon key must not be
-- able to select them. RLS row policy ("public reads visible
-- events") stays; this narrows the COLUMNS anon can read.
-- Buyers get zoom_join_url/zoom_password via the event-access
-- Netlify function (service role), gated by stripe_session_id.
-- `authenticated` keeps full column access for the admin panel
-- (RLS still restricts its rows to is_admin() for writes).
-- Run in the Supabase SQL editor.
-- ============================================================

revoke select on table events from anon;

grant select (
  id, slug, title, description, starts_at, duration_minutes,
  price_cents, capacity, status, created_at, updated_at
) on events to anon;
