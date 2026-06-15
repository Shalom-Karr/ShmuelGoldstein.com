(function () {
  const SUPABASE_PUBLIC_BASE = window.SB && window.SB.url
    ? `${window.SB.url}/storage/v1/object/public`
    : '';

  // ---------- Filter chips ----------
  const filters = document.querySelectorAll('.shiurim-filter');
  const cards = Array.from(document.querySelectorAll('.shiur-card'));
  const empty = document.querySelector('.shiurim-empty');

  function applyFilter(topic) {
    let visible = 0;
    cards.forEach((card) => {
      const match = topic === 'all' || card.dataset.topic === topic;
      card.hidden = !match;
      if (match) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  }

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      applyFilter(btn.dataset.topic);
    });
  });

  // ---------- Modal player ----------
  const modal = document.getElementById('shiur-modal');
  const stage = document.getElementById('shiur-stage');
  const closeBtn = modal && modal.querySelector('.shiur-modal-close');

  function open(card) {
    const source = card.dataset.source;
    const id = card.dataset.sourceId;
    const poster = card.dataset.poster || '';
    let html = '';

    if (source === 'youtube') {
      html = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1" title="${card.querySelector('h3').textContent}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (source === 'vimeo') {
      html = `<iframe src="https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0" title="${card.querySelector('h3').textContent}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else if (source === 'supabase') {
      // id can be either a full URL or a storage path; if the latter, prefix with SUPABASE_PUBLIC_BASE
      const src = id.startsWith('http') ? id : (SUPABASE_PUBLIC_BASE ? `${SUPABASE_PUBLIC_BASE}/${id}` : id);
      const posterAttr = poster ? ` poster="${poster}"` : '';
      html = `<video src="${src}" controls autoplay playsinline${posterAttr}></video>`;
    } else {
      html = `<p style="color:var(--sand);padding:2rem;text-align:center;">Unknown video source.</p>`;
    }

    stage.innerHTML = html;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    stage.innerHTML = '';
    document.body.style.overflow = '';
  }

  cards.forEach((card) => {
    const thumb = card.querySelector('.shiur-thumb');
    if (thumb) thumb.addEventListener('click', () => open(card));
  });

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
})();
