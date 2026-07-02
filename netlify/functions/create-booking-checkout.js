// POST { session_type_id, starts_at } + Authorization: Bearer <user JWT>
// → { url } for Stripe hosted Checkout. Validates the slot against the
// Rabbi's recurring availability (America/New_York wall clock), checks
// conflicts, inserts a 'pending' booking that holds the slot for 30
// minutes, then mints the Checkout Session. The webhook flips it to paid.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

const LEAD_TIME_MS = 2 * 60 * 60 * 1000;   // no booking closer than 2h out
const HORIZON_MS = 60 * 864e5;             // or more than 60 days out
const HOLD_MINUTES = 30;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Weekday + minutes-since-midnight of an instant, in America/New_York.
function nyParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return { dow, minutes: (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10) };
}

const timeToMinutes = (t) => {
  const [h, m] = String(t).split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SERVICE || !ANON) return json(500, { error: 'Server not configured' });
  if (!process.env.STRIPE_SECRET_KEY) return json(500, { error: 'Payments not configured' });

  // --- authenticate the user (any signed-in account) ---
  const raw = event.headers.authorization || event.headers.Authorization || '';
  const jwt = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!jwt) return json(401, { error: 'Please sign in to book a session' });
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  });
  if (!userRes.ok) return json(401, { error: 'Session expired — please sign in again' });
  const user = await userRes.json();
  if (!user.email) return json(401, { error: 'Account has no email' });

  // --- parse + basic validation ---
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const typeId = String(body.session_type_id || '').trim();
  const startsAt = new Date(body.starts_at || '');
  if (!typeId || isNaN(startsAt.getTime())) return json(400, { error: 'session_type_id and starts_at are required' });
  const now = Date.now();
  if (startsAt.getTime() < now + LEAD_TIME_MS) return json(409, { error: 'That time is too soon — pick a slot at least 2 hours out' });
  if (startsAt.getTime() > now + HORIZON_MS) return json(409, { error: 'That time is too far out' });

  const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  // --- session type ---
  const stRes = await fetch(
    `${SUPABASE_URL}/rest/v1/session_types?id=eq.${encodeURIComponent(typeId)}&active=eq.true&select=id,name,description,duration_minutes,price_cents&limit=1`,
    { headers: svcHeaders }
  );
  if (!stRes.ok) return json(500, { error: 'Session type lookup failed' });
  const st = (await stRes.json())[0];
  if (!st) return json(404, { error: 'That session type is no longer offered' });

  // --- slot must sit inside a recurring availability window ---
  const rulesRes = await fetch(`${SUPABASE_URL}/rest/v1/availability_rules?select=day_of_week,start_time,end_time`, { headers: svcHeaders });
  if (!rulesRes.ok) return json(500, { error: 'Availability lookup failed' });
  const rules = await rulesRes.json();
  const { dow, minutes } = nyParts(startsAt);
  const fits = rules.some((r) => {
    if (r.day_of_week !== dow) return false;
    const start = timeToMinutes(r.start_time);
    const end = timeToMinutes(r.end_time);
    return minutes >= start && minutes + st.duration_minutes <= end && (minutes - start) % st.duration_minutes === 0;
  });
  if (!fits) return json(409, { error: 'That time is not in the available schedule' });

  // --- release stale holds, then check conflicts (overlap window) ---
  const staleCutoff = new Date(now - HOLD_MINUTES * 60000).toISOString();
  await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?status=eq.pending&created_at=lt.${encodeURIComponent(staleCutoff)}`,
    { method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'expired' }) }
  );

  const windowStart = new Date(startsAt.getTime() - 4 * 3600e3).toISOString();
  const slotEnd = startsAt.getTime() + st.duration_minutes * 60000;
  const conflictRes = await fetch(
    `${SUPABASE_URL}/rest/v1/bookings?select=starts_at,duration_minutes&status=in.(pending,paid)&starts_at=gte.${encodeURIComponent(windowStart)}&starts_at=lt.${encodeURIComponent(new Date(slotEnd).toISOString())}`,
    { headers: svcHeaders }
  );
  if (!conflictRes.ok) return json(500, { error: 'Conflict check failed' });
  const overlaps = (await conflictRes.json()).some((b) => {
    const bStart = new Date(b.starts_at).getTime();
    const bEnd = bStart + (b.duration_minutes || 60) * 60000;
    return bStart < slotEnd && bEnd > startsAt.getTime();
  });
  if (overlaps) return json(409, { error: 'Sorry — that slot was just taken. Pick another time.' });

  // --- hold the slot ---
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
    method: 'POST',
    headers: { ...svcHeaders, Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: user.id,
      session_type_id: st.id,
      email: user.email,
      name: (user.user_metadata && user.user_metadata.full_name) || null,
      starts_at: startsAt.toISOString(),
      duration_minutes: st.duration_minutes,
      price_cents: st.price_cents,
      status: 'pending',
    }),
  });
  if (ins.status === 409) return json(409, { error: 'Sorry — that slot was just taken. Pick another time.' });
  if (!ins.ok) {
    console.error('booking insert failed', ins.status, await ins.text());
    return json(500, { error: 'Could not hold the slot' });
  }
  const booking = (await ins.json())[0];

  // --- Stripe Checkout ---
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const origin = process.env.URL || 'https://shmuelgoldstein.com';
  const when = startsAt.toLocaleString('en-US', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/New_York',
  });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: st.price_cents,
          product_data: { name: st.name, description: `${when} (ET) · ${st.duration_minutes} minutes` },
        },
      }],
      metadata: { booking_id: booking.id },
      success_url: `${origin}/book?checkout=success`,
      cancel_url: `${origin}/book?checkout=cancelled`,
      expires_at: Math.floor(now / 1000) + HOLD_MINUTES * 60,
    });
    return json(200, { url: session.url });
  } catch (err) {
    console.error('stripe session create failed', err && err.message);
    // release the hold so the slot isn't stuck for 30 minutes
    await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${encodeURIComponent(booking.id)}`, {
      method: 'PATCH', headers: { ...svcHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'expired' }),
    });
    return json(502, { error: 'Could not start checkout' });
  }
};
