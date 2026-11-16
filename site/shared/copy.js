// The copy buttons shared by the site pages: <button data-copy="ID"> copies the text of #ID. Where the clipboard is refused, it selects the
// text instead, so it can be copied by hand.
(function () {
  function wire(btn) {
    var src = document.getElementById(btn.getAttribute('data-copy'));
    if (!src) return;
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      var text = src.textContent.trim();
      function selectIt() {
        var r = document.createRange(); r.selectNodeContents(src);
        var s = getSelection(); s.removeAllRanges(); s.addRange(r);
        btn.textContent = 'Selected: press ⌘C / Ctrl+C';
      }
      function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = label; }, 1600); }
      try { navigator.clipboard.writeText(text).then(done, selectIt); } catch (e) { selectIt(); }
    });
  }
  function init() { [].forEach.call(document.querySelectorAll('[data-copy]'), wire); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
