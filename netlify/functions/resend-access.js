// POST { email } → re-sends access links for that buyer's current/upcoming
// purchases. Always answers with the same generic 200 so the endpoint can't
// be used to probe which emails have bought seats.

const { sendMail } = require('./_shared/mail');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const GENERIC = { ok: true, message: 'If we have reservations under that email, your access links are on their way.' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SERVICE) return json(500, { error: 'Not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json(400, { error: 'A valid email is required' });
  }

  // Events that are upcoming or started within the last 3 hours (may be live).
  const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const url = `${SUPABASE_URL}/rest/v1/purchases?select=stripe_session_id,name,event:events!inner(title,starts_at)&email=eq.${encodeURIComponent(email)}&events.starts_at=gte.${encodeURIComponent(cutoff)}&order=created_at.desc&limit=10`;

  const res = await fetch(url, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) {
    console.error('resend lookup failed', res.status, await res.text());
    return json(200, GENERIC); // don't leak backend state either
  }
  const rows = (await res.json()).filter((r) => r.event);
  if (!rows.length) {
    // Still email the address — only the inbox owner sees it, and it saves a
    // confused buyer (typo'd email, different address) from waiting on nothing.
    try {
      await sendMail({
        to: email,
        subject: 'No reservation found under this email',
        text: `Sholom,

Someone (hopefully you) asked us to re-send session access links for this email address, but we don't have any current or upcoming reservations under it.

If you booked with a different email, try that one at https://shmuelgoldstein.com/events#find-session — or reply to this email and we'll track it down.

If this wasn't you, you can safely ignore this message.

— Rabbi Shmuel Goldstein
shmuelgoldstein.com`,
        html: noReservationHtml(),
      });
    } catch (err) {
      console.error('no-reservation email failed', err && err.message);
    }
    return json(200, GENERIC);
  }

  const links = rows.map((r) => ({
    title: r.event.title,
    when: fmtWhen(r.event.starts_at),
    url: `https://shmuelgoldstein.com/access?session_id=${encodeURIComponent(r.stripe_session_id)}`,
  }));

  try {
    await sendMail({
      to: email,
      subject: links.length === 1 ? `Your access link: ${links[0].title}` : 'Your session access links',
      text: linksText(rows[0].name, links),
      html: linksHtml(rows[0].name, links),
    });
  } catch (err) {
    console.error('resend email failed', err && err.message);
  }
  return json(200, GENERIC);
};

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/New_York' }) + ' (ET)';
  } catch { return iso; }
}

function linksText(name, links) {
  const list = links.map((l) => `• ${l.title}\n  ${l.when}\n  ${l.url}`).join('\n\n');
  return `Sholom${name ? ' ' + name : ''},

Here ${links.length === 1 ? 'is your access link' : 'are your access links'}:

${list}

Each link opens your seat's access page with the Zoom join link and a calendar file.

— Rabbi Shmuel Goldstein
shmuelgoldstein.com`;
}

function linksHtml(name, links) {
  const items = links.map((l) =>
    `<p style="margin:0 0 18px;line-height:1.5;"><strong>${esc(l.title)}</strong><br>${esc(l.when)}<br><a href="${l.url}" style="color:#b85c1f;">Open your access page</a></p>`
  ).join('');
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,serif;color:#1f1a14;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fffaf2;border:1px solid #e6dccb;border-radius:8px;padding:36px 32px;">
      <tr><td>
        <p style="margin:0 0 18px;color:#7c5a2e;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">Your Sessions</p>
        <p style="margin:0 0 16px;">Sholom${name ? ' ' + esc(name) : ''},</p>
        ${items}
        <p style="margin:24px 0 0;line-height:1.55;">— Rabbi Shmuel Goldstein</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function noReservationHtml() {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,serif;color:#1f1a14;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fffaf2;border:1px solid #e6dccb;border-radius:8px;padding:36px 32px;">
      <tr><td>
        <p style="margin:0 0 18px;color:#7c5a2e;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">Session Lookup</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">No reservation found under this email</h1>
        <p style="margin:0 0 14px;line-height:1.55;">Someone (hopefully you) asked us to re-send session access links for this address, but we don't have any current or upcoming reservations under it.</p>
        <p style="margin:0 0 14px;line-height:1.55;">If you booked with a different email, <a href="https://shmuelgoldstein.com/events#find-session" style="color:#b85c1f;">try that one here</a> — or just reply to this email and we'll track it down.</p>
        <p style="margin:0 0 14px;line-height:1.55;color:#555;">If this wasn't you, you can safely ignore this message.</p>
        <p style="margin:24px 0 0;line-height:1.55;">— Rabbi Shmuel Goldstein</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
