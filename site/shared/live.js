// The live player shared by the site pages: a poster first, then the piece itself (its own page, in an iframe), playing live.
//   <figure class="live" data-page="<the piece's page>" [data-autoplay]><img src="poster.jpg" alt="…"><button class="live-play" aria-label="Play …">▶</button></figure>
// A click (or, with data-autoplay, being half on screen) starts it. One piece plays at a time: starting another puts the first back to its
// poster. Under prefers-reduced-motion nothing starts by itself. A piece that does not get ready leaves its poster and says so.
(function () {
  var TIMEOUT = 15000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = null;

  // A piece's page is kept as its AI wrote it: the template's padding and a .stage capped at a width (420px for a vertical one). In the
  // frame only the picture shows: the stage fills the frame and the canvas fills the stage, its aspect kept. The frame is invisible until
  // the piece is ready, so this lands before anyone sees it.
  var FIT = 'html,body{margin:0!important;padding:0!important;height:100%!important;overflow:hidden!important}' +
    '.stage{position:fixed!important;inset:0!important;width:auto!important;max-width:none!important;margin:0!important;z-index:2147483000}' +
    '.stage canvas{width:100%!important;height:100%!important;border-radius:0!important;object-fit:contain}' +
    // the pieces are pinned to 1.0.0, whose loop button looks the same on and off without a theme (fixed in the library after 1.0.0)
    '.mc-loop{position:relative}.mc-loop[aria-pressed="false"]{opacity:.4}.mc-loop[aria-pressed="true"]{opacity:1;color:var(--mc-accent,#007AFF)}' +
    '.mc-loop[aria-pressed="true"]::after{content:"";position:absolute;left:50%;bottom:1px;width:4px;height:4px;margin-left:-2px;border-radius:50%;background:currentColor}';
  function fit(w) {
    var d = null;
    try { d = w && w.document; } catch (e) { return; }
    if (!d || !d.head || d.URL === 'about:blank' || d.getElementById('pe-live-fit')) return;
    var s = d.createElement('style');
    s.id = 'pe-live-fit';
    s.textContent = FIT;
    d.head.appendChild(s);
  }

  function stop(fig) {
    var f = fig.querySelector('iframe');
    if (f) f.remove();                                       // the iframe goes, and its sound with it
    fig.classList.remove('is-live', 'is-ready');
    if (current === fig) current = null;
  }

  function say(fig, text) {
    var n = fig.querySelector('.live-note');
    if (!n) { n = document.createElement('p'); n.className = 'live-note'; n.setAttribute('role', 'status'); fig.appendChild(n); }
    n.textContent = text;
  }

  function start(fig, opts) {
    if (current && current !== fig) stop(current);
    if (fig.querySelector('iframe')) return;
    current = fig;
    var n = fig.querySelector('.live-note');
    if (n) n.remove();
    var label = (fig.querySelector('.live-play') || {}).getAttribute ? fig.querySelector('.live-play').getAttribute('aria-label') : '';
    var ifr = document.createElement('iframe');
    ifr.src = fig.getAttribute('data-page');
    ifr.allow = 'autoplay; fullscreen';
    ifr.title = (label || 'A piece').replace(/^Play /, '');
    fig.appendChild(ifr);
    fig.classList.add('is-live');
    var t0 = Date.now();
    (function poll() {
      if (!ifr.isConnected) return;
      var w = null;
      try { w = ifr.contentWindow; } catch (e) { /* another origin: never on this site */ }
      fit(w);
      var logs = (w && w.__logs) || [];
      var failed = false;
      for (var i = 0; i < logs.length; i++) if (/init failed/.test(String(logs[i]))) failed = true;
      if (!failed && w && w.__ready === true) {
        fig.classList.add('is-ready');
        var movie = w.movie;
        if (movie && typeof movie.play === 'function') {
          if (opts && opts.muted) { try { movie.muted = true; } catch (e) { /* the bar still works */ } }   // no click yet: a browser would block the sound
          Promise.resolve(typeof movie.gotoFrame === 'function' ? movie.gotoFrame(0) : null).then(function () { movie.play(); }).catch(function () { /* the bar still works */ });
        }
        return;
      }
      if (failed || Date.now() - t0 > TIMEOUT) { stop(fig); say(fig, 'This browser could not play it live.'); return; }
      setTimeout(poll, 120);
    })();
  }

  function wire(fig) {
    var btn = fig.querySelector('.live-play');
    if (btn) btn.addEventListener('click', function (e) { e.stopPropagation(); start(fig); });
    var img = fig.querySelector('img');
    if (img) img.addEventListener('click', function () { start(fig); });
    if (fig.hasAttribute('data-autoplay') && !reduce && 'IntersectionObserver' in window) {
      var seen = false;
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting && !seen) { seen = true; io.disconnect(); if (!current) start(fig, { muted: true }); }
      }, { threshold: 0.5 });
      io.observe(fig);
    }
  }

  window.peLive = { start: start, stop: stop };                 // for a page that swaps what a player plays (the landing page's language tabs)

  function init() { var all = document.querySelectorAll('figure.live'); for (var i = 0; i < all.length; i++) wire(all[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
