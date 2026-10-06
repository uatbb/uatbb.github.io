/* ===== المصادقة: دخول / إنشاء حساب / خروج ===== */
(function () {
  const A = (window.Auth = {});
  const $ = (id) => document.getElementById(id);

  A.onAuthed = null; // يُعيَّن من app.js
  A.onSignedOut = null;
  let wasAuthed = false;

  // مهلة خمول: خروج تلقائي بعد 30 دقيقة بلا نشاط
  const IDLE_MS = 30 * 60 * 1000;
  let idleTimer = null;
  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      try { toast(I18N.t('t_idle'), 'warn', 6000); } catch (e) {}
      DB.auth.signOut();
    }, IDLE_MS);
  }
  function disarmIdle() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }
  ['click', 'keydown', 'scroll', 'touchstart'].forEach((ev) => {
    document.addEventListener(ev, () => { if (wasAuthed) armIdle(); }, { passive: true });
  });

  A.init = function () {
    updateUI(false);
    DB.auth.getSession().then(({ data }) => {
      updateUI(!!(data && data.session));
    });
    DB.auth.onAuthStateChange((_event, session) => {
      updateUI(!!session);
    });

    const form = $('login-form');
    if (form) form.addEventListener('submit', onLogin);
    const lo = $('logout-btn');
    if (lo) lo.addEventListener('click', () => DB.auth.signOut());
    const plo = $('pending-logout');
    if (plo) plo.addEventListener('click', () => DB.auth.signOut());
    bindSelfRegister();
  };

  /* ---------- طلب حساب جديد (تسجيل ذاتي → موافقة الإدارة) ---------- */

  function bindSelfRegister() {
    const btn = $('req-acc-btn');
    if (btn) btn.addEventListener('click', () => $('req-acc-box').classList.toggle('hidden'));
    const reqForm = $('req-acc-form');
    if (!reqForm) return;
    reqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('rq-name').value.trim();
      const email = $('rq-email').value.trim();
      const pass = $('rq-pass').value;
      const msg = $('rq-msg');
      const show = (txt, ok) => {
        msg.textContent = txt;
        msg.className = 'text-[11px] mt-2 leading-relaxed ' + (ok ? 'text-emerald-600 font-bold' : 'text-red-600');
        msg.classList.remove('hidden');
      };
      if (!name || !email || !pass) return show(I18N.t('t_fill'), false);
      if (pass.length < 8) return show(I18N.t('t_pass_short'), false);
      const sub = reqForm.querySelector('button[type=submit]');
      setBusy(sub, true, I18N.t('busy_login'));
      try {
        const { data, error } = await DB.functions.invoke('manage-users', {
          body: { action: 'self-register', full_name: name, email, password: pass },
        });
        if (error) return show(I18N.t('t_fail', { msg: error.message || error }), false);
        if (data && data.error === 'bad_email') return show(I18N.t('t_bad_email'), false);
        if (data && data.error === 'weak_password') return show(I18N.t('t_pass_short'), false);
        if (data && data.error) return show(I18N.t('t_fail', { msg: data.error }), false);
        show(I18N.t('rq_done'), true);
        reqForm.reset();
      } catch (err) {
        show(I18N.t('t_fail', { msg: (err && err.message) || err }), false);
      } finally {
        setBusy(sub, false, I18N.t('rq_submit'));
      }
    });
  }

  function updateUI(authed) {
    $('login-card').classList.toggle('hidden', authed);
    $('authed-app').classList.toggle('hidden', !authed);
    if (authed) {
      armIdle();
      DB.auth.getUser().then(({ data }) => {
        const nameEl = $('user-name');
        if (nameEl && data && data.user) {
          nameEl.textContent = (data.user.user_metadata && data.user.user_metadata.full_name) || (data.user.email ? data.user.email.split('@')[0] : '') || '';
          nameEl.dir = 'auto';
        }
      });
      if (A.onAuthed) A.onAuthed();
    } else {
      disarmIdle();
      if (wasAuthed && A.onSignedOut) {
        // انتقال فعلي من دخول إلى خروج (لا عند إقلاع الصفحة)
        A.onSignedOut();
      }
    }
    wasAuthed = authed;
  }

  function onLogin(e) {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return toast(I18N.t('t_login_fill'), 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(I18N.t('t_bad_email'), 'error');
    const btn = $('login-form button[type=submit]');
    setBusy(btn, true, I18N.t('busy_login'));
    DB.auth.signInWithPassword({ email, password }).then(({ error }) => {
      setBusy(btn, false, I18N.t('login_btn'));
      if (error) {
        const msg =
          error.message === 'Invalid login credentials'
            ? I18N.t('t_login_invalid')
            : I18N.t('t_login_fail', { msg: error.message });
        toast(msg, 'error', 5000);
      }
    });
  }
})();
