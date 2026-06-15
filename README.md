# ShmuelGoldstein.com

Static marketing site for Rabbi Shmuel Goldstein's Torah-based coaching practice. Vanilla HTML / CSS / JS with TailwindCSS via CDN — no build step.

## Run locally

```
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Structure

```
.
├── index.html          # Home
├── coaching.html       # Coaching (incl. group coaching anchor)
├── approach.html       # Methodology
├── about.html          # Bio + credentials
├── stories.html        # Long-form testimonials
├── lets-talk.html      # Calendly + email capture
├── assets/             # Images (hero portrait, future photos)
├── css/                # styles.css — brand tokens + Tailwind overrides
├── js/                 # main.js (nav, year), forms.js (email + Calendly)
├── content/            # bio.md and other reusable copy sources
└── chatgpt/            # Approved Lovable.dev design mockups (reference only)
```

## Pages

- **index.html** — Hero, approach teaser, three services, two client-story cards, CTA.
- **coaching.html** — Full services breakdown; group coaching at `#group`.
- **approach.html** — "Less venting. More living." methodology deep-dive.
- **about.html** — Biography from `content/bio.md` + credentials.
- **stories.html** — Full testimonials from `Testimonials.txt` rendered as quote cards.
- **lets-talk.html** — Calendly embed + email capture for the Discovery Call funnel.

## Content sources

- `Testimonials.txt` — long-form client stories (plain text, blank-line separated).
- `content/bio.md` — canonical biography copy.
- `OverView.md`, `plan.md` — business context and strategy.
- `chatgpt/*.PNG` — approved design mockups; treat as the visual source of truth.

## Design tokens

| Token | Value | Use |
|---|---|---|
| Sand | `#f5ebd9` | Page background |
| Ink | `#1f1a17` | Dark section blocks, body text on sand |
| Terracotta | `#b85c1f` | CTAs, italic accent words, quote glyphs |
| Gold muted | `#a98a4b` | All-caps attribution labels |

- **Display serif**: Cormorant Garamond (Google Fonts), italics for accent words.
- **Body sans**: Inter (Google Fonts), 400/500/600.
- **Eyebrow labels**: Inter, all-caps, letter-spaced.

## Deploy

Static site — deploy to Netlify, Vercel, or GitHub Pages with no build configuration. Just point at the repo root.

## Open items

- Calendly URL (placeholder in `lets-talk.html` until provided).
- Email platform choice (ConvertKit / Mailchimp / Beehiiv) for `js/forms.js`.
- Final domain registration.
