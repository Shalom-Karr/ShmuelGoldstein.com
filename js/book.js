// Booking page: session-type picker → open-slot grid (generated from the
// Rabbi's recurring availability, America/New_York) → Stripe Checkout.
// Signed-in users also see their upcoming sessions with Zoom links.
(function () {
  const typeCards = document.getElementById('type-cards');
  if (!typeCards) return;

  const slotsEl = document.getElementById('slots');
  const authBar = document.getElementById('auth-bar');
  const msgEl = document.getElementById('book-msg');
  const mineWrap = document.getElementById('my-sessions-wrap');
  const mineEl = document.getElementById('my-sessions');
  const bannerEl = document.getElementById('checkout-banner');

  const LEAD_MS = 2 * 60 * 60 * 1000;
  const DAYS_AHEAD = 28;
  const NY = 'America/New_York';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );
  const fmtPrice = (c) => {
    const d = c / 100;
    return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
  };

  // ---- America/New_York wall-clock → UTC instant (DST-safe) ----
  const nyOffsetMin = (date) => {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: NY, timeZoneName: 'longOffset' })
      .formatToParts(date).find((p) => p.type === 'timeZoneName').value;
    const m = part.match(/GMT([+-])(\d{2}):(\d{2})/);
    return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0;
  };
  const nyToUtc = (y, monthIdx, day, minutes) => {
    const guess = new Date(Date.UTC(y, monthIdx, day, Math.floor(minutes / 60), minutes % 60));
    let t = new Date(guess.getTime() - nyOffsetMin(guess) * 60000);
    const off2 = nyOffsetMin(t);
    if (off2 !== nyOffsetMin(guess)) t = new Date(guess.getTime() - off2 * 60000);
    return t;
  };
  const nyDateParts = (date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', { timeZone: NY, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' })
        .formatToParts(date).map((p) => [p.type, p.value])
    );
    return {
      y: +parts.year, m: +parts.month, d: +parts.day,
      dow: { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday],
    };
  };
  const timeToMin = (t) => {
    const [h, m] = String(t).split(':');
    return (+h) * 60 + (+m);
  };

  let sb = null;
  let session = null;
  let types = [];
  let rules = [];
  let booked = [];
  let selectedType = null;

  const setMsg = (t) => { if (msgEl) msgEl.textContent = t || ''; };

  // ---- auth bar ----
  const renderAuth = () => {
    if (session) {
      const who = (session.user.user_metadata && session.user.user_metadata.full_name) || session.user.email;
      authBar.innerHTML = `<span style="font-size:0.95rem;">Signed in as <strong>${esc(who)}</strong></span>
        <button type="button" class="text-link" id="sign-out">Sign out</button>`;
      document.getElementById('sign-out').addEventListener('click', async () => {
        await sb.auth.signOut();
        location.reload();
      });
    } else {
      authBar.innerHTML = `<a href="signup.html" class="btn btn-primary">Sign in / create an account</a>
        <span style="font-size:0.9rem; color: var(--ink-soft);">— needed to complete a booking</span>`;
    }
  };

  // ---- my sessions ----
  const loadMine = async () => {
    if (!session) { mineWrap.hidden = true; return; }
    const { data, error } = await sb.from('bookings')
      .select('id, starts_at, duration_minutes, price_cents, status, zoom_join_url, zoom_password, session_type:session_types(name)')
      .in('status', ['paid', 'pending'])
      .gte('starts_at', new Date(Date.now() - 3 * 3600e3).toISOString())
      .order('starts_at', { ascending: true });
    if (error || !data || !data.length) { mineWrap.hidden = true; return; }
    mineWrap.hidden = false;
    mineEl.innerHTML = data.map((b) => {
      const when = new Date(b.starts_at).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      const name = (b.session_type && b.session_type.name) || 'Session';
      const zoom = b.status !== 'paid'
        ? '<p style="margin:0.5rem 0 0; color: var(--ink-soft);">Payment processing — this will confirm shortly.</p>'
        : (b.zoom_join_url
          ? `<p style="margin:0.75rem 0 0;"><a class="btn btn-primary" style="padding:0.5rem 1.1rem; font-size:0.9rem;" href="${esc(b.zoom_join_url)}" target="_blank" rel="noopener">Join Zoom</a>${b.zoom_password ? ` <span style="margin-left:0.75rem;">Passcode: <strong>${esc(b.zoom_password)}</strong></span>` : ''}</p>`
          : '<p style="margin:0.5rem 0 0; color: var(--ink-soft);">Zoom/phone details arrive by email before the session.</p>');
      return `<div class="booking-item">
        <strong>${esc(name)}</strong> · ${fmtPrice(b.price_cents)}<br/>
        <span>${esc(when)}</span> · ${b.duration_minutes} min
        ${zoom}
      </div>`;
    }).join('');
  };

  // ---- session types ----
  const renderTypes = () => {
    if (!types.length) {
      typeCards.innerHTML = '<p style="grid-column: 1/-1; color: var(--ink-soft);">Online booking isn\'t open yet — email <a href="mailto:rabbi@shmuelgoldstein.com">rabbi@shmuelgoldstein.com</a> to set up a time.</p>';
      return;
    }
    typeCards.innerHTML = types.map((t) => `
      <button type="button" class="type-card${selectedType && selectedType.id === t.id ? ' is-selected' : ''}" data-type-id="${esc(t.id)}">
        <h4>${esc(t.name)}</h4>
        ${t.description ? `<p class="meta" style="margin:0 0 0.5rem;">${esc(t.description)}</p>` : ''}
        <p class="meta" style="margin:0;"><strong>${fmtPrice(t.price_cents)}</strong> · ${t.duration_minutes} minutes</p>
      </button>`).join('');
    typeCards.querySelectorAll('.type-card').forEach((card) => card.addEventListener('click', () => {
      selectedType = types.find((t) => t.id === card.dataset.typeId);
      renderTypes();
      renderSlots();
    }));
  };

  // ---- slots ----
  const overlapsBooked = (startMs, endMs) => booked.some((b) => {
    const s = new Date(b.starts_at).getTime();
    const e = s + (b.duration_minutes || 60) * 60000;
    return s < endMs && e > startMs;
  });

  const renderSlots = () => {
    if (!selectedType) { slotsEl.innerHTML = '<p style="color: var(--ink-soft);">Choose a session above to see open times.</p>'; return; }
    if (!rules.length) { slotsEl.innerHTML = '<p style="color: var(--ink-soft);">No open times are posted right now — email <a href="mailto:rabbi@shmuelgoldstein.com">rabbi@shmuelgoldstein.com</a> and we\'ll find one.</p>'; return; }

    const dur = selectedType.duration_minutes;
    const now = Date.now();
    const days = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const probe = new Date(now + i * 864e5);
      probe.setUTCHours(12, 0, 0, 0); // noon UTC = same NY calendar date year-round
      const { y, m, d, dow } = nyDateParts(probe);
      const daySlots = [];
      rules.filter((r) => r.day_of_week === dow).forEach((r) => {
        const start = timeToMin(r.start_time);
        const end = timeToMin(r.end_time);
        for (let t = start; t + dur <= end; t += dur) {
          const slot = nyToUtc(y, m - 1, d, t);
          const ms = slot.getTime();
          if (ms < now + LEAD_MS) continue;
          if (overlapsBooked(ms, ms + dur * 60000)) continue;
          daySlots.push(slot);
        }
      });
      if (daySlots.length) days.push({ label: daySlots[0], slots: daySlots });
    }

    if (!days.length) {
      slotsEl.innerHTML = '<p style="color: var(--ink-soft);">Everything in the next four weeks is taken. Email <a href="mailto:rabbi@shmuelgoldstein.com">rabbi@shmuelgoldstein.com</a> and we\'ll find a time.</p>';
      return;
    }

    slotsEl.innerHTML = days.map((day) => {
      const heading = day.label.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      return `<div class="book-day">
        <h4>${esc(heading)}</h4>
        <div class="slot-row">
          ${day.slots.map((s) => `<button type="button" class="slot-btn" data-iso="${s.toISOString()}">${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</button>`).join('')}
        </div>
      </div>`;
    }).join('');

    slotsEl.querySelectorAll('.slot-btn').forEach((btn) => btn.addEventListener('click', () => bookSlot(btn)));
  };

  const bookSlot = async (btn) => {
    if (!session) {
      setMsg('Sign in first — it takes one email.');
      location.href = 'signup.html';
      return;
    }
    const iso = btn.getAttribute('data-iso');
    const when = new Date(iso).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    if (!window.confirm(`Book ${selectedType.name} on ${when} for ${fmtPrice(selectedType.price_cents)}?`)) return;
    btn.disabled = true;
    setMsg('Opening secure checkout…');
    try {
      const { data: { session: fresh } } = await sb.auth.getSession();
      const res = await fetch('/api/create-booking-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fresh.access_token },
        body: JSON.stringify({ session_type_id: selectedType.id, starts_at: iso }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { window.location.href = data.url; return; }
      setMsg(data.error || 'Something went wrong — try again or email rabbi@shmuelgoldstein.com.');
    } catch {
      setMsg('Network error — please try again.');
    }
    btn.disabled = false;
  };

  // ---- boot ----
  const boot = async () => {
    sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb) {
      typeCards.innerHTML = '<p style="grid-column: 1/-1;">Booking is temporarily unavailable — email <a href="mailto:rabbi@shmuelgoldstein.com">rabbi@shmuelgoldstein.com</a>.</p>';
      return;
    }

    const q = new URLSearchParams(location.search);
    if (q.get('checkout') === 'success') {
      bannerEl.innerHTML = '<p class="banner-ok">Payment received — your session is confirmed. A confirmation email with the join details is on its way.</p>';
    } else if (q.get('checkout') === 'cancelled') {
      bannerEl.innerHTML = '<p class="banner-ok" style="background:#faf3e3;border-color:#e4d3a1;color:#6b5416;">Checkout was cancelled — your slot was released. Pick a time whenever you\'re ready.</p>';
    }

    session = (await sb.auth.getSession()).data.session;
    renderAuth();

    const [typesRes, rulesRes, bookedRes] = await Promise.all([
      sb.from('session_types').select('id, name, description, duration_minutes, price_cents, sort_order').eq('active', true).order('sort_order', { ascending: true }),
      sb.from('availability_rules').select('day_of_week, start_time, end_time'),
      sb.from('v_booked_slots').select('starts_at, duration_minutes'),
    ]);
    types = typesRes.data || [];
    rules = rulesRes.data || [];
    booked = bookedRes.data || [];

    if (types.length === 1) selectedType = types[0];
    renderTypes();
    renderSlots();
    loadMine();
  };

  document.addEventListener('DOMContentLoaded', () => {
    const wait = setInterval(() => {
      if (window.getSupabase && window.getSupabase()) { clearInterval(wait); boot(); }
    }, 50);
  });
})();
