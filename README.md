# ShmuelGoldstein.com

Static marketing site for Rabbi Shmuel Goldstein's Torah-based coaching practice. Vanilla HTML / CSS / JS, no build step. Deployed on Netlify at **<https://shmuelgoldstein.netlify.app>**.

## Run locally

Preferred — uses the same proxy as production, including Netlify Forms detection and the redirect rules in `netlify.toml`:

```sh
netlify dev
```

Opens on <http://localhost:8888>. Requires the Netlify CLI:

```sh
npm install -g netlify-cli
netlify login            # one-time
netlify link             # link this folder to the shmuelgoldstein site
```

Fallback — pure static server (no form emulation, no redirects):

```sh
python -m http.server 8000   # then open http://localhost:8000
```

## Deploy

The Netlify site is connected to the GitHub repo. Every push to `main` triggers an automatic production deploy. To deploy from the CLI ad-hoc:

```sh
netlify deploy --prod --dir .
```

To set or update environment variables (used by Phase B Netlify Functions):

```sh
netlify env:set STRIPE_SECRET_KEY sk_test_...
netlify env:list
```

## Structure

```
.
├── index.html              Home — hero, approach teaser, services, testimonial carousel, CTA
├── coaching.html           Coaching offerings (Group at #group)
├── approach.html           "Less venting. More living." methodology
├── about.html              Bio, journey narrative, philosophy + values, books
├── shiurim.html            Torah classes — YouTube / Vimeo / Supabase video player
├── stories.html            Long-form client testimonials
├── lets-talk.html          Discovery Call booking (Calendly placeholder)
│
├── assets/
│   ├── rabbi-goldstein.jpg
│   └── favicons/           favicon.ico, *-16/32.png, apple-touch-icon, android-chrome, site.webmanifest
├── css/styles.css          Design system, animations, components
├── js/
│   ├── main.js             Nav, scroll-reveal, sticky header, year stamp
│   ├── forms.js            Newsletter form (Netlify Forms POST)
│   ├── carousel.js         Swiper-driven testimonial carousel
│   └── shiurim.js          Topic filters + modal video player
│
├── supabase/               Phase B database scaffolding (see supabase/README.md)
│   ├── README.md
│   └── migrations/
│       ├── 0001_init.sql        Tables + helpers
│       ├── 0002_rls.sql         Row Level Security policies
│       ├── 0003_storage.sql     assets + shiurim buckets (both public)
│       └── 0004_seed.sql        Seed rows mirroring current copy
│
├── docs/PHASE-B.md         Full Phase B implementation plan
└── netlify.toml            Build/dev config, security headers, redirects
```

## Design tokens

| Token | Value | Use |
|---|---|---|
| Sand | `#f1e5cf` | Page background |
| Paper | `#faf3e3` | Lighter section blocks |
| Ink | `#1a1614` | Dark section blocks, body text |
| Terracotta | `#b85c1f` | CTAs, italic accent words |
| Gold | `#a98a4b` | Eyebrow labels on ink |

Fonts (Google Fonts):
- **Display serif**: Instrument Serif (regular + italic accent)
- **Body sans**: Inter (300–700)
- **Eyebrow / labels**: JetBrains Mono (400–500, letter-spaced)

## Netlify Forms

The newsletter form (bottom of every page) is wired to Netlify Forms — no backend needed. Submissions land in the Netlify dashboard under **Forms → newsletter**. The form uses:

- `name="newsletter"` + hidden `form-name`
- `data-netlify="true"` for build-time detection
- `data-netlify-honeypot="bot-field"` for spam filtering
- `js/forms.js` posts via `fetch('/')` so the inline success message stays in place

In local dev (`localhost`) the form falls back to a friendly no-op message instead of trying to POST.

## Phase B (backend, payments, admin)

Not yet built — design and migrations are in:
- `docs/PHASE-B.md` — stack rationale, data flow, env vars, build order, costs
- `supabase/` — SQL migrations ready to apply once the Supabase project exists
- `rabbi-outreach-email.txt` *(local only, gitignored)* — what we need from the rabbi to wire it up

## Open items

- Calendly URL (placeholder in `lets-talk.html` until provided).
- Real domain → swap `shmuelgoldstein.netlify.app` for `shmuelgoldstein.com`.
- Replace the four placeholder shiurim with real YouTube / Vimeo IDs.
- Supabase project + Stripe account + Google Workspace app password (see `docs/PHASE-B.md`).
