// Small UI helpers shared across admin pages.
window.adminUI = (function () {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );

  const toast = (msg, kind = 'ok') => {
    let host = $('.admin-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'admin-toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `admin-toast admin-toast--${kind}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 400);
    }, 3000);
  };

  const openModal = (title, bodyHtml, opts = {}) => {
    const overlay = document.createElement('div');
    overlay.className = 'admin-modal';
    overlay.innerHTML = `
      <div class="admin-modal-card" role="dialog" aria-modal="true">
        <div class="admin-modal-head">
          <h3>${escape(title)}</h3>
          <button class="admin-modal-x" type="button" aria-label="Close">×</button>
        </div>
        <div class="admin-modal-body">${bodyHtml}</div>
        ${opts.footer === false ? '' : `
          <div class="admin-modal-foot">
            <button class="admin-btn admin-btn--ghost" data-cancel>Cancel</button>
            <button class="admin-btn admin-btn--primary" data-submit>${escape(opts.submitLabel || 'Save')}</button>
          </div>
        `}
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-visible'));

    const close = () => {
      overlay.classList.remove('is-visible');
      setTimeout(() => overlay.remove(), 300);
    };
    overlay.querySelector('.admin-modal-x').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const cancel = overlay.querySelector('[data-cancel]');
    if (cancel) cancel.addEventListener('click', close);

    return {
      overlay,
      body: overlay.querySelector('.admin-modal-body'),
      submit: overlay.querySelector('[data-submit]'),
      close,
    };
  };

  const confirm = (msg) => new Promise((resolve) => {
    const m = openModal('Confirm', `<p style="margin:0;">${escape(msg)}</p>`, { submitLabel: 'Yes, do it' });
    m.submit.addEventListener('click', () => { m.close(); resolve(true); });
    m.overlay.addEventListener('click', (e) => { if (e.target === m.overlay) resolve(false); });
    m.overlay.querySelector('[data-cancel]').addEventListener('click', () => resolve(false));
    m.overlay.querySelector('.admin-modal-x').addEventListener('click', () => resolve(false));
  });

  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  };

  return { $, $$, escape, toast, openModal, confirm, fmtDate };
})();
