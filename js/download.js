/* ===== صفحة المتعامل (?open=UUID أو ?c=رمز قصير) — تصميم رسمي أنيق ثنائي اللغة ===== */
(function () {
  const D = (window.DownloadPage = {});
  const t = (k, v) => I18N.t(k, v);
  const kindName = (k) => (k === 'tender' ? t('kind_tender_s') : t('kind_consultation_s'));

  function tenderTitle() {
    if (!tender) return '';
    if (I18N.lang === 'fr' && tender.title_fr) return tender.title_fr;
    return tender.title || tender.title_fr || '';
  }

  // شارة الكلية (من بيانات العرض العام tenders_public)
  function facultyChip() {
    if (!tender || !tender.faculty_name) return '';
    const name = I18N.lang === 'ar' ? tender.faculty_name : (tender.faculty_name_fr || tender.faculty_name);
    const c = tender.faculty_color || '#475569';
    return '<span class="public-faculty" style="background:' + c + '1a;color:' + c + '">' +
      (tender.faculty_icon || '🎓') + ' ' + esc(name) + '</span>';
  }

  function kindBadge() {
    const cls = tender && tender.kind === 'tender' ? 'public-badge public-badge-tender' : 'public-badge public-badge-consultation';
    return '<span class="' + cls + '">' + kindName(tender ? tender.kind : '') + '</span>';
  }

  let token = null;
  let tender = null;
  let signed = { url: '', expiresAt: 0, updated: false };
  let lastInfo = null;
  let expiryTimer = null;
  let openingCdTimer = null;
  let currentView = null;
  let lastErr = null;
  let lastErrRetry = false;
  let langBound = false;
  let timeOffset = 0; // فرق وقت الخادم عن ساعة الجهاز (ملّي ثانية)

  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id) ? $(id).value : '');
  const root = () => $('download-root') || $('public-root');

  function applyDir() {
    document.documentElement.lang = I18N.lang;
    document.documentElement.dir = I18N.lang === 'ar' ? 'rtl' : 'ltr';
  }

  function otherLabel() {
    return I18N.lang === 'ar' ? '🇫🇷 Français' : '🇩🇿 العربية';
  }

  function stopTimers() {
    if (expiryTimer) { clearInterval(expiryTimer); expiryTimer = null; }
    if (openingCdTimer) { clearInterval(openingCdTimer); openingCdTimer = null; }
  }

  /* ---------- الهيكل: رأس متدرج أنيق + بطاقة بيضاء متداخلة ---------- */

  function shell(inner) {
    return (
      '<div>' +
      '<div class="public-topcard">' +
      '<div class="public-toprow">' +
      '<span class="public-pill">' + t('office') + '</span>' +
      '<button id="p-lang-btn" type="button" class="public-pill">' + otherLabel() + '</button>' +
      '</div>' +
      '<img src="img/logo.png" alt="" class="public-logo">' +
      '<h1>' + t('univ') + '</h1>' +
      '<p class="public-sub">' + t('p_download_sub') + '</p>' +
      '</div>' +
      '<div class="public-card">' + inner + '</div>' +
      '</div>'
    );
  }

  function stepBlock(n, label) {
    return '<div class="public-step">' +
      '<span class="public-step-num">' + n + '</span>' +
      '<span class="public-step-label">' + label + '</span>' +
      '</div>';
  }

  function stepLine() {
    return '<div class="public-step-line"></div>';
  }

  function iconCircle(emoji, tone) {
    const cls = tone ? 'public-icon public-icon-' + tone : 'public-icon';
    return '<div class="' + cls + '">' + emoji + '</div>';
  }

  /* ---------- عدّاد "كم يومًا متبقّي لفتح الأظرفة" ---------- */

  function daysText(n) {
    if (n === 1) return t('cd_1');
    if (n === 2) return t('cd_2');
    if (n >= 3 && n <= 10) return t('cd_few', { d: n });
    return t('cd_many', { d: n });
  }

  function cdUnit(id, label) {
    return '<div class="public-countdown-unit">' +
      '<div class="public-countdown-value" id="' + id + '">0</div>' +
      '<div class="public-countdown-label">' + label + '</div>' +
      '</div>';
  }

  function countdownGridHtml() {
    const sep = '<div class="public-countdown-sep">:</div>';
    return '<div class="public-countdown-grid" dir="ltr">' +
      cdUnit('cd-d', t('cd_l_days')) + sep +
      cdUnit('cd-h', t('cd_l_hours')) + sep +
      cdUnit('cd-m', t('cd_l_minutes')) + sep +
      cdUnit('cd-s', t('cd_l_seconds')) +
      '</div>';
  }

  function openingCountdownHtml() {
    if (!tender || !tender.opening_date) return '';
    const ms = new Date(tender.opening_date).getTime() - Date.now();
    if (ms <= 0) {
      return '<div class="public-countdown public-countdown-passed">' +
        '<div class="public-countdown-emoji">⏰</div>' +
        '<div class="public-countdown-body">' +
        '<div class="public-countdown-title">' + t('cd_left_title') + '</div>' +
        '<div class="public-countdown-value-lg">' + t('cd_passed') + '</div>' +
        '</div></div>';
    }
    if (ms < 86400000) {
      return '<div class="public-countdown public-countdown-warning">' +
        '<div class="public-countdown-head"><span>⏳</span>' + t('cd_less24') + '</div>' +
        countdownGridHtml() +
        '<div class="public-countdown-date" dir="auto">' + fmtDate(tender.opening_date, true) + '</div>' +
        '</div>';
    }
    return '<div class="public-countdown public-countdown-active">' +
      '<div class="public-countdown-head"><span>🗓️</span>' + t('cd_left_title') + '</div>' +
      countdownGridHtml() +
      '<div class="public-countdown-date" dir="auto">' + fmtDate(tender.opening_date, true) + '</div>' +
      '</div>';
  }

  function startOpeningCd() {
    if (openingCdTimer) clearInterval(openingCdTimer);
    openingCdTimer = null;
    const el = $('cd-d');
    if (!el || !tender) return;
    const p = (n) => String(n).padStart(2, '0');
    const tick = () => {
      const ms = new Date(tender.opening_date).getTime() - Date.now();
      const s = Math.max(0, Math.floor(ms / 1000));
      $('cd-d').textContent = String(Math.floor(s / 86400));
      $('cd-h').textContent = p(Math.floor((s % 86400) / 3600));
      $('cd-m').textContent = p(Math.floor((s % 3600) / 60));
      $('cd-s').textContent = p(s % 60);
    };
    tick();
    openingCdTimer = setInterval(tick, 1000);
  }

  function bindLangToggle() {
    if (langBound) return;
    langBound = true;
    const r = root();
    r.addEventListener('click', (e) => {
      if (e.target.closest('#p-lang-btn')) {
        I18N.setLang(I18N.other());
        rerender();
      }
    });
  }

  function rerender() {
    applyDir();
    I18N.applyStatic();
    switch (currentView) {
      case 'loading': renderLoading(); break;
      case 'notfound': renderNotFound(); break;
      case 'closed': renderClosed(); break;
      case 'opened': renderOpened(); break;
      case 'error': renderError(lastErr, lastErrRetry); break;
      case 'form': renderForm(); break;
      case 'working': renderWorking(); break;
      case 'done': renderDone(); break;
    }
  }

  D.init = async function (tt) {
    token = tt;
    tender = null;
    lastInfo = null;
    stopTimers();
    applyDir();
    bindLangToggle();
    renderLoading();
    try {
      const { data, error } = await DB.from('tenders_public').select('*').eq('id', tt).maybeSingle();
      if (error) throw error;
      if (!data) return renderNotFound();
      tender = data;
      if (isOpened()) return renderOpened();
      if (tender.status === 'published') return renderForm();
      renderClosed();
    } catch (err) {
      console.error(err);
      renderError(err, true);
    }
  };

  // فتح تلقائي: منشورة فات موعد فتحها = مفتوحة (أو status='opened' من الخادم)
  function isOpened() {
    if (!tender) return false;
    if (tender.status === 'opened') return true;
    if (tender.status === 'published' && tender.opening_date) {
      return new Date(tender.opening_date).getTime() <= Date.now();
    }
    return false;
  }

  /* ---------- حالات العرض ---------- */

  function renderLoading() {
    currentView = 'loading';
    stopTimers();
    root().innerHTML = shell(
      '<div class="public-center public-center-lg">' +
      '<div class="spinner"></div>' +
      '<p class="public-note">' + t('loading') + '</p>' +
      '</div>'
    );
  }

  function renderNotFound() {
    currentView = 'notfound';
    stopTimers();
    root().innerHTML = shell(
      '<div class="public-center">' +
      iconCircle('🚫') +
      '<h2 class="public-title">' + t('notfound_t') + '</h2>' +
      '<p class="public-text">' + t('notfound_s') + '</p>' +
      '</div>'
    );
  }

  function renderClosed() {
    currentView = 'closed';
    stopTimers();
    root().innerHTML = shell(
      '<div class="public-center">' +
      iconCircle('🔒', 'warning') +
      '<h2 class="public-title">' + t('closed_t') + '</h2>' +
      '<p class="public-text">' + t('closed_s') + '</p>' +
      '</div>'
    );
  }

  function renderOpened() {
    currentView = 'opened';
    stopTimers();
    const when = tender.opened_at || tender.opening_date;
    root().innerHTML = shell(
      '<div class="public-center">' +
      iconCircle('📬', 'success') +
      '<h2 class="public-title public-title-success">' + t('opened_t') + '</h2>' +
      '<div class="public-meta-row">' +
      '<span class="public-ref" dir="ltr">' + esc(fmtRef(tender.reference)) + '</span>' +
      kindBadge() +
      facultyChip() +
      '</div>' +
      '<p class="public-text">' + esc(tenderTitle()) + '</p>' +
      '<div class="public-green-box">' +
      '<div class="public-green-box-label">' + t('opened_time_l') + '</div>' +
      '<div class="public-green-box-value" dir="auto">' + fmtDate(when, true) + '</div>' +
      '</div>' +
      '<p class="public-note">' + t('opened_s') + '</p>' +
      '</div>'
    );
  }

  function renderError(err, retryable) {
    currentView = 'error';
    lastErr = err;
    lastErrRetry = !!retryable;
    stopTimers();
    let msg = (err && err.message) || String(err);
    if (msg.includes('get-download') || msg.includes('function')) {
      msg = t('err_func');
    }
    root().innerHTML = shell(
      '<div class="public-center">' +
      iconCircle('😕', 'danger') +
      '<h2 class="public-title">' + t('err_t') + '</h2>' +
      '<p class="public-text">' + esc(msg) + '</p>' +
      (retryable ? '<button id="retry-btn" type="button" class="public-btn public-btn-secondary">' + t('retry') + '</button>' : '') +
      '</div>'
    );
    const b = $('retry-btn');
    if (b) b.addEventListener('click', () => D.init(token));
  }

  function renderForm() {
    currentView = 'form';
    stopTimers();
    const openingLabel = t('f_opening').replace(' *', '').replace(' *', '');
    root().innerHTML = shell(
      stepBlock(1, t('step1')) +
      '<div class="public-section">' +
      '<div class="public-meta-row">' +
      '<span class="public-ref" dir="ltr">' + esc(fmtRef(tender.reference)) + '</span>' +
      kindBadge() +
      facultyChip() +
      '<span class="public-badge public-badge-status">' + t('p_published') + '</span>' +
      '</div>' +
      '<p class="public-text">' + esc(tenderTitle()) + '</p>' +
      '</div>' +
      openingCountdownHtml() +
      '<div class="public-info-grid">' +
      '<div class="public-info-box"><div class="public-info-label">' + t('f_duration').replace(' *', '') + '</div><div class="public-info-value">' + esc(tender.duration || '—') + '</div></div>' +
      '<div class="public-info-box public-info-box-teal"><div class="public-info-label">' + openingLabel + '</div><div class="public-info-value" dir="auto">' + fmtDate(tender.opening_date, true) + '</div></div>' +
      '</div>' +
      '<form id="bidder-form" class="public-form">' +
      stepBlock(2, t('step2')) +
      stepLine() +
      '<div class="public-field"><label class="lbl">🏢 ' + t('f_company') + '</label>' +
      '<input id="d-company" class="inp" type="text" required placeholder="' + esc(t('f_company_ph')) + '"></div>' +
      '<div class="public-field"><label class="lbl">📞 ' + t('f_phone') + '</label>' +
      '<input id="d-phone" class="inp" type="tel" dir="ltr" required placeholder="0550 00 00 00"></div>' +
      '<div class="public-field"><label class="lbl">✉️ ' + t('f_email') + '</label>' +
      '<input id="d-email" class="inp" type="email" dir="ltr" required placeholder="you@example.com"></div>' +
      stepLine() +
      stepBlock(3, t('step3')) +
      '<button type="submit" class="public-btn public-btn-primary public-w-full">' + t('btn_download') + '</button>' +
      '<p class="public-note">' + t('form_note') + '</p>' +
      '</form>'
    );
    $('bidder-form').addEventListener('submit', onFormSubmit);
    startOpeningCd();
  }

  function renderWorking(msg) {
    currentView = 'working';
    stopTimers();
    root().innerHTML = shell(
      '<div class="public-center public-center-lg">' +
      '<div class="spinner"></div>' +
      '<p class="public-text">' + esc(msg || t('working')) + '</p>' +
      '</div>'
    );
  }

  function renderDone() {
    currentView = 'done';
    stopTimers();
    root().innerHTML = shell(
      '<div class="public-center">' +
      iconCircle('✅', 'success') +
      '<h2 class="public-title">' + t('done_title') + '</h2>' +
      '<p class="public-text">' +
      (signed.updated
        ? t('done_upd', { c: esc(lastInfo.company) })
        : t('done_new', { c: esc(lastInfo.company) })) +
      '</p>' +
      '<div class="public-green-box">' +
      '<div class="public-green-box-label">' + t('expiry_l') + '</div>' +
      '<div id="expiry-cd" class="public-green-box-value" dir="ltr"></div>' +
      '</div>' +
      '<button id="redownload-btn" type="button" class="public-btn public-btn-secondary public-w-full">' + t('redownload') + '</button>' +
      '</div>'
    );
    $('redownload-btn').addEventListener('click', () => D.redownload());
    expiryTimer = setInterval(() => {
      const el = $('expiry-cd');
      if (!el) return clearInterval(expiryTimer);
      const ms = signed.expiresAt - Date.now();
      if (ms <= 0) {
        el.textContent = t('cd_expire_in');
        el.classList.add('text-red-300');
        return;
      }
      el.textContent = fmtCountdown(ms);
    }, 1000);
  }

  /* ---------- منطق التحميل (عبر دالة الخادم) ---------- */

  function onFormSubmit(e) {
    e.preventDefault();
    const company = val('d-company').trim();
    const phone = val('d-phone').trim();
    const email = val('d-email').trim();
    if (!company || !phone || !email) return toast(t('t_pub_fill'), 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast(t('t_pub_bademail'), 'error');
    startDownload({ company, phone, email });
  }

  async function fetchViaFunction(info) {
    const { data, error } = await DB.functions.invoke('get-download', {
      body: {
        tender_id: tender.id,
        company: info.company,
        phone: info.phone,
        email: info.email,
      },
    });
    if (error) {
      if (String(error.message || error).includes('get-download')) {
        throw new Error(t('err_func'));
      }
      throw error;
    }
    if (!data || !data.url) {
      if (data && data.error === 'unavailable') {
        throw new Error(t('err_unavailable'));
      }
      throw new Error(t('err_link'));
    }
    return { url: data.url, expiresAt: Date.now() + (data.expires_in || 600) * 1000, updated: !!data.updated };
  }

  function startDownload(info) {
    lastInfo = info;
    renderWorking(t('working'));
    fetchViaFunction(info).then((r) => {
      signed = r;
      window.location.href = signed.url;
      renderDone();
    }).catch((err) => {
      console.error(err);
      renderError(err, false);
    });
  }

  D.redownload = async function () {
    if (!tender || !lastInfo) return;
    try {
      if (signed.url && Date.now() < signed.expiresAt - 30000) {
        window.location.href = signed.url;
        toast(t('toast_dl_working'), 'success', 2500);
        return;
      }
      renderWorking(t('redrawing'));
      signed = await fetchViaFunction(lastInfo);
      window.location.href = signed.url;
      renderDone();
    } catch (err) {
      console.error(err);
      toast(t('toast_dl_fail', { msg: (err && err.message) || err }), 'error', 6000);
      D.init(token);
    }
  };

  D.onLangChange = function () {
    if (currentView) rerender();
  };
  Object.defineProperty(D, 'view', { get: () => currentView });
})();
