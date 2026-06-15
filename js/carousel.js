(function () {
  if (typeof Swiper === 'undefined') return;

  const root = document.querySelector('.testimonial-carousel');
  if (!root) return;

  const swiperEl = root.querySelector('.testimonial-swiper');
  const slides = swiperEl.querySelectorAll('.swiper-slide');
  const total = slides.length;
  const currentEl = root.querySelector('.counter-current');
  const totalEl = root.querySelector('.counter-total');
  const fillEl = root.querySelector('.counter-fill');

  if (totalEl) totalEl.textContent = String(total).padStart(2, '0');

  const updateProgress = (realIndex) => {
    if (currentEl) currentEl.textContent = String(realIndex + 1).padStart(2, '0');
    if (fillEl) fillEl.style.transform = `scaleX(${(realIndex + 1) / total})`;
  };

  const swiper = new Swiper(swiperEl, {
    slidesPerView: 1,
    spaceBetween: 24,
    speed: 700,
    loop: total > 2,
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

  // Pause autoplay when the carousel scrolls out of view
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!swiper || !swiper.autoplay) return;
        entry.isIntersecting ? swiper.autoplay.start() : swiper.autoplay.stop();
      });
    }, { threshold: 0.25 });
    io.observe(root);
  }
})();
