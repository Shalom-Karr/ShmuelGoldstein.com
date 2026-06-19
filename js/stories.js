(function () {
  const grid = document.querySelector('.stories-grid');
  if (!grid) return;

  const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );

  const renderRows = (rows) => {
    grid.innerHTML = rows.map((t, i) => {
      const cite = [t.attributed_to, t.role].filter(Boolean).join(' · ');
      const wide = i === 0 ? ' style="grid-column: 1 / -1;"' : '';
      const delay = i === 0 ? '' : ` data-reveal-delay="${i * 100}"`;
      const bqStyle = i === 0 ? ' style="font-size: 1.2rem;"' : '';
      return `<div class="quote-card"${wide} data-reveal${delay}>
        <span class="glyph">"</span>
        <blockquote${bqStyle}>${escape(t.quote_text)}</blockquote>
        <cite>${escape(cite)}</cite>
      </div>`;
    }).join('');
  };

  const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  if (!sb) return;

  sb.from('testimonials')
    .select('quote_text, attributed_to, role, sort_order')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .limit(50)
    .then(({ data, error }) => {
      if (!error && Array.isArray(data) && data.length) {
        renderRows(data);
      }
    })
    .catch(() => {});
})();
