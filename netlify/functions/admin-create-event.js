// Admin-only: creates an event end-to-end — optionally provisions a Zoom
// meeting (Server-to-Server OAuth app; ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID /
// ZOOM_CLIENT_SECRET) and a Stripe Product+Price, then inserts the events
// row via service role. Skips whichever integrations aren't configured and
// says so in the response instead of failing the whole create.

const { requireAdmin } = require('./_shared/auth');
const { createZoomMeeting } = require('./_shared/zoom');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const kebab = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const gate = await requireAdmin(event);
  if (gate.error) return json(gate.error.status, { error: gate.error.message });
  if (!SERVICE) return json(500, { error: 'Server not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

  const title = String(body.title || '').trim();
  const startsAt = new Date(body.starts_at || '');
  const durationMinutes = parseInt(body.duration_minutes, 10) || 60;
  const priceCents = parseInt(body.price_cents, 10);
  if (!title) return json(400, { error: 'Title is required' });
  if (isNaN(startsAt.getTime())) return json(400, { error: 'Valid start date/time is required' });
  if (!Number.isInteger(priceCents) || priceCents < 50) return json(400, { error: 'Price must be at least $0.50' });

  const notes = [];
  let zoomJoinUrl = String(body.zoom_join_url || '').trim() || null;
  let zoomPassword = String(body.zoom_password || '').trim() || null;
  let stripePriceId = null;

  if (body.create_zoom) {
    const zoom = await createZoomMeeting(title, startsAt, durationMinutes);
    if (zoom.error) notes.push(`Zoom: ${zoom.error} — add the link manually or retry.`);
    else {
      zoomJoinUrl = zoom.join_url;
      zoomPassword = zoom.password;
      notes.push('Zoom meeting created.');
    }
  }

  if (body.create_stripe_price) {
    if (!process.env.STRIPE_SECRET_KEY) {
      notes.push('Stripe: STRIPE_SECRET_KEY not set — checkout will use the inline price instead.');
    } else {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const product = await stripe.products.create({
          name: title,
          ...(body.description ? { description: String(body.description).slice(0, 500) } : {}),
        });
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: priceCents,
          currency: 'usd',
        });
        stripePriceId = price.id;
        notes.push(`Stripe price created (${price.id}).`);
      } catch (err) {
        console.error('stripe price create failed', err && err.message);
        notes.push('Stripe: price creation failed — checkout will use the inline price instead.');
      }
    }
  }

  const row = {
    slug: kebab(body.slug || `${title}-${startsAt.toISOString().slice(0, 10)}`),
    title,
    description: String(body.description || '').trim() || null,
    starts_at: startsAt.toISOString(),
    duration_minutes: durationMinutes,
    price_cents: priceCents,
    capacity: body.capacity ? parseInt(body.capacity, 10) : null,
    zoom_join_url: zoomJoinUrl,
    zoom_password: zoomPassword,
    stripe_price_id: stripePriceId,
    status: ['draft', 'upcoming'].includes(body.status) ? body.status : 'draft',
  };

  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  let ins = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
    method: 'POST', headers, body: JSON.stringify(row),
  });
  if (ins.status === 409) {
    row.slug = `${row.slug}-${Date.now().toString(36).slice(-4)}`;
    ins = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: 'POST', headers, body: JSON.stringify(row),
    });
  }
  if (!ins.ok) {
    console.error('event insert failed', ins.status, await ins.text());
    return json(500, { error: 'Event insert failed' + (notes.length ? ` (note: ${notes.join(' ')})` : '') });
  }
  const created = (await ins.json())[0];
  return json(200, { event: created, notes });
};

