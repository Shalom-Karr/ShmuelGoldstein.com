// Scheduled: every 30 min.
// For each paid purchase whose event starts within the next 24h
// AND reminder_sent_at IS NULL, send a reminder and stamp the row.

const { schedule } = require('@netlify/functions');
const { sendMail } = require('./_shared/mail');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://pxxifzbljxnbivxkuvrf.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const handler = async () => {
  if (!SERVICE) {
    console.error('SUPABASE_SERVICE_ROLE_KEY missing');
    return { statusCode: 500 };
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Use a Supabase embed to join purchases → events server-side.
  const url = `${SUPABASE_URL}/rest/v1/purchases?select=id,email,name,reminder_sent_at,event:events!inner(id,title,starts_at,duration_minutes,zoom_join_url,zoom_password)&reminder_sent_at=is.null&events.starts_at=gte.${encodeURIComponent(now.toISOString())}&events.starts_at=lte.${encodeURIComponent(in24h.toISOString())}`;

  const res = await fetch(url, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) {
    console.error('purchases query failed', res.status, await res.text());
    return { statusCode: 500 };
  }
  const rows = await res.json();
  let sent = 0;
  let failed = 0;

  for (const r of rows) {
    if (!r.event) continue;
    try {
      await sendMail({
        to: r.email,
        subject: `Reminder: ${r.event.title} — starts soon`,
        text: reminderText(r),
        html: reminderHtml(r),
      });
      const patch = await fetch(`${SUPABASE_URL}/rest/v1/purchases?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'PATCH',
        headers: {
          apikey: SERVICE,
          Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ reminder_sent_at: new Date().toISOString() }),
      });
      if (!patch.ok) {
        console.error('reminder stamp failed', r.id, patch.status);
        failed++;
        continue;
      }
      sent++;
    } catch (err) {
      failed++;
      console.error('reminder send failed', r.id, err && err.message);
    }
  }

  console.log(`reminders: checked=${rows.length} sent=${sent} failed=${failed}`);
  return { statusCode: 200, body: JSON.stringify({ checked: rows.length, sent, failed }) };
};

function fmtWhen(iso) {
  try {
    return new Date(iso).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
  } catch { return iso; }
}

function reminderText(r) {
  const when = fmtWhen(r.event.starts_at);
  const join = r.event.zoom_join_url
    ? `\nJoin link: ${r.event.zoom_join_url}${r.event.zoom_password ? `\nPasscode: ${r.event.zoom_password}` : ''}`
    : '';
  return `Sholom${r.name ? ' ' + r.name : ''},

This is a friendly reminder about ${r.event.title}.
It starts on ${when}.${join}

Looking forward to learning together.

— Rabbi Shmuel Goldstein
shmuelgoldstein.com`;
}

function reminderHtml(r) {
  const when = fmtWhen(r.event.starts_at);
  const joinBtn = r.event.zoom_join_url
    ? `<p style="margin:24px 0;"><a href="${r.event.zoom_join_url}" style="display:inline-block;background:#b85c1f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;">Join the session</a></p>${r.event.zoom_password ? `<p style="margin:0 0 14px;color:#555;">Passcode: <strong>${esc(r.event.zoom_password)}</strong></p>` : ''}`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f1ea;font-family:Georgia,serif;color:#1f1a14;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f5f1ea;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#fffaf2;border:1px solid #e6dccb;border-radius:8px;padding:36px 32px;">
      <tr><td>
        <p style="margin:0 0 18px;color:#7c5a2e;letter-spacing:0.12em;font-size:12px;text-transform:uppercase;">Reminder</p>
        <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;">${esc(r.event.title)}</h1>
        <p style="margin:0 0 6px;">Sholom${r.name ? ' ' + esc(r.name) : ''},</p>
        <p style="margin:0 0 14px;line-height:1.55;">Your session starts on <strong>${esc(when)}</strong>.</p>
        ${joinBtn}
        <p style="margin:24px 0 0;line-height:1.55;">— Rabbi Shmuel Goldstein</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

exports.handler = schedule('*/30 * * * *', handler);
