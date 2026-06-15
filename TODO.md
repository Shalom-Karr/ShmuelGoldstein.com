# TODO — ShmuelGoldstein.com

Everything still pending, grouped by who/what we're waiting on.

---

## 1. Waiting on Rabbi Goldstein (credentials in flight)

These were requested in `rabbi-outreach-email.txt` (sent Mon Jun 15 2026). Until they arrive, Phase B can't ship.

- [ ] **Supabase** — project name, login email, and a NEW password
- [ ] **Calendly** — page URL (or login if I'm setting it up)
- [ ] **Stripe** — Publishable key (`pk_live_…`) + Secret key (`sk_live_…`); start with test keys
- [ ] **Google Workspace** — Workspace email + 16-char SMTP app password
- [ ] **Domain** — confirm `shmuelgoldstein.com` is owned/transferable and ready to point at Netlify
- [ ] **Replies to the 16 feedback questions** at the bottom of the email (headline, palette, pricing, Hebrew name, etc.)

---

## 2. Domain & DNS (after rabbi confirms domain ownership)

- [ ] Add `shmuelgoldstein.com` as a custom domain in Netlify dashboard
- [ ] Point DNS at Netlify (apex A records + `www` CNAME) — Netlify provides exact values
- [ ] Verify HTTPS certificate auto-provisions
- [ ] Set `www.shmuelgoldstein.com` → apex 301 redirect (or vice-versa per preference)
- [ ] After domain is live, run Lighthouse + Search Console verification
- [ ] Submit `sitemap.xml` to Google Search Console + Bing Webmaster Tools

Note: every canonical URL, OG tag, and JSON-LD entry already references `https://shmuelgoldstein.com/` — they'll start resolving once DNS flips.

---

## 3. Phase B — Backend (full plan in `docs/PHASE-B.md`)

### 3a. Supabase setup
- [ ] Apply `supabase/migrations/0001_init.sql` → `0002_rls.sql` → `0003_storage.sql` → `0004_seed.sql`
- [ ] Verify all 9 tables exist and seed rows are in `pages` + `testimonials` + `shiurim`
- [ ] Create rabbi's `admins` row pointing at his `auth.users.id`
- [ ] Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Netlify

### 3b. Frontend hydration from Supabase
- [ ] Add `js/config.js` exposing `window.SB = { url, anon }` (injected at build via Netlify env)
- [ ] `index.html` carousel: fetch `testimonials` from Supabase, hydrate Swiper slides (keep static fallback)
- [ ] `shiurim.html`: fetch from `shiurim` table, render cards (keep static fallback)
- [ ] (Optional) Hero copy on each page hydrates from `pages` table by slug

### 3c. Stripe Checkout + Events page
- [ ] Build `netlify/functions/stripe-webhook.js` — verify signature, write to `purchases`, send confirmation via SMTP
- [ ] Build `netlify/functions/create-checkout-session.js` — mints Stripe Checkout from `events.stripe_price_id`
- [ ] Build `events.html` — fetch upcoming events, "Reserve a seat — $X" buttons
- [ ] Build `access.html` — reads `?session_id=`, calls `/api/event-access`, shows Zoom link + password + `.ics` download
- [ ] Configure Stripe webhook endpoint in Stripe dashboard
- [ ] Test full sale flow in test mode end-to-end before flipping to live keys

### 3d. Reminder cron
- [ ] `netlify/functions/send-reminders.js` with `schedule('0 * * * *', …)` — sends 24h reminders, marks `purchases.reminder_sent_at`

### 3e. Admin pages (`/admin/*`)
- [ ] `admin/login.html` — Supabase magic-link
- [ ] `admin/_shared/auth.js` — session check + `is_admin()` gate
- [ ] `admin/events.html` — CRUD events (create, edit, cancel)
- [ ] `admin/testimonials.html` — CRUD testimonials
- [ ] `admin/shiurim.html` — CRUD shiurim + storage uploader
- [ ] `admin/subscribers.html` — list subscribers, broadcast email composer
- [ ] `admin/analytics.html` — Chart.js dashboard from `v_page_analytics`

---

## 4. Content gaps (need rabbi input)

- [ ] **Replace 4 placeholder shiurim** in `shiurim.html` with real YouTube / Vimeo IDs (currently using junk IDs like `dQw4w9WgXcQ`)
- [ ] **Calendly URL** in `lets-talk.html` (currently links to generic `https://calendly.com/`)
- [ ] **Rabbi's contact email** for the 3 contact cards on `lets-talk.html` (currently no `mailto:` — see follow-up below)
- [ ] **Phone number** decision — listed on site, or email/Calendly only?
- [ ] **Group coaching pricing + cohort size + cadence** for the `events` table
- [ ] **Individual coaching pricing** — list publicly, or "let's talk" only?
- [ ] **More testimonials** if available, plus attribution preference (name / initials / generic)
- [ ] **Additional photos** beyond the headshot (teaching, family, sefer launch)
- [ ] **Hebrew form of name** anywhere (e.g., שמואל גולדשטיין under About)?
- [ ] **Book cover images** for the two writing cards on About (currently text-only)
- [ ] **Pre-order link** for *Powerful Patterns in Prayer* if/when available

---

## 5. Follow-up improvements (from site review — non-blocking)

### Done already
- [x] Hero image alt text on all 7 pages
- [x] Sitemap.xml, robots.txt, 404.html
- [x] OG / Twitter Card meta tags
- [x] JSON-LD Person schema (index + about)
- [x] Canonical URLs pointing at `shmuelgoldstein.com`
- [x] Preconnect for Google Fonts + jsdelivr (Swiper)
- [x] Mobile drawer transition delays for items 6 + 7
- [x] Modal video player — better fallback color
- [x] `loading="lazy"` on the bio portrait

### Still to do
- [ ] **Custom OG share image** — 1200×630 with rabbi photo + tagline. Currently using the raw portrait, which platforms will crop awkwardly.
- [ ] **`mailto:` buttons** on the 3 contact cards in `lets-talk.html` — blocked on knowing his real email address
- [ ] **Embed actual Calendly widget** on `lets-talk.html` instead of the stub "Open the calendar" button — blocked on having the real Calendly URL
- [ ] **Eyebrow on light backgrounds** — `.eyebrow.muted { color: var(--gold); }` has weak contrast on `--sand`. Swap to `var(--ink-muted)` or `var(--terracotta)`.
- [ ] **`loading="lazy"` on all shiur card thumbnails** (currently only some — sweep for the rest)
- [ ] **Skip-to-content link** for keyboard accessibility (`<a href="#main">Skip to content</a>` at top of body)
- [ ] **`security.txt`** under `/.well-known/security.txt` with disclosure contact
- [ ] **Dead CSS audit** — `.quote-stack` lingers from before the carousel swap; verify it's still used on `coaching.html` before keeping it
- [ ] **`data-success-msg` on forms** so future Netlify Forms (contact form, etc.) can customize the inline success message

---

## 6. Open design / content questions

- [ ] Do we want a **`/services`** page distinct from `/coaching` (more sales-oriented), or keep them combined?
- [ ] **Speaking / shiurim hosting** inquiries — separate page, or just a section in the contact cards on `/lets-talk`?
- [ ] Do testimonials need a dedicated **video format** (i.e., the rabbi recorded a few short client video clips), or text-only is fine?
- [ ] **Newsletter cadence + voice** — what does the rabbi actually want to send, and how often?

---

## 7. Nice-to-haves (someday)

- [ ] Replace the static placeholder for **Calendly embed** with their live widget (`<script src="https://assets.calendly.com/assets/external/widget.js">`)
- [ ] **Resources / blog** section — articles index pulling from a `articles` Supabase table
- [ ] **Search** — over shiurim + articles via Supabase full-text search
- [ ] **Hebrew toggle** — bilingual site for some sections
- [ ] **Newsletter archive** page — past broadcasts visible as articles
- [ ] **Course platform** — explicitly deferred; revisit after group coaching has paying repeat customers
