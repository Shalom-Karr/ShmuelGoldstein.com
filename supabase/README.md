# Supabase — ShmuelGoldstein.com

Schema, RLS, and storage-bucket migrations for the site's Phase B backend.

## Applying the migrations

Once Rabbi Goldstein creates the Supabase project and sends credentials, run these migrations in the SQL editor in order:

```
0001_init.sql       — extensions, helper functions, all tables
0002_rls.sql        — Row Level Security policies
0003_storage.sql    — three buckets (assets, shiurim, private) + policies
0004_seed.sql       — initial content rows (pages, testimonials, sample shiurim)
```

In the Supabase Dashboard:
1. Database → SQL Editor → New query.
2. Paste each file's contents and run, in order.
3. Verify in Table Editor that all eight tables exist with rows.

Or via the Supabase CLI:

```sh
supabase link --project-ref <ref>
supabase db push   # applies anything in supabase/migrations/
```

## What's in here

### Tables

| Table | Purpose | Who writes |
|---|---|---|
| `admins` | RBAC — list of admin user IDs | Admin only |
| `pages` | Editable site copy (hero text, lead, etc.) keyed by slug | Admin |
| `testimonials` | Client quotes shown in the home-page carousel | Admin |
| `shiurim` | Torah classes — YouTube, Vimeo, or self-hosted videos | Admin |
| `events` | Paid live group-coaching sessions | Admin |
| `purchases` | Stripe-driven; one row per ticket sold | `service_role` only (webhook) |
| `subscribers` | Newsletter signups | Anon insert, admin manage |
| `page_views` | Lightweight analytics | Anon insert/update, admin read |
| `contact_messages` | "Send a note to the Rabbi" form | Anon insert, admin manage |

### Storage buckets

| Bucket | Public | Used for |
|---|---|---|
| `assets` | yes | Photos, logos, shiur posters |
| `shiurim` | yes | Audio/video files hosted by us |
| `private` | no | Drafts, originals, backups — admin only |

## How the front-end uses this

Reads (anon key, browser-safe):
- `pages` → on each page load, look up the row by slug and populate eyebrow/heading/lead. Falls back to the hardcoded HTML if Supabase is unreachable.
- `testimonials` → Swiper carousel on `index.html`.
- `shiurim` → grid on `shiurim.html`.
- `events` → grid on `events.html` (Phase B).

Writes (Netlify Functions, service-role key):
- `purchases` ← Stripe webhook.
- `subscribers` ← newsletter form fallback (Netlify Forms is primary).
- `page_views` ← analytics beacon (`/api/track`).

## Admin user setup

1. After Rabbi Goldstein signs up, he'll be in `auth.users` as a regular user.
2. Find his `user_id` (Authentication → Users in the dashboard).
3. Add a row to `admins`:
   ```sql
   insert into admins (user_id, email, display_name)
   values ('<uuid>', 'rabbi@shmuelgoldstein.com', 'Rabbi Shmuel Goldstein');
   ```
4. The `is_admin()` function picks up everything else automatically.

## Helpful queries

```sql
-- Featured testimonials in carousel order
select * from testimonials where featured and published order by sort_order;

-- Upcoming events with seats remaining
select e.*, (e.capacity - count(p.id)) as seats_left
from events e
left join purchases p on p.event_id = e.id
where e.status = 'upcoming'
group by e.id;

-- Page analytics last 30 days
select * from v_page_analytics;

-- Registrants pending reminder for events starting in next 24h
select p.email, e.title, e.starts_at, e.zoom_join_url
from purchases p
join events e on e.id = p.event_id
where p.reminder_sent_at is null
  and e.starts_at between now() and now() + interval '24 hours';
```

## Notes

- Migrations are idempotent where practical (`if not exists`, `on conflict do nothing`). Re-running the seed will not duplicate rows.
- Don't store the **service role key** in the repo or anywhere client-side — only in Netlify env vars for the functions.
- The **anon key** is safe to embed in browser JS — RLS enforces what it can read.
