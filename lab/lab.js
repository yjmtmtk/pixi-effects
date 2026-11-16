// The Lab's own behaviour: the zoom of "Sharp at any zoom" (the MP4 stretches; the page, given a bigger box, draws itself again at that size)
// and the title and colour of "Changes while you watch" (movie.setVars on the live piece). The copy button: ../site/shared/copy.js.
(function () {
  function zoom() {
    var block = document.getElementById('sharp');
    if (!block) return;
    var range = block.querySelector('input[type="range"]'), out = block.querySelector('output');
    var inner = [].map.call(block.querySelectorAll('.zoom-box'), function (b) { return b.firstElementChild; });
    function apply() {
      var z = Number(range.value);
      out.textContent = z + '×';
      inner.forEach(function (el) {
        // the element grows to z times its box and stays centred: the video stretches its pixels; the page's canvas follows its window (resize)
        el.style.width = (z * 100) + '%';
        el.style.height = (z * 100) + '%';
        el.style.left = (-(z - 1) * 50) + '%';
        el.style.top = (-(z - 1) * 50) + '%';
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
    function movie() { try { var w = frame.contentWindow; return w && w.__ready === true ? w.movie : null; } catch (e) { return null; } }
    function push() {
      var m = movie();
      if (!m) { timer = setTimeout(push, 250); return; }                   // not ready yet: try again
      // the object is made in the piece's own window: pixi-effects 1.0.0 takes only a plain object of its own realm (fixed in 1.0.1)
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

  function init() { zoom(); liveEdit(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
