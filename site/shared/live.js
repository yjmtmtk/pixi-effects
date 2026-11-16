// The live player shared by the site pages: a poster first, then the piece itself (its own page, in an iframe), playing live.
//   <figure class="live" data-page="<the piece's page>" [data-autoplay]><img src="poster.jpg" alt="…"><button class="live-play" aria-label="Play …">▶</button></figure>
// A click (or, with data-autoplay, being half on screen) starts it. One piece plays at a time: starting another puts the first back to its
// poster. Under prefers-reduced-motion nothing starts by itself. A piece that does not get ready leaves its poster and says so.
(function () {
  var TIMEOUT = 15000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var current = null;

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

  function init() { var all = document.querySelectorAll('figure.live'); for (var i = 0; i < all.length; i++) wire(all[i]); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
