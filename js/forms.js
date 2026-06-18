(function () {
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);

  const waitForSupabase = async (timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
      if (sb) return sb;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  };

  const mirrorSubscriber = async (email, source) => {
    const sb = await waitForSupabase();
    if (!sb) { console.warn('[subscriber mirror] Supabase client unavailable'); return false; }
    const { error } = await sb.from('subscribers').insert({ email, source });
    if (error && error.code !== '23505') { // ignore unique violation
      console.warn('[subscriber mirror]', error.code, error.message);
      return false;
    }
    return true;
  };

  const mirrorContact = async (fields) => {
    const sb = await waitForSupabase();
    if (!sb) { console.warn('[contact mirror] Supabase client unavailable'); return false; }
    const { error } = await sb.from('contact_messages').insert(fields);
    if (error) { console.warn('[contact mirror]', error.code, error.message); return false; }
    return true;
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

      // Gather field values
      const emailInput = form.querySelector('input[type="email"]');
      const email = (emailInput && emailInput.value || '').trim();
      if (!email) { if (button) { button.disabled = false; button.textContent = originalText; } return; }

      // Mirror to Supabase FIRST so a slow/failing Netlify Forms POST
      // (or a same-tab navigation) can't lose the lead.
      let mirrored = false;
      if (isContact) {
        const name = (form.querySelector('[name="name"]')?.value || '').trim();
        const subject = (form.querySelector('[name="subject"]')?.value || '').trim();
        const message = (form.querySelector('[name="message"]')?.value || '').trim();
        mirrored = await mirrorContact({ name, email, subject, message });
      } else {
        mirrored = await mirrorSubscriber(email, 'footer');
      }

      if (isLocal) {
        form.reset();
        if (msg) msg.textContent = mirrored
          ? 'Saved to Supabase. (Netlify Forms only fires on production.)'
          : 'Could not save — check the browser console.';
        if (button) { button.disabled = false; button.textContent = originalText; }
        return;
      }

      try {
        const data = new FormData(form);
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(data).toString(),
        });
        if (!res.ok) throw new Error('submission failed');
        form.reset();
        if (msg) msg.textContent = isContact
          ? 'Message sent — Rabbi Goldstein will be in touch soon.'
          : 'Thanks — you’re on the list.';
      } catch (err) {
        if (msg) msg.textContent = mirrored
          ? (isContact
              ? 'Sent. If you don’t hear back soon, email directly.'
              : 'Saved. (If you don’t hear back soon, email directly.)')
          : 'Could not save — please try again or email directly.';
      } finally {
        if (button) { button.disabled = false; button.textContent = originalText; }
      }
    });
  });
})();
