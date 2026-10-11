(function () {
  var K = 'gastos-theme', root = document.documentElement;
  function sys() { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function cur() { return root.getAttribute('data-theme') || sys(); }
  function paint() {
    var dark = cur() === 'dark', b = document.getElementById('theme');
    if (b) {
      b.textContent = dark ? '☀' : '☾';
      b.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#171715' : '#185FA5');
  }
  var saved = null;
  try { saved = localStorage.getItem(K); } catch (e) { }
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', function () {
    paint();
    var b = document.getElementById('theme');
    if (b) b.addEventListener('click', function () {
      var n = cur() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', n);
      try { localStorage.setItem(K, n); } catch (e) { }
      paint();
    });
  });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', paint);
  }
})();
