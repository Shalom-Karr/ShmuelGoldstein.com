// GET ?session_id=cs_… → event access details for a completed purchase.
// The Stripe session id acts as the bearer proof-of-purchase; Zoom
// credentials are only released for a session that exists in purchases.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!SERVICE) return json(500, { error: 'Not configured' });

  const sessionId = String((event.queryStringParameters || {}).session_id || '').trim();
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sessionId)) return json(400, { error: 'Invalid session id' });

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=email,name,event:events(title,description,starts_at,duration_minutes,zoom_join_url,zoom_password)&limit=1`,
    { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
  );
  if (!res.ok) {
    console.error('purchase lookup failed', res.status, await res.text());
    return json(500, { error: 'Lookup failed' });
  }
  const rows = await res.json();
  const p = rows[0];
  if (!p) return json(404, { error: 'No purchase found for this session' });

  return json(200, {
    email: p.email,
    name: p.name,
    event: p.event || null,
  });
};
