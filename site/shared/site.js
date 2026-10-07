// Theme toggle shared by every page: auto -> light -> dark -> auto, remembered in this browser.
(function () {
  var root = document.documentElement, btn = document.getElementById('themeBtn'), order = ['auto', 'light', 'dark'], cur = 'auto';
  if (!btn) return;
  try { cur = localStorage.getItem('pe-theme') || 'auto'; } catch (e) { /* storage blocked */ }
  function label(t) { btn.textContent = t; btn.setAttribute('aria-label', 'Colour theme: ' + t + '. Click to change'); }
  function apply(t) {
    cur = t;
    if (t === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    label(t);
    try { localStorage.setItem('pe-theme', t); } catch (e) { /* storage blocked */ }
  }
  apply(cur);
  btn.addEventListener('click', function () { apply(order[(order.indexOf(cur) + 1) % order.length]); });
})();
