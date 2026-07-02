// Zoom Server-to-Server OAuth helper. Reads ZOOM_ACCOUNT_ID /
// ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET; returns { error } when unset so
// callers can degrade gracefully instead of failing the whole request.

async function createZoomMeeting(title, startsAt, durationMinutes) {
  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!accountId || !clientId || !clientSecret) return { error: 'not configured (ZOOM_* env vars missing)' };

  try {
    const tokRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
      {
        method: 'POST',
        headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64') },
      }
    );
    if (!tokRes.ok) return { error: `token request failed (${tokRes.status})` };
    const { access_token } = await tokRes.json();

    const mtgRes = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: title,
        type: 2, // scheduled
        start_time: startsAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        duration: durationMinutes,
        settings: {
          waiting_room: false,
          join_before_host: false,
          mute_upon_entry: true,
          approval_type: 2,
        },
      }),
    });
    if (!mtgRes.ok) return { error: `meeting create failed (${mtgRes.status})` };
    const m = await mtgRes.json();
    return { join_url: m.join_url, password: m.password || null };
  } catch (err) {
    console.error('zoom create failed', err && err.message);
    return { error: 'request error' };
  }
}

module.exports = { createZoomMeeting };
