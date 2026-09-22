/* ===== نقطة الدخول: توجيه ذكي + المصادقة + النوافذ ===== */
(function () {
  const $ = (id) => document.getElementById(id);
  let adminStarted = false;
  let lastUserId = null;

  /* ---------- تبديل التبويبات ---------- */
  window.switchTo = function (id) {
    ['tab-create', 'tab-tenders', 'tab-opening', 'tab-accounts'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.add('hidden');
    });
    const target = $(id);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('bg-primary-800', on);
      b.classList.toggle('text-white', on);
      b.classList.toggle('text-slate-500', !on);
    });
  };

  function initBottomNav() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        window.switchTo(target);
        if (target === 'tab-tenders') window.Admin.refreshTenders();
        if (target === 'tab-opening') window.Admin.loadOpening();
        if (target === 'tab-accounts') window.Admin.refreshAccounts();
      });
    });
  }

  function startAdminApp() {
    DB.auth.getUser().then(({ data }) => {
      const uid = data && data.user ? data.user.id : null;
      // تبديل الحساب في نفس التبويب → إعادة تحميل كاملة لحالة نظيفة
      if (lastUserId && uid && lastUserId !== uid) {
        location.reload();
        return;
      }
      lastUserId = uid;
      if (adminStarted) return;
      adminStarted = true;
      initBottomNav();
      window.Admin.init();
    });
  }

  /* ---------- إغلاق النوافذ المنبثقة ---------- */
  function initModals() {
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });
    ['qr-modal', 'downloads-modal', 'open-modal'].forEach((id) => {
      const el = $(id);
      if (el) {
        el.addEventListener('click', (e) => {
          if (e.target === el) closeModal(id);
        });
      }
    });
  }

  /* ---------- رمز قصير (?c=012026) — نفس منطق الموقع العام ---------- */
  function resolveByCode(code) {
    const root = $('download-root');
    root.innerHTML = '<div class="text-center"><div class="spinner my-8"></div></div>';
    DB.from('tenders_public').select('id, reference, opening_date').then(({ data, error }) => {
      if (!error) {
        const matches = (data || []).filter((r) => (r.reference || '').replace(/\D/g, '') === code);
        if (matches.length) {
          matches.sort((a, b) => String(b.opening_date || '').localeCompare(String(a.opening_date || '')));
          window.DownloadPage.init(matches[0].id);
          return;
        }
      }
      window.DownloadPage.init('__invalid__');
    });
  }

  /* ---------- تبديل اللغة ---------- */
  function initLang() {
    const lb = $('lang-btn');
    if (lb) {
      lb.textContent = I18N.label();
      lb.addEventListener('click', () => I18N.setLang(I18N.other()));
    }
    document.addEventListener('langchange', () => {
      const A = window.Admin;
      if (A && adminStarted) {
        if (A.updateRoleBadge) A.updateRoleBadge();
        if (A.refreshTenders) A.refreshTenders();
        if (A.loadOpening) A.loadOpening();
        if (A.refreshAccounts) A.refreshAccounts();
      }
    });
  }

  /* ---------- الإقلاع ---------- */
  function boot() {
    I18N.init();
    const params = new URLSearchParams(location.search);
    const token = params.get('open');
    const code = params.get('c');

    let db = null;
    try {
      db = initSupabase();
    } catch (e) {
      console.error(e);
    }

    if (!db) {
      const banner = $('setup-banner');
      if (banner) banner.classList.remove('hidden');
      return;
    }

    initModals();
    initLang();

    if (token) {
      // صفحة المتعامل: عامة، بدون تسجيل دخول
      $('page-download').classList.remove('hidden');
      window.DownloadPage.init(token);
    } else if (code) {
      $('page-download').classList.remove('hidden');
      resolveByCode(code);
    } else {
      // لوحة المدير: خلف تسجيل الدخول
      $('page-admin').classList.remove('hidden');
      window.Auth.onAuthed = startAdminApp;
      window.Auth.onSignedOut = () => setTimeout(() => location.reload(), 400);
      window.Auth.init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
