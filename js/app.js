/* ===== نقطة الدخول: توجيه ذكي + المصادقة + النوافذ ===== */
(function () {
  const $ = (id) => document.getElementById(id);
  let adminStarted = false;
  let lastUserId = null;

  /* ---------- تبديل التبويبات ---------- */
  window.switchTo = function (id) {
    ['tab-dashboard', 'tab-create', 'tab-tenders', 'tab-opening', 'tab-accounts', 'tab-backup'].forEach((s) => {
      const el = $(s);
      if (el) el.classList.add('hidden');
    });
    const target = $(id);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach((b) => {
      const on = b.dataset.tab === id;
      b.classList.toggle('nav-active', on);
      b.classList.toggle('text-slate-500', !on);
    });
    const settingsBtn = $('settings-btn');
    if (settingsBtn) settingsBtn.classList.toggle('active', id === 'tab-accounts' || id === 'tab-backup');
  };

  function initBottomNav() {
    const tabLoadAt = {};
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;
        const now = Date.now();
        if (target !== 'tab-create' && tabLoadAt[target] && now - tabLoadAt[target] < 15000) {
          window.switchTo(target);
          return;
        }
        window.switchTo(target);
        tabLoadAt[target] = now;
        if (target === 'tab-dashboard') window.Admin.loadDashboard();
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
    ['qr-modal', 'downloads-modal', 'open-modal', 'edit-account-modal', 'change-password-modal', 'forgot-password-modal'].forEach((id) => {
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
      lb.innerHTML = I18N.label();
      lb.addEventListener('click', () => I18N.setLang(I18N.other()));
    }
    document.addEventListener('langchange', () => {
      const A = window.Admin;
      if (A && adminStarted) {
        if (A.updateRoleBadge) A.updateRoleBadge();
        if (A.loadDashboard) A.loadDashboard();
        if (A.refreshTenders) A.refreshTenders();
        if (A.loadOpening) A.loadOpening();
        if (A.refreshAccounts) A.refreshAccounts();
        if (A.checkOpeningReminder) A.checkOpeningReminder();
      }
    });
  }

  function initSettingsMenu() {
    const btn = $('settings-btn');
    const menu = $('settings-menu');
    if (!btn || !menu) return;
    const close = () => {
      menu.classList.add('hidden');
      btn.classList.remove('active');
    };
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !willOpen);
      btn.classList.toggle('active', willOpen);
    });
    menu.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', close));
    const cpOpen = $('cp-open-btn');
    if (cpOpen) cpOpen.addEventListener('click', () => {
      close();
      openModal('change-password-modal');
    });
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('hidden') && !e.target.closest('.settings-wrap')) close();
    });
  }

  function initForgotPassword() {
    const openBtn = $('forgot-pass-btn');
    const sendBtn = $('fp-send-btn');
    if (openBtn) openBtn.addEventListener('click', () => openModal('forgot-password-modal'));
    if (!sendBtn) return;
    sendBtn.addEventListener('click', async () => {
      const email = $('fp-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) return toast(t('t_bad_email'), 'error');
      if (!window.DB || !window.DB.auth) return toast(t('forgot_fail'), 'error');
      sendBtn.disabled = true;
      const redirectTo = (window.TENDER_CONFIG && window.TENDER_CONFIG.PUBLIC_BASE_URL) || window.location.origin;
      const { error } = await window.DB.auth.resetPasswordForEmail(email, { redirectTo });
      sendBtn.disabled = false;
      if (error) {
        toast(t('forgot_fail') + ' — ' + esc(error.message || error), 'error', 7000);
        return;
      }
      $('fp-email').value = '';
      toast(t('forgot_sent'), 'success', 7000);
      closeModal('forgot-password-modal');
    });
  }

  function initChangePassword() {
    const save = $('cp-save-btn');
    if (!save) return;
    save.addEventListener('click', async () => {
      const pw = $('cp-new').value;
      const confirmPw = $('cp-confirm').value;
      if (!pw || pw.length < 8) return toast(t('acc_pass_short'), 'error');
      if (pw !== confirmPw) return toast(t('cp_pass_mismatch'), 'error');
      if (!window.DB || !window.DB.auth) return toast(t('cp_fail'), 'error');
      save.disabled = true;
      const { error } = await window.DB.auth.updateUser({ password: pw });
      save.disabled = false;
      if (error) {
        toast(t('cp_fail') + ' — ' + esc(error.message || error), 'error', 6000);
        return;
      }
      const newEl = $('cp-new');
      const confirmEl = $('cp-confirm');
      if (newEl) newEl.value = '';
      if (confirmEl) confirmEl.value = '';
      toast(t('cp_success'), 'success');
      closeModal('change-password-modal');
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
    initSettingsMenu();
    initChangePassword();
    initForgotPassword();

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
