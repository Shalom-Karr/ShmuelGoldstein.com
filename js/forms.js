(function () {
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);

  const mirrorSubscriber = async (email, source) => {
    const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb) return;
    const { error } = await sb.from('subscribers').insert({ email, source });
    if (error && error.code !== '23505') { // ignore unique violation
      console.warn('[subscriber mirror]', error.message);
    }
  };

  const mirrorContact = async (fields) => {
    const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb) return;
    const { error } = await sb.from('contact_messages').insert(fields);
    if (error) console.warn('[contact mirror]', error.message);
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

      if (isLocal) {
        await new Promise((r) => setTimeout(r, 350));
        if (isContact) {
          const name = (form.querySelector('[name="name"]')?.value || '').trim();
          const subject = (form.querySelector('[name="subject"]')?.value || '').trim();
          const message = (form.querySelector('[name="message"]')?.value || '').trim();
          await mirrorContact({ name, email, subject, message });
        } else {
          await mirrorSubscriber(email, 'footer');
        }
        form.reset();
        if (msg) msg.textContent = 'Saved to Supabase. (Netlify Forms only fires on production.)';
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

        if (isContact) {
          const name = (form.querySelector('[name="name"]')?.value || '').trim();
          const subject = (form.querySelector('[name="subject"]')?.value || '').trim();
          const message = (form.querySelector('[name="message"]')?.value || '').trim();
          await mirrorContact({ name, email, subject, message });
        } else {
          await mirrorSubscriber(email, 'footer');
        }
        form.reset();
        if (msg) msg.textContent = isContact
          ? 'Message sent — Rabbi Goldstein will be in touch soon.'
          : 'Thanks — you\u2019re on the list.';
      } catch (err) {
        // Even if Netlify Forms POST fails, still try the Supabase mirror so we don't lose the lead.
        if (isContact) {
          const name = (form.querySelector('[name="name"]')?.value || '').trim();
          const subject = (form.querySelector('[name="subject"]')?.value || '').trim();
          const message = (form.querySelector('[name="message"]')?.value || '').trim();
          await mirrorContact({ name, email, subject, message });
        } else {
          await mirrorSubscriber(email, 'footer');
        }
        if (msg) msg.textContent = isContact
          ? 'Sent. If you don\u2019t hear back soon, email directly.'
          : 'Saved. (If you don\u2019t hear back soon, email directly.)';
      } finally {
        if (button) { button.disabled = false; button.textContent = originalText; }
      }
    });
  });
})();
