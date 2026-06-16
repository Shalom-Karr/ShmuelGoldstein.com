(function () {
  if (typeof Swiper === 'undefined') return;

  const root = document.querySelector('.testimonial-carousel');
  if (!root) return;

  const swiperEl = root.querySelector('.testimonial-swiper');
  const wrapper  = swiperEl.querySelector('.swiper-wrapper');
  const currentEl = root.querySelector('.counter-current');
  const totalEl   = root.querySelector('.counter-total');
  const fillEl    = root.querySelector('.counter-fill');

  const init = (slidesCount) => {
    const updateProgress = (realIndex) => {
      if (currentEl) currentEl.textContent = String(realIndex + 1).padStart(2, '0');
      if (fillEl) fillEl.style.transform = `scaleX(${(realIndex + 1) / slidesCount})`;
    };
    if (totalEl) totalEl.textContent = String(slidesCount).padStart(2, '0');

    const swiper = new Swiper(swiperEl, {
      slidesPerView: 1,
      spaceBetween: 24,
      speed: 700,
      loop: slidesCount > 2,
      grabCursor: true,
      autoplay: {
        delay: 7500,
        disableOnInteraction: false,
        pauseOnMouseEnter: true,
      },
      keyboard: { enabled: true, onlyInViewport: true },
      navigation: {
        prevEl: root.querySelector('.carousel-prev'),
        nextEl: root.querySelector('.carousel-next'),
      },
      breakpoints: {
        720: { slidesPerView: 1.15, spaceBetween: 28, centeredSlides: true },
        980: { slidesPerView: 2, spaceBetween: 28, centeredSlides: false },
        1280: { slidesPerView: 2, spaceBetween: 32 },
      },
      on: {
        init() { updateProgress(this.realIndex || 0); },
        slideChange() { updateProgress(this.realIndex); },
      },
    });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!swiper || !swiper.autoplay) return;
          entry.isIntersecting ? swiper.autoplay.start() : swiper.autoplay.stop();
        });
      }, { threshold: 0.25 });
      io.observe(root);
    }
  };

  const escape = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]
  );

  const renderRows = (rows) => {
    wrapper.innerHTML = rows.map((t) => {
      const cite = [t.attributed_to, t.role].filter(Boolean).join(' · ');
      return `<article class="swiper-slide quote-card">
        <span class="glyph">"</span>
        <blockquote>${escape(t.quote_text)}</blockquote>
        <cite>${escape(cite)}</cite>
      </article>`;
    }).join('');
  };

  const initialCount = wrapper.querySelectorAll('.swiper-slide').length;

  const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
  if (!sb) {
    init(initialCount);
    return;
  }

  sb.from('testimonials')
    .select('quote_text, attributed_to, role, sort_order')
    .eq('published', true)
    .eq('featured', true)
    .order('sort_order', { ascending: true })
    .limit(20)
    .then(({ data, error }) => {
      if (!error && Array.isArray(data) && data.length) {
        renderRows(data);
        init(data.length);
      } else {
        init(initialCount);
      }
    })
    .catch(() => init(initialCount));
})();
