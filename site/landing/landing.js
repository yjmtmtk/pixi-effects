// The landing page's own behaviour: the hero's language tabs (each puts its sentence and its piece in the hero) and the copy buttons.
(function () {
  function tabs() {
    var list = document.querySelector('#hero [role="tablist"]');
    if (!list) return;
    var all = [].slice.call(list.querySelectorAll('[role="tab"]'));
    var panel = document.getElementById('hero-panel');
    var fig = panel.querySelector('figure.live');
    var facts = panel.querySelector('.hero-facts');

    function select(tab, focus) {
      all.forEach(function (t) { var on = t === tab; t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1; });
      if (focus) tab.focus();
      panel.setAttribute('aria-labelledby', tab.id);
      [].forEach.call(panel.querySelectorAll('.sentence'), function (p) { p.hidden = p.getAttribute('data-tab') !== tab.id; });
      if (fig.getAttribute('data-page') === tab.getAttribute('data-page')) return;
      var wasLive = fig.classList.contains('is-live');
      if (window.peLive) window.peLive.stop(fig);
      fig.setAttribute('data-page', tab.getAttribute('data-page'));
      var img = fig.querySelector('img');
      img.src = tab.getAttribute('data-poster');
      img.alt = tab.getAttribute('data-alt');
      img.removeAttribute('width'); img.removeAttribute('height');
      var btn = fig.querySelector('.live-play');
      if (btn) btn.setAttribute('aria-label', 'Play ' + tab.getAttribute('data-title'));
      if (facts) facts.innerHTML = '<ul class="facts">' + tab.getAttribute('data-meta').split(' · ').map(function (f) { var li = document.createElement('li'); li.textContent = f; return li.outerHTML; }).join('') + '</ul>';
      if (wasLive && window.peLive) window.peLive.start(fig);
    }

    all.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null;
        if (to === null) return;
        e.preventDefault();
        select(all[(to + all.length) % all.length], true);
      });
    });
  }

  function copies() {
    [].forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
      var src = document.getElementById(btn.getAttribute('data-copy'));
      var label = btn.textContent;
      btn.addEventListener('click', function () {
        var text = src.textContent.trim();
        function selectIt() {                                        // no clipboard: select the text, so it can be copied by hand
          var r = document.createRange(); r.selectNodeContents(src);
          var s = getSelection(); s.removeAllRanges(); s.addRange(r);
          btn.textContent = 'Selected: press ⌘C / Ctrl+C';
        }
        var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1600); };
        try { navigator.clipboard.writeText(text).then(done, selectIt); } catch (e) { selectIt(); }
      });
    });
  }

  function init() { tabs(); copies(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
