// POST /.netlify/functions/subscribe
//   - JSON body  ({"email": "...", "source": "..."}) → returns JSON
//   - form-encoded body (native form POST)           → 303 → /thank-you.html
// Uses the service-role key so this is immune to RLS, CSP, or
// supabase-js UMD-load issues on the client.

const SUPABASE_URL = 'https://pxxifzbljxnbivxkuvrf.supabase.co';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors(), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };
  }

  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  const wantsHtml = !contentType.includes('application/json');

  let email = '';
  let source = 'footer';
  try {
    if (contentType.includes('application/json')) {
      const body = JSON.parse(event.body || '{}');
      email = String(body.email || '').trim().toLowerCase();
      source = String(body.source || 'footer').trim().slice(0, 64);
    } else {
      const params = new URLSearchParams(event.body || '');
      if (params.get('bot-field')) return reply(wantsHtml, 200, { ok: true });
      email = String(params.get('email') || '').trim().toLowerCase();
      source = String(params.get('source') || 'footer').trim().slice(0, 64);
    }
  } catch {
    return reply(wantsHtml, 400, { error: 'Bad request body' });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return reply(wantsHtml, 400, { error: 'Invalid email' });
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY env var is not set');
    return reply(wantsHtml, 500, { error: 'Server not configured' });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/subscribers`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify({ email, source }),
  });

  if (res.status === 201 || res.status === 200 || res.status === 409) {
    return reply(wantsHtml, 200, { ok: true, duplicate: res.status === 409 });
  }

  const text = await res.text();
  console.error('Supabase insert failed', res.status, text);
  return reply(wantsHtml, 502, { error: 'Upstream insert failed' });
};

const cors = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
});

const reply = (asHtml, statusCode, obj) => {
  if (asHtml && statusCode === 200) {
    return { statusCode: 303, headers: { ...cors(), Location: '/thank-you.html' }, body: '' };
  }
  return {
    statusCode,
    headers: { ...cors(), 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  };
};
