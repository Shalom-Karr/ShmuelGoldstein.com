// POST /.netlify/functions/contact
//   - JSON body  ({name, email, subject, message}) → returns JSON
//   - form-encoded body (native form POST)         → 303 → /thank-you.html
// Uses the service-role key so it's immune to the RLS/CSP/UMD-load
// issues that were silently dropping contact-form submissions.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const { sendMail } = require('./_shared/mail');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors(), body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors(), body: 'Method Not Allowed' };

  const contentType = (event.headers['content-type'] || event.headers['Content-Type'] || '').toLowerCase();
  const wantsHtml = !contentType.includes('application/json');

  let name = '', email = '', subject = '', message = '';
  try {
    if (contentType.includes('application/json')) {
      const b = JSON.parse(event.body || '{}');
      name = String(b.name || '').trim();
      email = String(b.email || '').trim();
      subject = String(b.subject || '').trim();
      message = String(b.message || '').trim();
    } else {
      const p = new URLSearchParams(event.body || '');
      if (p.get('bot-field')) return reply(wantsHtml, 200, { ok: true }); // honeypot
      name = String(p.get('name') || '').trim();
      email = String(p.get('email') || '').trim();
      subject = String(p.get('subject') || '').trim();
      message = String(p.get('message') || '').trim();
    }
  } catch {
    return reply(wantsHtml, 400, { error: 'Bad request body' });
  }

  if (!name || name.length > 200) return reply(wantsHtml, 400, { error: 'Name is required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return reply(wantsHtml, 400, { error: 'A valid email is required' });
  if (!message || message.length > 5000) return reply(wantsHtml, 400, { error: 'A message is required' });
  subject = subject.slice(0, 200);

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set');
    return reply(wantsHtml, 500, { error: 'Server not configured' });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/contact_messages`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, subject: subject || null, message }),
  });
  if (res.status !== 201 && res.status !== 200) {
    console.error('contact insert failed', res.status, await res.text());
    return reply(wantsHtml, 502, { error: 'Could not save your message' });
  }

  // Notify the Rabbi (best-effort). Reply-To is the sender so he can reply
  // straight from his inbox.
  try {
    const to = process.env.CONTACT_NOTIFY_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;
    if (to) {
      await sendMail({
        to,
        replyTo: email,
        subject: `New message${subject ? `: ${subject}` : ''} — from ${name}`,
        text: `${name} <${email}> wrote via the Let's Talk form:\n\n${message}\n\n—\nManage: https://shmuelgoldstein.com/admin/messages.html`,
      });
    }
  } catch (err) {
    console.warn('contact notify email failed', err && err.message);
  }

  return reply(wantsHtml, 200, { ok: true });
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
  return { statusCode, headers: { ...cors(), 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
};
