/* ===== اختيار مظهر الموقع (محفوظ في المتصفح) ===== */
(function () {
  const KEY = 'tp_theme_v2';
  const VALID = ['paper', 'amber', 'emerald', 'night', 'violet', 'light'];
  const LABELS = {
    paper: 'theme_paper',
    amber: 'theme_amber',
    emerald: 'theme_emerald',
    night: 'theme_night',
    violet: 'theme_violet',
    light: 'theme_light',
  };

  function current() {
    return document.documentElement.getAttribute('data-theme') || 'amber';
  }
  function tr(key) {
    return window.I18N && window.I18N.t ? window.I18N.t(key) : key;
  }
  function esc(s) {
    return window.esc ? window.esc(s) : String(s);
  }
  function mark() {
    document.querySelectorAll('[data-theme-option]').forEach((b) => {
      b.classList.toggle('active', b.dataset.themeOption === current());
    });
  }
  function render() {
    const grid = document.getElementById('theme-grid');
    if (!grid) return;
    grid.innerHTML = VALID.map((k) =>
      '<button type="button" class="theme-option" data-theme-option="' + k + '">' +
      '<div class="theme-preview ' + k + '"></div>' +
      '<div class="theme-option-name">' + esc(tr(LABELS[k])) + '</div>' +
      '</button>'
    ).join('');
    mark();
  }
  function apply(key) {
    if (VALID.indexOf(key) < 0) return;
    document.documentElement.setAttribute('data-theme', key);
    try { localStorage.setItem(KEY, key); } catch (e) {}
    mark();
    if (window.toast) window.toast(tr('theme_saved'), 'success');
  }
  function railTips() {
    document.querySelectorAll('.sidebar .side-link').forEach((b) => {
      const s = b.querySelector('span[data-i18n]');
      if (s) b.title = s.textContent.trim();
    });
  }
  function init() {
    render();
    railTips();
    const btn = document.getElementById('theme-btn');
    if (btn) btn.addEventListener('click', () => {
      const modal = document.getElementById('theme-modal');
      if (modal) modal.classList.remove('hidden');
    });
    const grid = document.getElementById('theme-grid');
    if (grid) grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-theme-option]');
      if (!b) return;
      apply(b.dataset.themeOption);
      const modal = document.getElementById('theme-modal');
      if (modal) modal.classList.add('hidden');
    });
  }
  document.addEventListener('langchange', () => { render(); railTips(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
