/* يُحمّل قبل التنسيق لتطبيق الثيم فوراً بدون وميض */
(function () {
  var t = 'paper';
  try {
    var q = new URLSearchParams(window.location.search).get('theme');
    t = q || localStorage.getItem('tp_theme_v2') || 'paper';
  } catch (e) {}
  if (['paper', 'amber', 'emerald', 'night', 'violet', 'light'].indexOf(t) < 0) t = 'paper';
  document.documentElement.setAttribute('data-theme', t);
})();
