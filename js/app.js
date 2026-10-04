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
      b.classList.toggle('nav-active', on);
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

  /* ---------- تقويم الفتح العام (?cal=1) ---------- */

  const P_MONTHS_AR = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const P_MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  let calCursor = new Date();
  let calMode = false;

  function renderPublicCal(root) {
    const cur = calCursor || new Date();
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const isAr = I18N.lang === 'ar';
    const tk = (k) => I18N.t(k);
    root.innerHTML =
      '<div class="bg-white rounded-2xl shadow-lg border border-slate-200 p-4">' +
      '<div class="flex items-center justify-between mb-3">' +
      '<button id="pcal-prev" type="button" class="w-8 h-8 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-800 font-black text-lg leading-none">‹</button>' +
      '<div class="text-center">' +
      '<div class="font-black text-slate-800 text-sm">' + tk('cal_title') + '</div>' +
      '<div id="pcal-month" class="text-xs font-bold text-primary-700 mt-0.5"></div>' +
      '</div>' +
      '<button id="pcal-next" type="button" class="w-8 h-8 rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-800 font-black text-lg leading-none">›</button>' +
      '</div>' +
      '<div id="pcal-grid" class="grid grid-cols-7 gap-1"></div>' +
      '</div>';
    $('pcal-month').textContent = (isAr ? P_MONTHS_AR : P_MONTHS_FR)[m] + ' ' + y;
    const grid = $('pcal-grid');
    grid.innerHTML = '<div class="col-span-7 text-center text-slate-400 text-xs py-6"><div class="spinner my-2"></div></div>';
    const start = new Date(y, m, 1).toISOString();
    const end = new Date(y, m + 1, 1).toISOString();
    DB.from('tenders_public').select('id, reference, title, opening_date, status')
      .gte('opening_date', start)
      .lt('opening_date', end)
      .then(({ data, error }) => {
        if (error) {
          grid.innerHTML = '<div class="col-span-7 text-center text-slate-400 text-xs py-6">⚠️</div>';
          return;
        }
        const byDay = {};
        (data || []).forEach((tt) => {
          const d = new Date(tt.opening_date).getDate();
          (byDay[d] = byDay[d] || []).push(tt);
        });
        const first = new Date(y, m, 1).getDay();
        const daysIn = new Date(y, m + 1, 0).getDate();
        const today = new Date();
        const isToday = (d) => today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
        let html = '';
        for (let w = 0; w < 7; w++) html += '<div class="text-center text-[10px] font-bold text-slate-400 py-1">' + tk('cal_wd' + w) + '</div>';
        for (let b = 0; b < first; b++) html += '<div></div>';
        for (let d = 1; d <= daysIn; d++) {
          const items = byDay[d] || [];
          let chips = '';
          items.slice(0, 2).forEach((tt) => {
            const done = tt.status === 'opened';
            chips += '<div class="flex items-center gap-1 text-[10px] font-bold truncate rounded-md px-1 py-0.5 ' + (done ? 'bg-slate-100 text-slate-400 line-through' : 'bg-primary-50 text-primary-800') + '" title="' + tt.reference + ' — ' + (tt.title || '') + '">' +
              '<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:' + (done ? '#94a3b8' : '#047857') + '"></span>' +
              '<span class="truncate">' + tt.reference + '</span></div>';
          });
          if (items.length > 2) chips += '<div class="text-[9px] text-slate-400 font-bold">+' + (items.length - 2) + '</div>';
          html += '<div class="min-h-[52px] rounded-lg border p-1 ' + (isToday(d) ? 'border-primary-400 bg-primary-50/60' : 'border-slate-100') + '">' +
            '<div class="text-[10px] font-bold ' + (isToday(d) ? 'text-primary-700' : 'text-slate-400') + '">' + d + (isToday(d) ? ' ' + tk('cal_today') : '') + '</div>' +
            chips +
            '</div>';
        }
        grid.innerHTML = html;
      });
    $('pcal-prev').addEventListener('click', () => {
      calCursor = new Date(cur.getFullYear(), m - 1, 1);
      renderPublicCal(root);
    });
    $('pcal-next').addEventListener('click', () => {
      calCursor = new Date(cur.getFullYear(), m + 1, 1);
      renderPublicCal(root);
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
      if (calMode) renderPublicCal($('download-root'));
      const A = window.Admin;
      if (A && adminStarted) {
        if (A.updateRoleBadge) A.updateRoleBadge();
        if (A.refreshTenders) A.refreshTenders();
        if (A.loadOpening) A.loadOpening();
        if (A.refreshAccounts) A.refreshAccounts();
        if (A.checkOpeningReminder) A.checkOpeningReminder();
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
    } else if (params.get('cal')) {
      $('page-download').classList.remove('hidden');
      calMode = true;
      renderPublicCal($('download-root'));
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
