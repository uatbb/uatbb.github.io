/* ===== المصادقة: دخول / إنشاء حساب / خروج ===== */
(function () {
  const A = (window.Auth = {});
  const $ = (id) => document.getElementById(id);

  A.onAuthed = null; // يُعيَّن من app.js
  A.onSignedOut = null;
  let wasAuthed = false;

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
  };

  function updateUI(authed) {
    $('login-card').classList.toggle('hidden', authed);
    $('authed-app').classList.toggle('hidden', !authed);
    if (authed) {
      DB.auth.getUser().then(({ data }) => {
        const nameEl = $('user-name');
        if (nameEl && data && data.user) nameEl.textContent = data.user.email || '';
      });
      if (A.onAuthed) A.onAuthed();
    } else if (wasAuthed && A.onSignedOut) {
      // انتقال فعلي من دخول إلى خروج (لا عند إقلاع الصفحة)
      A.onSignedOut();
    }
    wasAuthed = authed;
  }

  function onLogin(e) {
    e.preventDefault();
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    if (!email || !password) return toast('أدخل البريد وكلمة المرور', 'error');
    const btn = $('login-form button[type=submit]');
    setBusy(btn, true, '⏳ جارٍ الدخول...');
    DB.auth.signInWithPassword({ email, password }).then(({ error }) => {
      setBusy(btn, false, 'دخول');
      if (error) {
        const msg =
          error.message === 'Invalid login credentials'
            ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
            : 'فشل الدخول: ' + error.message;
        toast(msg, 'error', 5000);
      }
    });
  }
})();
