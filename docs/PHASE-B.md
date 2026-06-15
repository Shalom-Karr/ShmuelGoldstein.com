# Phase B — Backend, Payments, Live Group Coaching, Admin

This document is the implementation plan for everything beyond the static
marketing site: dynamic content, paid live group sessions, transactional email,
and the admin dashboard for Rabbi Goldstein.

---

## Stack — locked

| Concern | Choice | Why |
|---|---|---|
| **Hosting + functions** | Netlify (Free tier) | Co-located with the static site; serverless Node functions; free up to ~125K invocations/mo. |
| **Database + auth + storage** | Supabase (Free tier) | Postgres + RLS + storage buckets + magic-link auth. Free covers a small coaching practice. |
| **Payments** | Stripe Checkout | 2.9% + 30¢ per sale, no monthly fee. Hosted Checkout = no PCI scope. |
| **Email (outbound)** | Google Workspace SMTP + `nodemailer` | $6/mo. Uses the rabbi's own domain so confirmations come from him directly. |
| **Streaming** | Zoom Meeting (existing Pro) | Upgrade to Zoom Webinar later once attendance justifies the add-on. |
| **Scheduling reminders** | Netlify Scheduled Functions | Built-in cron — no separate scheduler. |

---

## Data flow

```
visitor
  └─► events.html  (reads Supabase events via anon key)
        ├─► clicks "Reserve a seat"
        │     └─► Stripe Checkout (hosted)
        │           └─► success → /api/stripe-webhook (Netlify Fn, service-role)
        │                 ├─► inserts row into purchases
        │                 └─► sends confirmation email (Google Workspace SMTP)
        │           └─► redirect to /access?session_id=…
        │                 └─► /api/event-access reads purchases + events
        │                       returns Zoom URL + password
        │
        └─► newsletter form (Netlify Forms) ─► Netlify dashboard
                                                      (mirror to subscribers
                                                       table in /api/stripe-webhook? no –
                                                       optional /api/subscribe sync)

cron (hourly):
  /api/send-reminders
    └─► purchases where reminder_sent_at IS NULL AND event.starts_at in 23–25h
          └─► sends "tomorrow" email, sets reminder_sent_at = now()

admin
  └─► /admin/* (Supabase magic-link auth, is_admin() gate)
        ├─► CRUD events, testimonials, shiurim, pages
        ├─► view registrants per event
        ├─► broadcast email to subscribers
        └─► analytics dashboard (v_page_analytics view)
```

---

## Repo layout (added by Phase B)

```
.
├── netlify/
│   └── functions/
│       ├── stripe-webhook.js     ← receives Stripe events
│       ├── event-access.js       ← gates Zoom link by session_id
│       ├── send-reminders.js     ← Scheduled fn, every hour
│       ├── subscribe.js          ← optional newsletter sync to Supabase
│       ├── track.js              ← analytics beacon
│       └── _lib/
│           ├── supabase.js       ← service-role client
│           └── mail.js           ← nodemailer transport
│
├── supabase/
│   ├── migrations/
│   │   ├── 0001_init.sql
│   │   ├── 0002_rls.sql
│   │   ├── 0003_storage.sql
│   │   └── 0004_seed.sql
│   └── README.md
│
├── events.html                   ← new public page
├── access.html                   ← post-purchase landing
├── admin/
│   ├── index.html                ← dashboard shell
│   ├── login.html                ← magic-link
│   ├── events.html               ← CRUD events
│   ├── testimonials.html         ← CRUD testimonials
│   ├── shiurim.html              ← CRUD shiurim
│   ├── subscribers.html          ← list + send broadcast
│   ├── analytics.html            ← charts from v_page_analytics
│   └── _shared/
│       ├── admin.css
│       ├── auth.js               ← Supabase auth + is_admin gate
│       └── ui.js                 ← table render, modal, toast
│
└── package.json                  ← deps: @supabase/supabase-js, stripe, nodemailer, marked (md→html for pages)
```

---

## Environment variables (Netlify dashboard, NOT in repo)

```
STRIPE_SECRET_KEY              sk_live_…  (or sk_test_… while testing)
STRIPE_WEBHOOK_SECRET          whsec_…
STRIPE_PUBLISHABLE_KEY         pk_live_…  (exposed to client via window injection)
SUPABASE_URL                   https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY      eyJ…  (SERVER-ONLY — never expose)
SUPABASE_ANON_KEY              eyJ…  (safe to expose; client-side)
SMTP_HOST                      smtp.gmail.com
SMTP_PORT                      465
SMTP_USER                      rabbi@shmuelgoldstein.com
SMTP_APP_PASSWORD              16-char Google App Password
SITE_ORIGIN                    https://shmuelgoldstein.com
ADMIN_NOTIFY_EMAIL             shalomkarr@gmail.com  (for error alerts)
```

Set them with:
```sh
netlify env:set STRIPE_SECRET_KEY sk_test_…
netlify env:set SUPABASE_SERVICE_ROLE_KEY ey…
# … etc.
```

---

## Build order (after credentials land)

### Step 1 — Supabase up
1. Rabbi creates account → I get email/password.
2. Run all four migrations from `supabase/migrations/`.
3. Create an `admins` row pointing at the rabbi's auth.users id.
4. Write the URL + anon key + service-role key into Netlify env.

### Step 2 — Wire dynamic reads (low risk)
- Add `js/config.js`:
  ```js
  window.SB = { url: 'INJECTED_AT_BUILD', anon: 'INJECTED_AT_BUILD' };
  ```
- Update `index.html`'s carousel script: on load, fetch `testimonials` via anon key and hydrate the Swiper. Keep the static markup as fallback for if Supabase is down.
- Update `shiurim.html` similarly — fetch from `shiurim` table, render via the existing card+player markup.
- Ship.

### Step 3 — Stripe + Events page
1. Rabbi sends keys → put `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` into Netlify.
2. Build `netlify/functions/stripe-webhook.js`:
   - Verify signature with `STRIPE_WEBHOOK_SECRET`.
   - On `checkout.session.completed`: insert into `purchases`, send confirmation email.
3. Build `events.html`:
   - Fetch `events where status='upcoming'`.
   - Each card has a "Reserve a seat — $X" button that POSTs to `/api/create-checkout-session` (which mints a Stripe Checkout Session from the event row).
4. Build `access.html`:
   - On load, read `?session_id=…`, call `/api/event-access`.
   - Display Zoom URL + password + calendar (.ics) download.
5. Configure Stripe webhook URL in Stripe dashboard → `https://shmuelgoldstein.com/api/stripe-webhook`.

### Step 4 — Reminder cron
- `netlify/functions/send-reminders.js` with `export const handler = schedule('0 * * * *', …)`.
- Query: purchases where `reminder_sent_at IS NULL` and `event.starts_at` in next 23–25h.
- Loop, send via SMTP, mark `reminder_sent_at = now()`.
- Idempotent — if a run is skipped, the next hour picks it up.

### Step 5 — Admin pages
- `admin/login.html` — Supabase magic-link sign-in.
- `admin/_shared/auth.js` — on every admin page, check session → check `is_admin()` via Supabase → redirect to `/login` if not.
- `admin/events.html` — table + create/edit modal.
- Similar shells for `testimonials.html`, `shiurim.html`, `subscribers.html`.
- `admin/analytics.html` — fetch `v_page_analytics` view, render Chart.js bar + sparklines.

### Step 6 — Polish
- Site-wide content from `pages` table (admin can edit hero copy without code pushes).
- Newsletter broadcast email (admin selects subscriber list, types subject/body, hits send → loops via `mail.js`).
- Stripe in **live mode** after end-to-end test with `sk_test_`.

---

## Cost summary

| Service | Monthly |
|---|---|
| Supabase | $0 (free tier — 500 MB Postgres, 1 GB storage) |
| Netlify | $0 (free tier — covers ~125K function invocations) |
| Stripe | $0 fixed (2.9% + 30¢/sale) |
| Zoom Pro | $14.99 (assumed existing) |
| Google Workspace | $6 |
| Domain | ~$1 ($12/year) |
| **Total fixed** | **~$22/mo** |

---

## Open decisions (Rabbi to confirm)

- Group coaching session price + cohort size + cadence (drives `events.price_cents`, capacity).
- Whether to send rabbi a Slack/email alert on every purchase, or only daily digest.
- Whether subscribers table is admin-broadcast only, or auto-sends a confirmation drip.
- Cancellation/refund policy text for the access page footer.

---

## Out of scope for Phase B

- Server-side rendering — site stays static.
- Mobile app — PWA via the existing `site.webmanifest` is enough for now.
- 1:1 coaching booking — `lets-talk.html` + Calendly handles this; we don't need to rebuild it.
- Course platform — explicitly deferred; group sessions are the MVP.
