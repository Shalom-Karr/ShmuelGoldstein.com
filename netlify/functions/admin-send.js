// POST /.netlify/functions/admin-send
// Body: { to, subject, html?, text?, replyTo?, cc?, bcc? }
// Requires admin auth. Used by the admin composer.

const { requireAdmin } = require('./_shared/auth');
const { sendMail } = require('./_shared/mail');

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const MAX_RECIPIENTS = 50;
const MAX_BODY_BYTES = 12 * 1024 * 1024; // 12MB — covers ~9MB of base64 attachments + headroom
const MAX_SUBJECT = 240;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_TOTAL = 9 * 1024 * 1024;  // 9MB raw — matches client cap
const ALLOWED_ATT_TYPES = /^(image\/(png|jpeg|gif|webp|svg\+xml)|application\/pdf|text\/plain)$/;

const recent = new Map(); // crude per-user send-rate map; resets on cold start

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(204);
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const a = await requireAdmin(event);
  if (a.error) return json(a.error.status, { error: a.error.message });

  // Rate limit: max 30 sends per admin per minute
  const now = Date.now();
  const userKey = a.user.id;
  const log = (recent.get(userKey) || []).filter((t) => now - t < 60_000);
  if (log.length >= 30) return json(429, { error: 'Rate limit: 30 sends/min' });

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Bad JSON' }); }

  if ((event.body || '').length > MAX_BODY_BYTES) {
    return json(413, { error: 'Body too large' });
  }

  const toList = String(body.to || '')
    .split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!toList.length) return json(400, { error: 'Missing "to"' });
  if (toList.length > MAX_RECIPIENTS) return json(400, { error: `Too many recipients (max ${MAX_RECIPIENTS})` });
  for (const addr of toList) {
    if (!EMAIL_RE.test(addr) || addr.length > 254) {
      return json(400, { error: `Invalid recipient: ${addr}` });
    }
  }

  const subject = String(body.subject || '').slice(0, MAX_SUBJECT).trim();
  if (!subject) return json(400, { error: 'Missing subject' });

  const text = body.text ? String(body.text) : undefined;
  const html = body.html ? String(body.html) : undefined;
  if (!text && !html) return json(400, { error: 'Missing body (text or html)' });

  const replyTo = body.replyTo && EMAIL_RE.test(String(body.replyTo)) ? String(body.replyTo) : undefined;

  let attachments;
  if (Array.isArray(body.attachments) && body.attachments.length) {
    if (body.attachments.length > MAX_ATTACHMENTS) {
      return json(400, { error: `Too many attachments (max ${MAX_ATTACHMENTS})` });
    }
    let total = 0;
    attachments = [];
    for (const a of body.attachments) {
      if (!a || typeof a !== 'object') return json(400, { error: 'Invalid attachment' });
      const filename = String(a.filename || '').replace(/[^\w.\- ]/g, '_').slice(0, 120);
      const contentType = String(a.contentType || 'application/octet-stream');
      const content = String(a.content || '');
      const cid = a.cid ? String(a.cid).replace(/[^\w.-]/g, '').slice(0, 80) : undefined;
      if (!ALLOWED_ATT_TYPES.test(contentType)) {
        return json(400, { error: `Attachment type not allowed: ${contentType}` });
      }
      // base64 decoded size = ceil(len*3/4) — minus '=' padding. Approximate is fine.
      const rawBytes = Math.floor(content.length * 0.75);
      total += rawBytes;
      if (total > MAX_ATTACHMENT_TOTAL) {
        return json(400, { error: 'Attachments exceed 9MB total' });
      }
      attachments.push({ filename, contentType, content, encoding: 'base64', cid });
    }
  }

  try {
    const info = await sendMail({
      to: toList,
      subject,
      html,
      text,
      replyTo: replyTo || a.admin.email,
      attachments,
    });
    log.push(now); recent.set(userKey, log);
    return json(200, { ok: true, accepted: info.accepted, rejected: info.rejected });
  } catch (err) {
    console.error('admin-send failed', err && err.message);
    return json(502, { error: 'Send failed' });
  }
};

function cors(status) {
  return { statusCode: status, headers: { 'Access-Control-Allow-Origin': sameOrigin(), 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
}
function json(status, obj) {
  return { statusCode: status, headers: { 'Access-Control-Allow-Origin': sameOrigin(), 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
function sameOrigin() { return 'https://shmuelgoldstein.com'; }
