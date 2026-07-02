// POST { event_id } → { url } — mints a Stripe hosted Checkout Session
// for an upcoming event. Price comes from the event row (stripe_price_id
// when set, otherwise inline price_data from price_cents).

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: 'Payments not configured' });
  if (!SERVICE) return json(500, { error: 'Database not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const eventId = String(body.event_id || '').trim();
  if (!eventId) return json(400, { error: 'event_id required' });

  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  const evRes = await fetch(
    `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=id,slug,title,description,starts_at,price_cents,capacity,status,stripe_price_id&limit=1`,
    { headers }
  );
  if (!evRes.ok) {
    console.error('event lookup failed', evRes.status, await evRes.text());
    return json(500, { error: 'Event lookup failed' });
  }
  const rows = await evRes.json();
  const ev = rows[0];
  if (!ev) return json(404, { error: 'Event not found' });
  if (ev.status !== 'upcoming') return json(409, { error: 'This event is not open for booking' });
  if (!ev.stripe_price_id && !(Number.isInteger(ev.price_cents) && ev.price_cents > 0)) {
    return json(409, { error: 'This event has no price configured' });
  }

  if (ev.capacity != null) {
    const cRes = await fetch(
      `${SUPABASE_URL}/rest/v1/purchases?event_id=eq.${encodeURIComponent(ev.id)}&select=id`,
      { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } }
    );
    const range = cRes.headers.get('content-range') || '';
    const total = parseInt(range.split('/')[1], 10);
    if (Number.isFinite(total) && total >= ev.capacity) {
      return json(409, { error: 'This event is sold out' });
    }
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const origin = process.env.URL || 'https://shmuelgoldstein.com';

  const lineItem = ev.stripe_price_id
    ? { price: ev.stripe_price_id, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: ev.price_cents,
          product_data: {
            name: ev.title,
            ...(ev.description ? { description: ev.description.slice(0, 500) } : {}),
          },
        },
      };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [lineItem],
      metadata: { event_id: ev.id },
      // {CHECKOUT_SESSION_ID} is a Stripe template token — must stay unencoded
      success_url: `${origin}/access?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events`,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('stripe session create failed', err && err.message);
    return json(502, { error: 'Could not start checkout' });
  }
};
