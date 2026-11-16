// The Lab's own behaviour. The copy button: ../site/shared/copy.js.
// - Each block with live panes plays them while it is on screen, unless the viewer asks for less motion: then nothing moves until its
//   Play button (one button per block plays and pauses everything in it, the MP4 included).
// - A live pane stands on the piece's poster; when the piece cannot start (no renderer, nothing ready in 15 s) the poster stays with a note.
// - "Sharp at any zoom": the MP4 stretches; the page, given a bigger box, draws itself again at that size.
// - "Changes while you watch": the title and the colour go to the piece with movie.setVars.
(function () {
  var TIMEOUT = 15000;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** The movie of a live pane's iframe, once it is ready (same origin); null before, or when it failed. */
  function movieOf(frame) {
    if (frame.__failed) return null;
    try { var w = frame.contentWindow; return w && w.__ready === true ? w.movie : null; } catch (e) { return null; }
  }

  /** Watch a pane's iframe after each load: ready shows it over its poster; a failure or a timeout leaves the poster and says so. */
  function watch(frame) {
    var box = frame.parentElement;
    function check() {
      frame.__failed = false;
      box.classList.remove('is-ready');
      var old = box.querySelector('.live-note');
      if (old) old.remove();
      var t0 = Date.now();
      (function poll() {
        var w = null;
        try { w = frame.contentWindow; } catch (e) { /* another origin: never on this site */ }
        var logs = (w && w.__logs) || [], failed = false;
        for (var i = 0; i < logs.length; i++) if (/init failed/.test(String(logs[i]))) failed = true;
        if (!failed && w && w.__ready === true) { box.classList.add('is-ready'); if (frame.__onReady) frame.__onReady(); return; }
        if (failed || Date.now() - t0 > TIMEOUT) {
          frame.__failed = true;
          var n = document.createElement('p'); n.className = 'live-note'; n.setAttribute('role', 'status');
          n.textContent = 'This browser could not play it live.';
          box.appendChild(n);
          return;
        }
        setTimeout(poll, 150);
      })();
    }
    frame.addEventListener('load', check);
    check();
  }

  /** A block's panes play together: while on screen (or, under reduced motion, only after its Play button), paused off screen. */
  function panes(block) {
    var frames = [].slice.call(block.querySelectorAll('.live-pane iframe'));
    var videos = [].slice.call(block.querySelectorAll('video'));
    var btn = block.querySelector('[data-play-panes]');
    var want = !reduce, seen = false;
    function apply() {
      var on = want && seen;
      frames.forEach(function (f) { var m = movieOf(f); if (m) { if (on && !m.isPlaying) m.play(); else if (!on && m.isPlaying) m.pause(); } });
      videos.forEach(function (v) { if (on) { var p = v.play(); if (p && p.catch) p.catch(function () { /* the poster stays */ }); } else v.pause(); });
      if (btn) btn.textContent = want ? 'Pause' : 'Play';
    }
    frames.forEach(function (f) { f.__onReady = apply; watch(f); });
    if (btn) btn.addEventListener('click', function () { want = !want; seen = true; apply(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { seen = entries[0].isIntersecting; apply(); }, { threshold: 0.25 }).observe(block);
    } else { seen = true; apply(); }
  }

  function zoom() {
    var block = document.getElementById('sharp');
    if (!block) return;
    var range = block.querySelector('input[type="range"]'), out = block.querySelector('output');
    var inner = [].map.call(block.querySelectorAll('.zoom-box'), function (b) { return [].slice.call(b.children).filter(function (c) { return c.tagName !== 'P'; }); });
    function apply() {
      var z = Number(range.value);
      out.textContent = z + '×';
      inner.forEach(function (els) {
        els.forEach(function (el) {
          // the element grows to z times its box and stays centred: the video stretches its pixels; the page's canvas follows its window (resize)
          el.style.width = (z * 100) + '%';
          el.style.height = (z * 100) + '%';
          el.style.left = (-(z - 1) * 50) + '%';
          el.style.top = (-(z - 1) * 50) + '%';
        });
      });
    }
    range.addEventListener('input', apply);
    apply();
  }

  function liveEdit() {
    var block = document.getElementById('live-edit');
    if (!block) return;
    var frame = block.querySelector('iframe'), input = block.querySelector('input[type="text"]');
    var swatches = [].slice.call(block.querySelectorAll('.swatch'));
    var want = { title: input.value, accent: '#e91e63' }, timer = 0;
    function push() {
      if (frame.__failed) return;                                          // it could not start: stop trying
      var m = movieOf(frame);
      if (!m) { timer = setTimeout(push, 250); return; }                   // not ready yet: try again
      // the object is made in the piece's own window: pixi-effects 1.0.0 takes only a plain object of its own realm
      var vars = frame.contentWindow.JSON.parse(JSON.stringify({ title: want.title || ' ', accent: want.accent }));
      m.setVars(vars).catch(function () { /* the old picture stays */ });
    }
    function later() { clearTimeout(timer); timer = setTimeout(push, 120); }
    input.addEventListener('input', function () { want.title = input.value; later(); });
    swatches.forEach(function (b) {
      b.addEventListener('click', function () {
        swatches.forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
        want.accent = b.getAttribute('data-accent');
        later();
      });
    });
  }

  function init() {
    zoom();
    liveEdit();
    ['sharp', 'live-edit'].forEach(function (id) { var b = document.getElementById(id); if (b) panes(b); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
