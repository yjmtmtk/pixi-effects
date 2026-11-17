// The copy buttons shared by the site pages: <button data-copy="ID"> copies the text of #ID. Where the clipboard is refused, it selects the
// text instead, so it can be copied by hand.
(function () {
  function wire(btn) {
    var src = document.getElementById(btn.getAttribute('data-copy'));
    if (!src) return;
    var label = btn.textContent, timer = null;              // one timer per button: a second click restarts it
    btn.addEventListener('click', function () {
      var text = src.textContent.trim();
      function selectIt() {
        var r = document.createRange(); r.selectNodeContents(src);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;   // no ⌘C on a phone
        say(touch ? 'Selected: copy it' : 'Selected: press ⌘C / Ctrl+C', 4000);
      }
      function say(text, ms) {                                    // a label for a while, then the button's own again
        btn.textContent = text;
        clearTimeout(timer);
        timer = setTimeout(function () { btn.textContent = label; }, ms);
      }
      function done() { say('Copied', 1600); }
      try { navigator.clipboard.writeText(text).then(done, selectIt); } catch (e) { selectIt(); }
    });
  }
  function init() { [].forEach.call(document.querySelectorAll('[data-copy]'), wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
