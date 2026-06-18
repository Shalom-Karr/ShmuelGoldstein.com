// Lightweight page-view analytics — records to Supabase `page_views` table.
// Tracks: path, referrer, user agent, session, scroll depth, and time on page.
(function () {
  'use strict';

  // Don't track admin pages or bots.
  if (location.pathname.startsWith('/admin')) return;
  if (/bot|crawl|spider|slurp|facebookexternalhit/i.test(navigator.userAgent)) return;

  var SESSION_KEY = 'sg_sid';
  var sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    // Use crypto.randomUUID where available; fall back to crypto.getRandomValues
    if (crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      var arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      sessionId = Array.from(arr, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  var startTime = Date.now();
  var maxScroll = 0;
  var rowId = null;

  function getScrollPct() {
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    if (docH <= 0) return 100;
    return Math.min(100, Math.round((window.scrollY / docH) * 100));
  }

  window.addEventListener('scroll', function () {
    var pct = getScrollPct();
    if (pct > maxScroll) maxScroll = pct;
  }, { passive: true });

  function waitForSupabase(cb) {
    var attempts = 0;
    var iv = setInterval(function () {
      attempts++;
      var sb = window.getSupabase && window.getSupabase();
      if (sb) { clearInterval(iv); cb(sb); }
      else if (attempts > 40) clearInterval(iv); // give up after ~4s
    }, 100);
  }

  waitForSupabase(function (sb) {
    sb.from('page_views').insert({
      session_id: sessionId,
      path: location.pathname,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      duration_ms: 0,
      max_scroll_pct: 0,
    }).select('id').single().then(function (res) {
      if (res.data) rowId = res.data.id;
    });

    // Update duration + scroll on page hide (works on mobile too).
    function updateRow() {
      if (!rowId) return;
      var duration = Date.now() - startTime;
      maxScroll = Math.max(maxScroll, getScrollPct());
      sb.from('page_views').update({
        duration_ms: duration,
        max_scroll_pct: maxScroll,
      }).eq('id', rowId).then(function () {});
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') updateRow();
    });

    window.addEventListener('pagehide', updateRow);
  });
})();
