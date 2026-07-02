// Admin-only diagnostic: proves the Zoom Server-to-Server OAuth app is
// configured, scoped, and activated by minting a token, creating a
// throwaway meeting, and deleting it. Returns a plain-English verdict so
// the Rabbi doesn't have to spend a real booking to find out.

const { requireAdmin } = require('./_shared/auth');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  const gate = await requireAdmin(event);
  if (gate.error) return json(gate.error.status, { error: gate.error.message });

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) {
    return json(200, { ok: false, step: 'env', message: 'Zoom env vars are not all set (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).' });
  }

  // 1) token
  let token;
  try {
    const tokRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64') } }
    );
    const body = await tokRes.json().catch(() => ({}));
    if (!tokRes.ok) {
      return json(200, { ok: false, step: 'token', message: `Token request failed (${tokRes.status}). ${body.reason || body.error || ''} — usually means the app isn't Activated or the credentials are wrong.` });
    }
    token = body.access_token;
  } catch (err) {
    return json(200, { ok: false, step: 'token', message: 'Network error reaching Zoom for a token.' });
  }

  // 2) create a throwaway meeting
  let meetingId, joinUrl;
  try {
    const mRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Config test (safe to ignore)', type: 1 }),
    });
    const body = await mRes.json().catch(() => ({}));
    if (!mRes.ok) {
      return json(200, { ok: false, step: 'scope', message: `Meeting create failed (${mRes.status}). ${body.message || ''} — usually means the "meeting:write" scope isn't added to the app.` });
    }
    meetingId = body.id;
    joinUrl = body.join_url;
  } catch (err) {
    return json(200, { ok: false, step: 'scope', message: 'Network error creating the test meeting.' });
  }

  // 3) clean up (best-effort)
  let cleaned = false;
  try {
    const del = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    cleaned = del.ok || del.status === 204;
  } catch { /* leave it; it's a type-1 instant meeting, harmless */ }

  return json(200, {
    ok: true,
    message: `Zoom is fully configured — a test meeting was created${cleaned ? ' and deleted' : ' (auto-cleanup skipped; harmless)'}. Bookings will auto-create meetings.`,
    sample_join_url: joinUrl || null,
  });
};
