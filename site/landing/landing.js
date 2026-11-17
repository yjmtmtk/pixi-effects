// The landing page's own behaviour: the hero's language tabs (each puts its sentence and its piece in the hero). The copy buttons: site/shared/copy.js.
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
      var old = fig.querySelector('.live-note');
      if (old) old.remove();                                  // a note a failed piece left was about that piece
      fig.setAttribute('data-page', tab.getAttribute('data-page'));
      var img = fig.querySelector('img');
      img.src = tab.getAttribute('data-poster');
      img.alt = tab.getAttribute('data-alt');
      var w = tab.getAttribute('data-w'), h = tab.getAttribute('data-h');
      img.setAttribute('width', w); img.setAttribute('height', h);
      fig.style.setProperty('--ar', (w / h).toFixed(4));                // the box takes the new piece's shape before its poster loads
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

  function init() { tabs(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
