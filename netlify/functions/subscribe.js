// POST /.netlify/functions/subscribe
//   - JSON body  ({"email": "...", "source": "..."}) → returns JSON
//   - form-encoded body (native form POST)           → 303 → /thank-you.html
// Uses the service-role key so this is immune to RLS, CSP, or
// supabase-js UMD-load issues on the client.

const SUPABASE_URL = 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const { sendMail } = require('./_shared/mail');

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

  if (res.status !== 201 && res.status !== 200 && res.status !== 409) {
    const text = await res.text();
    console.error('Supabase insert failed', res.status, text);
    return reply(wantsHtml, 502, { error: 'Upstream insert failed' });
  }
  const duplicate = res.status === 409;

  // Forward to Netlify Forms so the email-notification rule fires too.
  // Validate the Host header is one of our own domains to avoid SSRF.
  const ALLOWED_HOSTS = new Set([
    'shmuelgoldstein.com',
    'www.shmuelgoldstein.com',
    'shmuelgoldstein.netlify.app',
  ]);
  const host = (event.headers.host || event.headers.Host || '').toLowerCase();
  if (host && ALLOWED_HOSTS.has(host)) {
    const formBody = new URLSearchParams({
      'form-name': 'newsletter',
      email,
      source,
    }).toString();
    try {
      await fetch(`https://${host}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
      });
    } catch (err) {
      console.warn('Netlify Forms forward failed', err && err.message);
    }
  }

  // Welcome email — best-effort; never send on duplicate signups so we
  // can't be coerced into spamming an address by replaying the form.
  if (!duplicate) {
    try {
      await sendMail({
        to: email,
        subject: 'Welcome — Rabbi Shmuel Goldstein',
        text: welcomeText(),
        html: welcomeHtml(),
      });
    } catch (err) {
      console.warn('Welcome email failed', err && err.message);
    }
  }

  return reply(wantsHtml, 200, { ok: true, duplicate });
};

const welcomeText = () => `Sholom u'vrocho,

Thank you for joining the list. You'll get one short email a month —
Torah-rooted tools you can put to work that week. No noise, easy
unsubscribe whenever you'd like.

If you ever want to be in touch directly, just reply to this email.

— Rabbi Shmuel Goldstein
shmuelgoldstein.com`;

const welcomeHtml = () => `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,'Times New Roman',serif;color:#1f1a14;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#fffaf2;border:1px solid #e6dccb;border-radius:8px;padding:36px 32px;">
      <tr><td>
        <p style="margin:0 0 18px;color:#7c5a2e;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">Welcome</p>
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#1f1a14;">You're on the list.</h1>
        <p style="margin:0 0 14px;line-height:1.55;">Sholom u'vrocho,</p>
        <p style="margin:0 0 14px;line-height:1.55;">Thank you for joining. You'll get <strong>one short email a month</strong> — Torah-rooted tools you can put to work that week. No noise, easy unsubscribe whenever you'd like.</p>
        <p style="margin:0 0 14px;line-height:1.55;">If you ever want to be in touch directly, just reply to this email.</p>
        <p style="margin:24px 0 0;line-height:1.55;">— Rabbi Shmuel Goldstein<br><a href="https://shmuelgoldstein.com" style="color:#b85c1f;text-decoration:none;">shmuelgoldstein.com</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

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
