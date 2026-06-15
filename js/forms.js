(function () {
  const forms = document.querySelectorAll('form[data-netlify="true"]');

  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const msg = form.parentElement.querySelector('.form-msg');
      const honeypot = form.querySelector('input[name="bot-field"]');

      if (honeypot && honeypot.value) return;

      const originalText = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }

      try {
        const data = new FormData(form);
        const res = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(data).toString(),
        });
        if (!res.ok) throw new Error('submission failed');
        form.reset();
        if (msg) msg.textContent = 'Thanks — you’re on the list.';
      } catch (err) {
        if (msg) msg.textContent = 'Something went wrong. Please try again or email directly.';
      } finally {
        if (button) { button.disabled = false; button.textContent = originalText; }
      }
    });
  });
})();
