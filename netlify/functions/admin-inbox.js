// GET /.netlify/functions/admin-inbox            → list latest 25 INBOX msgs
// GET /.netlify/functions/admin-inbox?uid=12345  → fetch one (returns html/text)
// Admin auth required. IMAP creds come from SMTP_USER/SMTP_PASS env.

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { requireAdmin } = require('./_shared/auth');

const MAX_LIST = 50;
const DEFAULT_LIST = 25;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204);
  if (event.httpMethod !== 'GET') return json(405, { error: 'GET only' });

  const a = await requireAdmin(event);
  if (a.error) return json(a.error.status, { error: a.error.message });

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return json(500, { error: 'IMAP not configured' });
  }

  const q = event.queryStringParameters || {};
  const uid = q.uid ? Number(q.uid) : null;
  const limit = Math.max(1, Math.min(MAX_LIST, Number(q.limit) || DEFAULT_LIST));

  const client = new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      if (uid && Number.isFinite(uid)) {
        const msg = await client.fetchOne(String(uid), { source: true, envelope: true, flags: true }, { uid: true });
        if (!msg || !msg.source) return json(404, { error: 'Not found' });
        const parsed = await simpleParser(msg.source);
        return json(200, {
          uid: msg.uid,
          from: addr(parsed.from),
          to: addr(parsed.to),
          cc: addr(parsed.cc),
          subject: parsed.subject || '(no subject)',
          date: parsed.date,
          html: parsed.html || null,
          text: parsed.text || parsed.textAsHtml || '',
          attachments: (parsed.attachments || []).map((at) => ({
            filename: at.filename,
            size: at.size,
            contentType: at.contentType,
          })),
        });
      }

      const total = client.mailbox.exists;
      if (!total) return json(200, { messages: [], total: 0 });
      const start = Math.max(1, total - limit + 1);
      const seq = `${start}:${total}`;
      const list = [];
      for await (const msg of client.fetch(seq, { envelope: true, flags: true, uid: true })) {
        list.push({
          uid: msg.uid,
          from: msg.envelope?.from?.[0] || null,
          subject: msg.envelope?.subject || '(no subject)',
          date: msg.envelope?.date,
          unread: !msg.flags.has('\\Seen'),
        });
      }
      list.reverse();
      return json(200, { messages: list, total });
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error('IMAP error', err && err.message);
    return json(502, { error: 'Inbox unavailable' });
  } finally {
    try { await client.logout(); } catch {}
  }
};

const addr = (a) => {
  if (!a) return null;
  if (Array.isArray(a)) return a.map(addr).filter(Boolean);
  if (a.value && Array.isArray(a.value)) {
    return a.value.map((v) => ({ name: v.name, address: v.address }));
  }
  return { name: a.name, address: a.address };
};

function cors(status) {
  return { statusCode: status, headers: { 'Access-Control-Allow-Origin': 'https://shmuelgoldstein.com', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }, body: '' };
}
function json(status, obj) {
  return { statusCode: status, headers: { 'Access-Control-Allow-Origin': 'https://shmuelgoldstein.com', 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
