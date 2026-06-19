// Shared SMTP transport. Reads SMTP_* env vars set in Netlify env.

const nodemailer = require('nodemailer');

let cached = null;

function getTransport() {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cached;
}

async function sendMail({ to, subject, html, text, replyTo, cc, bcc, attachments }) {
  const t = getTransport();
  if (!t) throw new Error('SMTP not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASS)');
  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
  const fromName = process.env.SMTP_FROM_NAME || 'Rabbi Shmuel Goldstein';
  return t.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to,
    subject,
    html,
    text,
    replyTo,
    cc,
    bcc,
    attachments,
  });
}

module.exports = { sendMail };
