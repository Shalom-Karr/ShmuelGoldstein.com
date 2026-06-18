(function () {
  const forms = document.querySelectorAll('form[data-netlify="true"]');

  const waitForSupabase = async (timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
      if (sb) return sb;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };

  // Contact form still goes via supabase-js (lower volume, JS path is fine).
  const mirrorContact = async (fields) => {
    const sb = await waitForSupabase();
    if (!sb) { console.warn('[contact mirror] Supabase client unavailable'); return false; }
    const { error } = await sb.from('contact_messages').insert(fields);
    if (error) { console.warn('[contact mirror]', error.code, error.message); return false; }
    return true;
  };

  // Newsletter goes through a Netlify Function so RLS, CSP, tracking-prevention,
  // and supabase-js UMD load issues on the client can't drop signups.
  const subscribeViaFunction = async (email, source) => {
    try {
      const res = await fetch('/.netlify/functions/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      if (res.ok) return true;
      const text = await res.text().catch(() => '');
      console.warn('[subscribe]', res.status, text);
      return false;
    } catch (err) {
      console.warn('[subscribe] fetch failed', err);
      return false;
    }
  };

  forms.forEach((form) => {
    const formName = form.getAttribute('name') || '';
    const isContact = formName === 'contact';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const msg = form.parentElement.querySelector('.form-msg');
      const honeypot = form.querySelector('input[name="bot-field"]');

      if (honeypot && honeypot.value) return;

      const originalText = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }

      const emailInput = form.querySelector('input[type="email"]');
      const email = (emailInput && emailInput.value || '').trim();
      if (!email) { if (button) { button.disabled = false; button.textContent = originalText; } return; }

      let saved = false;
      if (isContact) {
        const name = (form.querySelector('[name="name"]')?.value || '').trim();
        const subject = (form.querySelector('[name="subject"]')?.value || '').trim();
        const message = (form.querySelector('[name="message"]')?.value || '').trim();
        saved = await mirrorContact({ name, email, subject, message });
      } else {
        saved = await subscribeViaFunction(email, 'footer');
      }

      if (saved) {
        form.reset();
        if (msg) msg.textContent = isContact
          ? 'Message sent — Rabbi Goldstein will be in touch soon.'
          : 'Thanks — you’re on the list.';
      } else {
        if (msg) msg.textContent = 'Could not save — please try again or email directly.';
      }
      if (button) { button.disabled = false; button.textContent = originalText; }
    });
  });
})();
