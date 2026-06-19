(function () {
  const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  const SUPABASE_PUBLIC_BASE = window.SB && window.SB.url
    ? `${window.SB.url}/storage/v1/object/public`
    : '';

  const grid = document.getElementById('shiurim-grid');
  const empty = document.querySelector('.shiurim-empty');
  const searchInput = document.getElementById('shiur-search');
  const loadMoreBtn = document.getElementById('shiurim-load-more');
  let filters = document.querySelectorAll('.shiurim-filter');
  let activeTopic = 'all';
  let activeQuery = '';

  const PAGE_SIZE = 24;
  let offset = 0;
  let loading = false;
  let exhausted = false;
  let firstFetchDone = false;

  // ----- helpers -----
  const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );

  const fmtDur = (sec) => {
    if (!sec || sec <= 0) return '';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const sourceBadge = { youtube: 'YouTube', vimeo: 'Vimeo', supabase: 'Self-Hosted' };

  const thumbnailFor = (row) => {
    if (row.source === 'youtube' && row.source_id) {
      return `https://i.ytimg.com/vi/${row.source_id}/hqdefault.jpg`;
    }
    if (row.source === 'vimeo' && row.source_id) {
      return `https://vumbnail.com/${row.source_id}.jpg`;
    }
    if (row.poster_path) {
      return row.poster_path.startsWith('http') ? row.poster_path
        : `${SUPABASE_PUBLIC_BASE}/${row.poster_path}`;
    }
    return '/assets/rabbi-goldstein.jpg';
  };

  const sourceIdForCard = (row) => {
    if (row.source === 'supabase') {
      return row.storage_path || row.source_id || '';
    }
    return row.source_id || '';
  };

  const renderCard = (row) => {
    const title = escape(row.title || '');
    const topicLabel = row.topic ? `${row.topic.charAt(0).toUpperCase()}${row.topic.slice(1)}` : '';
    const meta = row.topic && row.tags && row.tags.length
      ? `${topicLabel} · ${row.tags[0]}`
      : topicLabel;
    return `<article class="shiur-card"
        data-topic="${escape(row.topic || 'all')}"
        data-source="${escape(row.source)}"
        data-source-id="${escape(sourceIdForCard(row))}"
        ${row.poster_path ? `data-poster="${escape(row.poster_path)}"` : ''}>
      <button class="shiur-thumb" type="button" aria-label="Play: ${title}">
        <img src="${thumbnailFor(row)}" alt="Thumbnail: ${title}" loading="lazy" />
        <span class="shiur-play" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </span>
        <span class="shiur-source-badge">${sourceBadge[row.source] || row.source}</span>
        ${row.duration_seconds ? `<span class="shiur-duration">${fmtDur(row.duration_seconds)}</span>` : ''}
      </button>
      <div class="shiur-body">
        ${meta ? `<span class="shiur-topic">${escape(meta)}</span>` : ''}
        <h3>${title}</h3>
        ${row.description ? `<p>${escape(row.description)}</p>` : ''}
        ${row.recorded_at ? `<span class="shiur-date">${fmtDate(row.recorded_at)}</span>` : ''}
      </div>
    </article>`;
  };

  const applyFilter = (topic, query) => {
    if (typeof topic === 'string') activeTopic = topic;
    if (typeof query === 'string') activeQuery = query;
    const q = activeQuery.trim().toLowerCase();
    const cards = Array.from(grid.querySelectorAll('.shiur-card'));
    let visible = 0;
    cards.forEach((card) => {
      const topicMatch = activeTopic === 'all' || card.dataset.topic === activeTopic;
      let queryMatch = true;
      if (q) {
        const h = card.querySelector('h3');
        const p = card.querySelector('p');
        const t = card.querySelector('.shiur-topic');
        const hay = `${h ? h.textContent : ''} ${p ? p.textContent : ''} ${t ? t.textContent : ''}`.toLowerCase();
        queryMatch = hay.indexOf(q) !== -1;
      }
      const match = topicMatch && queryMatch;
      card.hidden = !match;
      if (match) visible++;
    });
    if (empty) empty.hidden = visible > 0;
  };

  const wireFilters = () => {
    filters = document.querySelectorAll('.shiurim-filter');
    filters.forEach((btn) => {
      btn.addEventListener('click', () => {
        filters.forEach((b) => {
          b.classList.remove('is-active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
        applyFilter(btn.dataset.topic, activeQuery);
      });
    });
  };

  const wireSearch = () => {
    if (!searchInput) return;
    let timer = null;
    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      clearTimeout(timer);
      timer = setTimeout(() => applyFilter(activeTopic, val), 120);
    });
  };

  // ----- Modal player -----
  const modal = document.getElementById('shiur-modal');
  const stage = document.getElementById('shiur-stage');
  const closeBtn = modal && modal.querySelector('.shiur-modal-close');
  const modalTitle = document.getElementById('shiur-modal-title');
  let lastFocused = null;

  const FOCUSABLE_SEL = 'a[href], button:not([disabled]), textarea, input, select, iframe, video, [tabindex]:not([tabindex="-1"])';

  const getFocusable = () => {
    if (!modal) return [];
    return Array.from(modal.querySelectorAll(FOCUSABLE_SEL))
      .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
  };

  const trapTab = (e) => {
    if (e.key !== 'Tab' || !modal || !modal.classList.contains('is-open')) return;
    const f = getFocusable();
    if (!f.length) { e.preventDefault(); if (closeBtn) closeBtn.focus(); return; }
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || !modal.contains(active)) { e.preventDefault(); last.focus(); }
    } else {
      if (active === last || !modal.contains(active)) { e.preventDefault(); first.focus(); }
    }
  };

  const open = (card) => {
    const source = card.dataset.source;
    const id = card.dataset.sourceId;
    const poster = card.dataset.poster || '';
    const titleText = (card.querySelector('h3') && card.querySelector('h3').textContent) || 'Shiur';
    let html = '';

    if (source === 'youtube') {
      html = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1" title="${titleText}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    } else if (source === 'vimeo') {
      html = `<iframe src="https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0" title="${titleText}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
    } else if (source === 'supabase') {
      const src = id.startsWith('http') ? id : (SUPABASE_PUBLIC_BASE ? `${SUPABASE_PUBLIC_BASE}/${id}` : id);
      const posterAttr = poster ? ` poster="${poster}"` : '';
      html = `<video src="${src}" controls autoplay playsinline${posterAttr}></video>`;
    } else {
      html = `<p style="color:var(--sand);padding:2rem;text-align:center;">Unknown video source.</p>`;
    }

    lastFocused = document.activeElement;
    if (modalTitle) modalTitle.textContent = titleText;
    stage.innerHTML = html;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (closeBtn) {
      try { closeBtn.focus(); } catch (_) {}
    }
  };

  const close = () => {
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    stage.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
    lastFocused = null;
  };

  const wireCards = () => {
    grid.querySelectorAll('.shiur-card').forEach((card) => {
      const thumb = card.querySelector('.shiur-thumb');
      if (thumb && !thumb.dataset.wired) {
        thumb.dataset.wired = '1';
        thumb.addEventListener('click', () => open(card));
      }
    });
  };

  if (closeBtn) closeBtn.addEventListener('click', close);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (!modal || !modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') { close(); return; }
    trapTab(e);
  });

  wireFilters();
  wireSearch();
  wireCards();

  // ----- Hydrate from Supabase (paginated) -----
  if (!sb || !grid) return;

  const setLoadMoreVisible = (visible) => {
    if (!loadMoreBtn) return;
    loadMoreBtn.hidden = !visible;
  };

  const fetchPage = () => {
    if (loading || exhausted) return;
    loading = true;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.dataset.originalText = loadMoreBtn.dataset.originalText || loadMoreBtn.textContent;
      loadMoreBtn.textContent = 'Loading…';
    }

    sb.from('shiurim')
      .select('*')
      .eq('published', true)
      .order('recorded_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(({ data, error }) => {
        loading = false;
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          if (loadMoreBtn.dataset.originalText) loadMoreBtn.textContent = loadMoreBtn.dataset.originalText;
        }
        if (error) return;
        const rows = Array.isArray(data) ? data : [];

        if (!firstFetchDone) {
          firstFetchDone = true;
          if (rows.length) {
            // first successful page replaces the static fallback
            grid.innerHTML = rows.map(renderCard).join('');
          } else {
            // no rows at all — leave fallback intact
            exhausted = true;
            setLoadMoreVisible(false);
            return;
          }
        } else if (rows.length) {
          grid.insertAdjacentHTML('beforeend', rows.map(renderCard).join(''));
        }

        offset += rows.length;
        if (rows.length < PAGE_SIZE) {
          exhausted = true;
          setLoadMoreVisible(false);
        } else {
          setLoadMoreVisible(true);
        }

        wireCards();
        const active = document.querySelector('.shiurim-filter.is-active');
        applyFilter(active ? active.dataset.topic : 'all', searchInput ? searchInput.value : '');
      })
      .catch(() => {
        loading = false;
        if (loadMoreBtn) {
          loadMoreBtn.disabled = false;
          if (loadMoreBtn.dataset.originalText) loadMoreBtn.textContent = loadMoreBtn.dataset.originalText;
        }
        /* keep static fallback */
      });
  };

  if (loadMoreBtn) {
    loadMoreBtn.hidden = true;
    loadMoreBtn.addEventListener('click', fetchPage);
  }

  fetchPage();
})();
