(function () {
  const forms = document.querySelectorAll('.email-capture');

  forms.forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      const button = form.querySelector('button');
      const msg = form.parentElement.querySelector('.form-msg');
      const endpoint = form.getAttribute('data-endpoint');
      const email = (input.value || '').trim();

      if (!email) return;

      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = 'Sending…';

      try {
        if (endpoint) {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (!res.ok) throw new Error('subscription failed');
        }
        input.value = '';
        if (msg) msg.textContent = 'Thanks — you’re on the list.';
      } catch (err) {
        if (msg) msg.textContent = 'Something went wrong. Please try again or email directly.';
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
})();
