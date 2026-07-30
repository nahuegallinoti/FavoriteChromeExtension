// Aplica el tema antes del primer render para evitar flash
(function () {
  try {
    var t = localStorage.getItem('mp-theme');
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.dataset.theme = t;
  } catch (e) { /* sin storage */ }
})();
