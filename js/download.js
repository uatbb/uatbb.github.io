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
  const FAC_SVG = {
    cap: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.6 2.8 9 12 13.4l9.2-4.4z"/><path d="M6.6 11v4.4c0 1.4 2.4 2.5 5.4 2.5s5.4-1.1 5.4-2.5V11"/><path d="M21.2 9v5"/></svg>',
    bank: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.4 9.6 12 4.8l8.6 4.8"/><path d="M6.2 10v7.4M10.2 10v7.4M13.8 10v7.4M17.8 10v7.4"/><path d="M3.6 20.4h16.8"/></svg>',
    chart: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16"/><rect x="5.6" y="11" width="3.4" height="6" rx="1"/><rect x="10.3" y="6.6" width="3.4" height="10.4" rx="1"/><rect x="15" y="13.4" width="3.4" height="3.6" rx="1"/></svg>',
    crown: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 17.4 3.2 7.6l5 3.5L12 4.6l3.8 6.5 5-3.5-1 9.8z"/><path d="M4.6 20.2h14.8"/></svg>',
    bulb: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.6a5.6 5.6 0 0 1 3.3 10.1c-.7.5-1.1 1.3-1.2 2.1H9.9c-.1-.8-.5-1.6-1.2-2.1A5.6 5.6 0 0 1 12 3.6z"/><path d="M9.9 18.4h4.2M10.6 20.6h2.8"/></svg>',
    building: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.4" y="3.6" width="13.2" height="16.8" rx="2"/><path d="M9 7.6h1.6M13.4 7.6H15M9 11.4h1.6M13.4 11.4H15M9 15.2h1.6M13.4 15.2H15"/><path d="M10.4 20.4v-3h3.2v3"/></svg>'
  };
  const FAC_ICONS = { '🏛️': 'bank', '🏛': 'bank', '📊': 'chart', '⚖️': 'crown', '⚖': 'crown', '🔬': 'bulb', '🌍': 'globe' };
  function facIconHtml(e) {
    return FAC_SVG[FAC_ICONS[String(e || '').trim()] || 'cap'];
  }

  function facultyChip() {
    if (!tender || !tender.faculty_name) return '';
    const name = I18N.lang === 'ar' ? tender.faculty_name : (tender.faculty_name_fr || tender.faculty_name);
    const c = tender.faculty_color || '#475569';
    return '<span class="public-faculty" style="background:' + c + '1a;color:' + c + '">' +
      facIconHtml(tender.faculty_icon) + ' ' + esc(name) + '</span>';
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
        '<div class="public-countdown-emoji"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 1.9"/></svg></div>' +
        '<div class="public-countdown-body">' +
        '<div class="public-countdown-title">' + t('cd_left_title') + '</div>' +
        '<div class="public-countdown-value-lg">' + t('cd_passed') + '</div>' +
        '</div></div>';
    }
    if (ms < 86400000) {
      return '<div class="public-countdown public-countdown-warning">' +
        '<div class="public-countdown-head"><span><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 4h9M7.5 20h9M8.5 4v2.7c0 2 3.5 3.3 3.5 5.3s-3.5 3.3-3.5 5.3V20M15.5 4v2.7c0 2-3.5 3.3-3.5 5.3s3.5 3.3 3.5 5.3V20"/></svg></span>' + t('cd_less24') + '</div>' +
        countdownGridHtml() +
        '<div class="public-countdown-date" dir="auto">' + fmtDate(tender.opening_date, true) + '</div>' +
        '</div>';
    }
    return '<div class="public-countdown public-countdown-active">' +
      '<div class="public-countdown-head"><span><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5.6" width="16" height="14.8" rx="2.6"/><path d="M4 10.2h16"/><path d="M8.4 3.6v4M15.6 3.6v4"/></svg></span>' + t('cd_left_title') + '</div>' +
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
      iconCircle('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M6.1 17.9 17.9 6.1"/></svg>') +
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
      iconCircle('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.8" y="10.4" width="14.4" height="9.6" rx="2.4"/><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6"/></svg>', 'warning') +
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
      iconCircle('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 13.4h4.2l1.4 2.8h5.6l1.4-2.8h4.2"/><path d="M6.8 5.4A2 2 0 0 1 8.7 4h6.6a2 2 0 0 1 1.9 1.4l2.1 6.6v4.4a2 2 0 0 1-2 2H6.7a2 2 0 0 1-2-2V12z"/></svg>', 'success') +
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
      iconCircle('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M9.5 9.6a2.6 2.6 0 1 1 3.4 2.5c-.7.2-1 .8-1 1.5v.5"/><circle cx="11.9" cy="16.7" r="1" fill="currentColor" stroke="none"/></svg>', 'danger') +
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
      '<div class="public-field"><label class="lbl"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.4" y="3.6" width="13.2" height="16.8" rx="2"/><path d="M9 7.6h1.6M13.4 7.6H15M9 11.4h1.6M13.4 11.4H15M9 15.2h1.6M13.4 15.2H15"/><path d="M10.4 20.4v-3h3.2v3"/></svg> ' + t('f_company') + '</label>' +
      '<input id="d-company" class="inp" type="text" required placeholder="' + esc(t('f_company_ph')) + '"></div>' +
      '<div class="public-field"><label class="lbl"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.6 3.6 10 8l-2 1.9a12.4 12.4 0 0 0 6.1 6.1L16 14l4.4 2.4-.8 3a2 2 0 0 1-2.2 1.5C10.6 20 4 13.4 3.1 6.6A2 2 0 0 1 4.6 4.4z"/></svg> ' + t('f_phone') + '</label>' +
      '<input id="d-phone" class="inp" type="tel" dir="ltr" required placeholder="0550 00 00 00"></div>' +
      '<div class="public-field"><label class="lbl"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.4"/><path d="M4.6 7.6l6.7 4.6a1.5 1.5 0 0 0 1.8 0l6.7-4.6"/></svg> ' + t('f_email') + '</label>' +
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
      iconCircle('<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.4 2.6 2.6 5-5.5"/></svg>', 'success') +
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
