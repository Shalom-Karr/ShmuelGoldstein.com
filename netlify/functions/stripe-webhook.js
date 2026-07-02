// Stripe webhook — verifies signature, records the purchase, emails the
// buyer their access details. Idempotent on stripe_session_id so Stripe
// retries can't double-insert or double-send.

const { sendMail } = require('./_shared/mail');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  const sk = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sk || !whsec || !SERVICE) return json(500, { error: 'Webhook not configured' });

  const stripe = require('stripe')(sk);
  const sig = event.headers['stripe-signature'];
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

  let evt;
  try {
    evt = stripe.webhooks.constructEvent(raw, sig, whsec);
  } catch (err) {
    console.error('signature verification failed', err && err.message);
    return json(400, { error: 'Invalid signature' });
  }

  if (evt.type !== 'checkout.session.completed' && evt.type !== 'checkout.session.async_payment_succeeded') {
    return json(200, { received: true });
  }

  const s = evt.data.object;
  if (s.payment_status !== 'paid') return json(200, { received: true });

  const eventId = s.metadata && s.metadata.event_id;
  const email = (s.customer_details && s.customer_details.email) || s.customer_email;
  const name = s.customer_details && s.customer_details.name;
  if (!email) {
    console.error('completed session missing email', s.id);
    return json(200, { received: true });
  }

  const headers = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json',
  };

  // Idempotent insert: ignore-duplicates on the unique stripe_session_id.
  const ins = await fetch(
    `${SUPABASE_URL}/rest/v1/purchases?on_conflict=stripe_session_id`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        event_id: eventId || null,
        email,
        name: name || null,
        stripe_session_id: s.id,
        amount_paid_cents: s.amount_total,
        currency: s.currency || 'usd',
      }),
    }
  );
  if (!ins.ok) {
    console.error('purchase insert failed', ins.status, await ins.text());
    return json(500, { error: 'Purchase insert failed' }); // 500 → Stripe retries
  }
  const inserted = await ins.json();
  if (!inserted.length) {
    // Duplicate delivery — already recorded (and emailed) on a previous attempt.
    return json(200, { received: true, duplicate: true });
  }
  const purchase = inserted[0];

  let ev = null;
  if (eventId) {
    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=title,starts_at,duration_minutes,zoom_join_url,zoom_password&limit=1`,
      { headers }
    );
    if (evRes.ok) ev = (await evRes.json())[0] || null;
  }

  try {
    await sendMail({
      to: email,
      subject: ev ? `You're in: ${ev.title}` : 'Your payment was received',
      text: confirmationText(name, ev, s.id),
      html: confirmationHtml(name, ev, s.id),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/purchases?id=eq.${encodeURIComponent(purchase.id)}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ confirmation_sent_at: new Date().toISOString() }),
    });
  } catch (err) {
    // Purchase is recorded; access page still works via session_id.
    console.error('confirmation email failed', purchase.id, err && err.message);
  }

  return json(200, { received: true });
};

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/New_York' }) + ' (ET)';
  } catch { return iso; }
}

function confirmationText(name, ev, sessionId) {
  const access = `https://shmuelgoldstein.com/access?session_id=${sessionId}`;
  if (!ev) {
    return `Sholom${name ? ' ' + name : ''},\n\nYour payment was received. Your access page: ${access}\n\n— Rabbi Shmuel Goldstein\nshmuelgoldstein.com`;
  }
  const join = ev.zoom_join_url
    ? `\nJoin link: ${ev.zoom_join_url}${ev.zoom_password ? `\nPasscode: ${ev.zoom_password}` : ''}`
    : '';
  return `Sholom${name ? ' ' + name : ''},

You're confirmed for ${ev.title}.
It starts on ${fmtWhen(ev.starts_at)}.${join}

Your access page (join link + calendar file): ${access}

Looking forward to learning together.

— Rabbi Shmuel Goldstein
shmuelgoldstein.com`;
}

function confirmationHtml(name, ev, sessionId) {
  const access = `https://shmuelgoldstein.com/access?session_id=${encodeURIComponent(sessionId)}`;
  const title = ev ? ev.title : 'Your payment was received';
  const when = ev ? fmtWhen(ev.starts_at) : '';
  const joinBtn = ev && ev.zoom_join_url
    ? `<p style="margin:24px 0;"><a href="${ev.zoom_join_url}" style="display:inline-block;background:#b85c1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;">Join the session</a></p>${ev.zoom_password ? `<p style="margin:0 0 14px;color:#555;">Passcode: <strong>${esc(ev.zoom_password)}</strong></p>` : ''}`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,serif;color:#1f1a14;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fffaf2;border:1px solid #e6dccb;border-radius:8px;padding:36px 32px;">
      <tr><td>
        <p style="margin:0 0 18px;color:#7c5a2e;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">Confirmed</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${esc(title)}</h1>
        <p style="margin:0 0 6px;">Sholom${name ? ' ' + esc(name) : ''},</p>
        ${when ? `<p style="margin:0 0 14px;line-height:1.55;">Your session starts on <strong>${esc(when)}</strong>.</p>` : ''}
        ${joinBtn}
        <p style="margin:0 0 14px;line-height:1.55;"><a href="${access}" style="color:#b85c1f;">Open your access page</a> for the join link and a calendar file.</p>
        <p style="margin:24px 0 0;line-height:1.55;">— Rabbi Shmuel Goldstein</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
