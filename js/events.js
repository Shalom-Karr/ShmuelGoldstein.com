(function () {
  const grid = document.querySelector('.events-grid');
  if (!grid) return;

  const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );

  const fmtPrice = (cents) => {
    const d = cents / 100;
    return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
  };

  const fmtWhen = (iso) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      });
    } catch { return iso; }
  };

  // No data-reveal on injected markup — the observer in main.js only
  // registers elements present at load (see stories.js).
  const render = (rows) => {
    grid.innerHTML = rows.map((ev, i) => `
      <div class="service-row">
        <span class="service-num">N° ${String(i + 1).padStart(2, '0')}</span>
        <h3 class="service-name">${escape(ev.title)}</h3>
        <div>
          ${ev.description ? `<p class="service-desc" style="margin: 0 0 1rem;">${escape(ev.description)}</p>` : ''}
          <p class="service-desc" style="margin: 0 0 1.25rem;"><strong style="color: var(--ink);">When —</strong> ${escape(fmtWhen(ev.starts_at))} · ${ev.duration_minutes} minutes · Zoom</p>
          <button type="button" class="btn btn-primary event-reserve" data-event-id="${escape(ev.id)}">
            Reserve a seat — ${fmtPrice(ev.price_cents)}
          </button>
          <p class="form-msg event-msg" aria-live="polite" style="margin-top: 0.75rem;"></p>
        </div>
      </div>
    `).join('');
  };

  const renderEmpty = () => {
    grid.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <p style="font-size: 1.1rem; color: var(--ink-soft); max-width: 46ch; margin: 0 auto 1.5rem;">No upcoming events on the calendar right now. Join the newsletter below and you'll hear about the next one first.</p>
      </div>`;
  };

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('.event-reserve');
    if (!btn) return;
    const msg = btn.parentElement.querySelector('.event-msg');
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Opening secure checkout…';
    if (msg) msg.textContent = '';
    try {
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: btn.getAttribute('data-event-id') }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      if (msg) msg.textContent = data.error || 'Something went wrong — please try again or email rabbi@shmuelgoldstein.com.';
    } catch {
      if (msg) msg.textContent = 'Network error — please try again.';
    }
    btn.disabled = false;
    btn.textContent = original;
  });

  const form = document.querySelector('.find-session-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="email"]');
      const btn = form.querySelector('button');
      const msg = document.querySelector('.find-session-msg');
      btn.disabled = true;
      try {
        const res = await fetch('/api/resend-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: input.value }),
        });
        const data = await res.json().catch(() => ({}));
        msg.textContent = data.message || data.error || 'Check your inbox.';
        if (res.ok) input.value = '';
      } catch {
        msg.textContent = 'Network error — please try again.';
      }
      btn.disabled = false;
    });
  }

  const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  if (!sb) { renderEmpty(); return; }

  sb.from('events')
    .select('id, slug, title, description, starts_at, duration_minutes, price_cents, capacity, status')
    .eq('status', 'upcoming')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(20)
    .then(({ data, error }) => {
      if (!error && Array.isArray(data) && data.length) render(data);
      else renderEmpty();
    })
    .catch(renderEmpty);
})();
