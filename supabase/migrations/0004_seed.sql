-- ============================================================
-- Seed data — mirrors what's currently hardcoded in the HTML
-- so once Phase B is wired, the live site can pull from these rows.
-- ============================================================

-- ----- pages -----
insert into pages (slug, title, hero_eyebrow, hero_heading, hero_lead, hero_cta_label, body_md)
values
  (
    'home',
    'Rabbi Shmuel Goldstein — Torah-Based Life & Relationship Coaching',
    'Life & Relationship Coaching',
    'A better life begins with how you live it.',
    'Honest conversation. Practical tools. The courage to create more meaningful relationships—with others and with yourself.',
    'Book a conversation',
    null
  ),
  (
    'about',
    'About Rabbi Shmuel Goldstein',
    'About Rabbi Goldstein',
    'Torah, presence, and practical wisdom.',
    'A rabbi, coach, and author helping people across the Torah community move forward with clarity, confidence, and purpose.',
    'Schedule a Discovery Call',
    null
  ),
  (
    'approach',
    'The Approach — Less Venting. More Living.',
    'The Approach',
    'Less venting. More living.',
    'Coaching with Shmuel is warm, direct, and grounded in action.',
    'Book a conversation',
    null
  )
on conflict (slug) do nothing;

-- ----- testimonials -----
insert into testimonials (quote_text, attributed_to, role, category, featured, sort_order) values
  (
    'Shmuel immediately made me feel comfortable—more like guys talking than a counselor/client relationship. He helped me find my inner courage and live with both strength and gentleness. Worth the investment!',
    'Men''s Coaching Client',
    null,
    'mens',
    true,
    20
  ),
  (
    'I was hesitant about the idea of being "coached" at first, but Shmuel Goldstein immediately made me feel comfortable, more like guys talking comfortably than a "counselor/client" relationship. As a result of working with Shmuel, I''ve learned much about what it means to be a man in today''s world and today''s relationships, and how to integrate that into my daily life and business practices. He helped me find my inner sources of courage, enabling me to step into and live with both strength and gentleness—how to be a true "gentle-man." Worth the investment!',
    'Men''s Coaching Client',
    null,
    'mens',
    true,
    30
  );

-- ----- example shiurim (placeholders — replace with real source IDs once available) -----
insert into shiurim (slug, title, description, source, source_id, source_url, topic, duration_seconds, recorded_at, tags) values
  (
    'parsha-bereishis-finding-yourself',
    'Parsha Bereishis — Finding Yourself in the First Story',
    'A look at how the opening of the Torah holds the keys to seeing who we''re becoming.',
    'youtube',
    'PLACEHOLDER_YT_ID',
    'https://www.youtube.com/watch?v=PLACEHOLDER_YT_ID',
    'parsha',
    1830,
    '2026-10-04',
    array['bereishis', 'self-knowledge']
  ),
  (
    'tefila-deeper-meaning-shemoneh-esrei',
    'Tefila — Deeper Meaning in the Shemoneh Esrei',
    'Patterns in the central prayer that change the way we daven.',
    'vimeo',
    'PLACEHOLDER_VIMEO_ID',
    'https://vimeo.com/PLACEHOLDER_VIMEO_ID',
    'tefila',
    2700,
    '2026-09-12',
    array['tefila', 'shemoneh-esrei']
  );
