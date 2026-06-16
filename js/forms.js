(function () {
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  const isLocal = ['localhost', '127.0.0.1', ''].includes(location.hostname);

  const mirrorToSupabase = async (form, email) => {
    const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
    if (!sb) return;
    const source = form.getAttribute('name') === 'newsletter' ? 'footer' : (form.getAttribute('name') || 'site');
    try {
      // upsert by email so a returning subscriber doesn't 23505
      await sb.from('subscribers')
        .upsert({ email, source }, { onConflict: 'email', ignoreDuplicates: true });
    } catch (_) { /* silent — Netlify Forms is the primary store */ }
  };

  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const msg = form.parentElement.querySelector('.form-msg');
      const honeypot = form.querySelector('input[name="bot-field"]');
      const emailInput = form.querySelector('input[type="email"]');
      const email = (emailInput && emailInput.value || '').trim();

      if (honeypot && honeypot.value) return;
      if (!email) return;

      const originalText = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }

      if (isLocal) {
        await new Promise((r) => setTimeout(r, 350));
        await mirrorToSupabase(form, email);   // Supabase still works locally
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
        await mirrorToSupabase(form, email);
        form.reset();
        if (msg) msg.textContent = 'Thanks — you’re on the list.';
      } catch (err) {
        // Even if Netlify Forms POST fails, still try the Supabase mirror so we don't lose the lead.
        await mirrorToSupabase(form, email);
        if (msg) msg.textContent = 'Saved. (If you don’t hear back soon, email directly.)';
      } finally {
        if (button) { button.disabled = false; button.textContent = originalText; }
      }
    });
  });
})();
