/* ===== لوحة المدير: إنشاء + قائمة + QR + سجل التحميلات + فتح الأظرفة + تغيير + حذف ===== */
(function () {
  const PAGE_SIZE = 20;
  const A = (window.Admin = {});
  A.me = null;          // ملفي: { role (قالب), perms: {scope, actions}, is_active, pending, full_name }
  A.role = '';          // تسمية القالب (للعرض) — يُشتق من A.me
  A.facultyId = null;   // كليتي (null = مركزي)
  A.faculties = [];     // كل الكليات (id, code, name_ar, name_fr, color, icon, is_central)
  A.facultyById = {};
  A.stats = null;
  A.users = [];         // آخر قائمة مستخدمين (للمحرر)
  A.disabled = false;
  A.pending = false;
  let tenderFilter = null; // فلتر نشط: {status} أو {facultyId}

  // الصلاحيات الدقيقة: { scope: all|own|none, actions: {create,edit,delete,open,logs,accounts} }
  const ACTIONS = ['create', 'edit', 'delete', 'open', 'logs', 'accounts'];
  const PAGES = ['dashboard', 'create', 'tenders', 'opening', 'accounts', 'backup'];
  const ALL_PAGES = { dashboard: true, create: true, tenders: true, opening: true, accounts: true, backup: true };
  const PRESETS = {
    super_admin: { scope: 'all', actions: { create: true, edit: true, delete: true, open: true, logs: true, accounts: true }, pages: { dashboard: true, create: true, tenders: true, opening: true, accounts: true, backup: true } },
    admin: { scope: 'all', actions: { create: true, edit: true, delete: true, open: true, logs: true, accounts: true }, pages: { dashboard: true, create: true, tenders: true, opening: true, accounts: true, backup: true } },
    admin_rectora: { scope: 'all', actions: { create: true, edit: true, delete: true, open: true, logs: true, accounts: false }, pages: { dashboard: true, create: true, tenders: true, opening: true, accounts: false, backup: true } },
    faculty_admin: { scope: 'own', actions: { create: true, edit: true, delete: true, open: true, logs: true, accounts: true }, pages: { dashboard: true, create: true, tenders: true, opening: true, accounts: true, backup: false } },
    committee: { scope: 'own', actions: { logs: true }, pages: { dashboard: true, create: false, tenders: true, opening: true, accounts: false, backup: false } },
    opener: { scope: 'own', actions: { open: true, logs: true }, pages: { dashboard: true, create: false, tenders: true, opening: true, accounts: false, backup: false } },
    viewer: { scope: 'own', actions: {}, pages: { dashboard: true, create: false, tenders: true, opening: false, accounts: false, backup: false } },
  };
  function normalizePages(input) {
    const out = {};
    PAGES.forEach((k) => { out[k] = !input || !input.pages ? true : input.pages[k] !== false; });
    return out;
  }
  function pagesFromPerms(perms, role) {
    if (perms && perms.pages) return normalizePages(perms);
    const preset = PRESETS[role];
    return Object.assign({}, preset && preset.pages ? preset.pages : ALL_PAGES);
  }
  const ROLE_ALIASES = {
    'super admin': 'super_admin',
    'superadmin': 'super_admin',
    'super_admin': 'super_admin',
    'developer': 'super_admin',
    'dev': 'super_admin',
    'admin': 'admin',
    'manager': 'admin',
    'admin rectora': 'admin_rectora',
    'admin rectorat': 'admin_rectora',
    'rectorat': 'admin_rectora',
    'admin central': 'admin_rectora',
    'admin centrale': 'admin_rectora',
    'admin faculté': 'faculty_admin',
    'admin faculte': 'faculty_admin',
    'admin faculty': 'faculty_admin',
    'faculty_admin': 'faculty_admin',
    'commission': 'committee',
    'committee': 'committee',
    'ouverture': 'opener',
    'opener': 'opener',
    'lecture seule': 'viewer',
    'viewer': 'viewer'
  };
  function normalizeRole(raw) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return 'viewer';
    if (ROLE_ALIASES[key]) return ROLE_ALIASES[key];
    if (Object.keys(PRESETS).includes(key)) return key;
    return 'custom';
  }
  const ROLE_LABELS = {
    super_admin: 'badge_super',
    admin: 'badge_admin',
    admin_rectora: 'badge_rectora',
    faculty_admin: 'badge_fadmin',
    committee: 'badge_view',
    opener: 'badge_open',
    viewer: 'badge_viewer',
    custom: 'badge_custom',
  };
  const ROLE_BADGE_CLS = {
    super_admin: 'bg-rose-50 text-rose-700',
    admin: 'bg-blue-50 text-blue-700',
    admin_rectora: 'bg-indigo-50 text-indigo-700',
    faculty_admin: 'bg-sky-50 text-sky-700',
    committee: 'bg-indigo-50 text-indigo-700',
    opener: 'bg-amber-50 text-amber-700',
    viewer: 'bg-slate-100 text-slate-600',
    custom: 'bg-primary-50 text-primary-700',
  };

  // هل أملك صلاحية معينة؟ (مغلقة افتراضيًا)
  A.can = function (act) {
    return !!(A.me && A.me.is_active && A.me.perms && A.me.perms.scope !== 'none'
      && A.me.perms.actions && A.me.perms.actions[act] === true);
  };
  A.scopeOf = function () {
    return (A.me && A.me.perms && A.me.perms.scope) || 'none';
  };
  function allowedPages() {
    if (!A.me) return Object.assign({}, ALL_PAGES);
    if (A.me.perms && A.me.perms.pages) return A.me.perms.pages;
    const preset = PRESETS[A.role];
    return Object.assign({}, preset && preset.pages ? preset.pages : ALL_PAGES);
  }
  // هل هذا النطاق (كلية) ضمن صلاحياتي؟
  A.inScopeOf = function (fid) {
    if (!A.me || !A.me.is_active) return false;
    const s = A.scopeOf();
    if (s === 'all') return true;
    if (s === 'own') return (fid == null) ? (A.facultyId == null) : (fid === A.facultyId);
    return false;
  };
  let dlTender = null;
  let dlPage = 1;
  let dlTotal = 0;
  let openTender = null;
  let replaceTender = null;
  let deleteTender = null;

  const $ = (id) => document.getElementById(id);
  const val = (id) => ($(id) ? $(id).value : '');
  const t = (k, v) => I18N.t(k, v);
  const kindLabel = (k) => (k === 'tender' ? t('kind_tender_s') : t('kind_consultation_s'));

  function displayTitle(tt) {
    if (!tt) return '';
    if (I18N.lang === 'fr' && tt.title_fr) return tt.title_fr;
    return tt.title || tt.title_fr || '';
  }

  function decodeEntities(s) {
    const ta = document.createElement('textarea');
    ta.innerHTML = s;
    return ta.value;
  }

  function hasArabic(s) {
    return /[\u0600-\u06FF]/.test(String(s || ''));
  }

  A._trCache = {};

  async function translateWithGemini(q, from, to) {
    const key = (window.GEMINI_API_KEY || '').trim();
    if (!key) throw new Error('gemini_key_missing');
    const langNames = { ar: 'Arabic', fr: 'French' };
    const prompt =
      'You are a professional translator for Algerian public procurement tenders. ' +
      'Translate the following ' + (langNames[from] || from) + ' text to ' + (langNames[to] || to) + '. ' +
      'Return ONLY the translated text, with no explanation and no quotes.\n' +
      'Text: "' + q + '"';
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    });
    if (!res.ok) throw new Error('gemini_http_' + res.status);
    const j = await res.json();
    const out = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts[0] && j.candidates[0].content.parts[0].text;
    if (!out) throw new Error('gemini_empty');
    return String(out).trim().replace(/^["']+|["']+$/g, '').trim();
  }

  async function translateWithGoogle(q, from, to) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + encodeURIComponent(from) +
      '&tl=' + encodeURIComponent(to) + '&dt=t&q=' + encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) throw new Error('google_translation_http_' + res.status);
    const j = await res.json();
    let out = '';
    if (Array.isArray(j) && Array.isArray(j[0])) {
      j[0].forEach((seg) => { if (seg && seg[0]) out += seg[0]; });
    }
    if (!out) throw new Error('google_translation_empty');
    return decodeEntities(out).trim();
  }

  async function translateWithMyMemory(q, from, to) {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=' + encodeURIComponent(from + '|' + to);
    const res = await fetch(url);
    if (!res.ok) throw new Error('mymemory_translation_http_' + res.status);
    const j = await res.json();
    const out = j && j.responseData && j.responseData.translatedText;
    if (!out) throw new Error('mymemory_translation_empty');
    return decodeEntities(out).trim();
  }

  async function translateText(text, from, to) {
    const q = String(text || '').trim();
    if (!q || q.length < 3) return q;
    if (from === 'ar' && to === 'fr' && !hasArabic(q)) return q;
    if (from === 'fr' && to === 'ar' && hasArabic(q)) return q;
    const key = from + '|' + to + '|' + q;
    if (A._trCache[key]) return A._trCache[key];
    const protectedSource = protectGlossary(q, from, to);
    let result = null;
    try {
      result = await translateWithGemini(protectedSource.out, from, to);
    } catch (e) {
      try {
        result = await translateWithGoogle(protectedSource.out, from, to);
      } catch (e2) {
        result = await translateWithMyMemory(protectedSource.out, from, to);
      }
    }
    result = restoreGlossary(result, protectedSource.map);
    A._trCache[key] = result;
    return result;
  }

  async function translateFrToAr(text) {
    return translateText(text, 'fr', 'ar');
  }

  function normalizeText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[\u0600-\u065F]/g, (ch) => {
        if (ch === 'أ' || ch === 'إ' || ch === 'آ') return 'ا';
        if (ch === 'ة') return 'ه';
        if (ch === 'ى') return 'ي';
        if (ch === 'ؤ') return 'و';
        if (ch === 'ئ') return 'ي';
        return ch;
      })
      .replace(/[^\p{L}\p{N}]+/gu, ' ');
  }

  const GLOSSARY_FR_AR = [
    { re: /cahiers? des charges?/gi, out: 'دفتر الشروط' },
    { re: /appels? d['’]?offres/gi, out: 'طلب عروض' },
    { re: /consultations?/gi, out: 'استشارة' },
    { re: /fournitures?/gi, out: 'توريد' },
    { re: /travaux/gi, out: 'أشغال' },
    { re: /entretiens?/gi, out: 'صيانة' },
    { re: /études?/gi, out: 'دراسات' },
    { re: /laboratoires?/gi, out: 'مختبر' },
    { re: /informatique/gi, out: 'معلوماتية' },
    { re: /mobilier/gi, out: 'أثاث' },
    { re: /transports?/gi, out: 'نقل' },
    { re: /nettoyage/gi, out: 'تنظيف' },
    { re: /électricité|electricite/gi, out: 'كهرباء' },
    { re: /restauration/gi, out: 'خدمات مطعم' }
  ];

  const GLOSSARY_AR_FR = [
    { re: /دفتر الشروط/g, out: 'cahier des charges' },
    { re: /طلب عروض/g, out: "Appel d'Offres" },
    { re: /استشارات?/g, out: 'consultation' },
    { re: /توريد/g, out: 'fourniture' },
    { re: /أشغال|اشغال/g, out: 'travaux' },
    { re: /صيانة/g, out: 'entretien' },
    { re: /دراسات/g, out: 'études' },
    { re: /مختبر|مخبر/g, out: 'laboratoire' },
    { re: /معلوماتية/g, out: 'informatique' },
    { re: /أثاث|اثاث/g, out: 'mobilier' },
    { re: /نقل/g, out: 'transport' },
    { re: /تنظيف/g, out: 'nettoyage' },
    { re: /كهرباء/g, out: 'électricité' },
    { re: /طعام|وجبات/g, out: 'restauration' }
  ];

  function protectGlossary(source, from, to) {
    const map = [];
    let out = String(source || '');
    const list = (from === 'fr' && to === 'ar') ? GLOSSARY_FR_AR : ((from === 'ar' && to === 'fr') ? GLOSSARY_AR_FR : []);
    list.forEach((g) => {
      g.re.lastIndex = 0;
      if (out.match(g.re)) {
        const ph = '[[GL' + map.length + ']]';
        out = out.replace(g.re, ph);
        map.push(g.out);
      }
    });
    return { out, map };
  }

  function restoreGlossary(text, map) {
    return String(text || '').replace(/\[\[GL(\d+)\]\]/g, (m, i) => map[Number(i)] || m);
  }

  A.init = function () {
    bindCreate();
    bindStaticButtons();
    bindAccounts();
    bindBackup();
    bindRestore();
    bindReminderClose();
    const s = $('tender-search');
    if (s) s.addEventListener('input', debounce(() => { A.page = 1; A.loadTenders(); }, 300));
    A.page = 1;
    checkSchema();
    loadFaculties().then(() => initRole()).then(async () => {
      populateFacultySelects();
      await autoOpenDue();
      A.loadTenders();
      A.loadStats();
      A.checkOpeningReminder();
      A.initNotifications();
    });
  };

  /* ---------- الكليات: تحميل + أسماء + شارات ---------- */

  async function loadFaculties() {
    try {
      const { data } = await DB.from('faculties').select('*').order('sort_order');
      A.faculties = data || [];
      A.facultyById = {};
      A.faculties.forEach((f) => { A.facultyById[f.id] = f; });
    } catch (e) {
      A.faculties = [];
      A.facultyById = {};
    }
  }

  function facName(f) {
    if (!f) return '';
    return (I18N.lang === 'ar' ? f.name_ar : f.name_fr) || f.name_ar || '';
  }

  // شارة مصغرة للكلية (تُستخدم في بطاقات الاستشارات والحسابات)
  function facChip(f) {
    if (!f) {
      return '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">🏛️ ' + t('fac_none') + '</span>';
    }
    return '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style="background:' + f.color + '1a;color:' + f.color + '">' + (f.icon || '🎓') + ' ' + esc(facName(f)) + '</span>';
  }

  /* ---------- تذكير بمواعيد الفتح (اليوم / غدًا) ---------- */

  let reminderData = [];
  let reminderTimer = null;
  let reminderOpen = false;

  let notifItems = [];
  let notifUnread = 0;
  let notifSeen = new Set();
  let notifTimer = null;
  let rtChannel = null;
  let rtActive = false;

  function addNotif(item) {
    if (!item || !item.id) return;
    if (notifSeen.has(item.id)) return;
    notifSeen.add(item.id);
    if (notifSeen.size > 800) {
      const first = notifSeen.values().next().value;
      if (first) notifSeen.delete(first);
    }
    notifItems.unshift(item);
    notifItems = notifItems.slice(0, 20);
    notifUnread = Math.min(99, notifUnread + 1);
    renderReminder();
  }

  async function handleDownloadEvent(d) {
    if (!d || !d.id) return;
    const nid = 'dl-' + d.id;
    if (notifSeen.has(nid)) return;
    let ref = '';
    try {
      const { data } = await DB.from('tenders').select('reference').eq('id', d.tender_id).maybeSingle();
      if (data && data.reference) ref = fmtRef(data.reference);
    } catch (e) { /* غير حرج */ }
    addNotif({
      id: nid,
      icon: '⬇️',
      title: d.company || '—',
      sub: (ref ? ref + ' • ' : '') + t('ntf_new_download') + ' • ' + fmtDate(d.downloaded_at || new Date().toISOString(), true),
      time: d.downloaded_at || new Date().toISOString()
    });
  }

  async function handleTenderEvent(r) {
    if (!r || !r.id) return;
    addNotif({
      id: 'td-' + r.id,
      icon: '📄',
      title: (r.reference ? fmtRef(r.reference) : '—'),
      sub: t('ntf_new_tender') + (r.title ? ' • ' + r.title : ''),
      time: r.created_at || new Date().toISOString()
    });
  }

  A.pollNotifications = async function () {
    try {
      const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const dlRes = await DB.from('downloads')
        .select('id, company, downloaded_at, tender_id')
        .gt('downloaded_at', since)
        .order('downloaded_at', { ascending: false })
        .limit(30);
      if (!dlRes.error && dlRes.data) {
        for (const d of dlRes.data) await handleDownloadEvent(d);
      }
      const tdRes = await DB.from('tenders')
        .select('id, reference, title, created_at')
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10);
      if (!tdRes.error && tdRes.data) {
        for (const r of tdRes.data) await handleTenderEvent(r);
      }
    } catch (e) { /* غير حرج */ }
  };

  A.initNotifications = function () {
    if (notifTimer) return;
    A.pollNotifications();
    notifTimer = setInterval(() => { A.pollNotifications(); }, 45 * 1000);
    try {
      if (DB.realtime && typeof DB.realtime.channel === 'function') {
        rtChannel = DB.realtime.channel('ntf-' + (new Date().getTime()));
        rtChannel
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'downloads' }, (p) => { handleDownloadEvent(p && p.new); })
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tenders' }, (p) => { handleTenderEvent(p && p.new); })
          .subscribe((status) => {
            rtActive = status === 'SUBSCRIBED';
            renderReminder();
          });
      }
    } catch (e) {
      rtActive = false;
    }
  };

  A.checkOpeningReminder = async function () {
    try {
      const s0 = new Date(); s0.setHours(0, 0, 0, 0);
      const e1 = new Date(); e1.setDate(e1.getDate() + 7); e1.setHours(23, 59, 59, 999);
      const { data, error } = await DB.from('tenders')
        .select('id, reference, title, opening_date')
        .eq('status', 'published')
        .gte('opening_date', s0.toISOString())
        .lte('opening_date', e1.toISOString())
        .order('opening_date', { ascending: true })
        .limit(12);
      if (error) return;
      reminderData = data || [];
      renderReminder();
      if (!reminderTimer) reminderTimer = setInterval(A.checkOpeningReminder, 5 * 60 * 1000);
    } catch (e) { /* غير حرج */ }
  };

  const DAY_NAMES = {
    ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  };

  function renderReminder() {
    const badge = $('remind-badge');
    const panel = $('remind-panel');
    const ico = $('remind-ico');
    if (!badge || !panel) return;
    const now = new Date();
    const today = officePartsDate(now);
    const tmr = officePartsDate(new Date(now.getTime() + 86400000));
    const p = (n) => String(n).padStart(2, '0');
    const lang = (window.I18N && I18N.lang) || 'ar';
    const days = DAY_NAMES[lang] || DAY_NAMES.ar;
    const sameOfficeDay = (o, ref) => !!(o && ref && o.y === ref.y && o.mo === ref.mo && o.da === ref.da);
    const items = [];
    (reminderData || []).forEach((r) => {
      const d = new Date(r.opening_date);
      if (isNaN(d)) return;
      const o = officePartsDate(d);
      const isToday = sameOfficeDay(o, today);
      const isTmr = !isToday && sameOfficeDay(o, tmr);
      const when = isToday ? t('rm_today') : isTmr ? t('rm_tomorrow') : (days[o.wd] + ' ' + o.da + '/' + o.mo);
      items.push({ d, o, isToday, isTmr, when, r });
    });

    // شارة العدد على الجرس
    const totalBadge = Math.min(99, items.length + notifUnread);
    if (!totalBadge) {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
      if (ico) ico.classList.remove('animate-pulse');
      return;
    }
    badge.textContent = totalBadge;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    if (ico) ico.classList.toggle('animate-pulse', items.some((i) => i.isToday) || notifUnread > 0);

    // محتوى اللوحة (تُحدَّث فقط وهي مفتوحة)
    if (!reminderOpen) return;
    const trunc = (s) => (s && s.length > 60 ? s.slice(0, 60) + '…' : s);
    const notifRowHtml = (n) =>
      '<div class="px-4 py-3 flex items-start gap-2.5 bg-teal-50/40">' +
      '<span class="mt-0.5 text-base">' + (n.icon || '🔔') + '</span>' +
      '<div class="min-w-0">' +
      '<div class="text-sm font-bold text-slate-800">' + esc(n.title || '') + '</div>' +
      (n.sub ? '<div class="text-xs text-slate-500 leading-snug mt-0.5">' + esc(n.sub) + '</div>' : '') +
      '</div>' +
      '</div>';
    const rowHtml = (i) =>
      '<div class="px-4 py-3 flex items-start gap-2.5 ' +
      (i.isToday ? 'bg-amber-50' : i.isTmr ? 'bg-sky-50/70' : '') + '">' +
      '<span class="mt-0.5 text-base">' + (i.isToday ? '🔴' : i.isTmr ? '🔵' : '⚪') + '</span>' +
      '<div class="min-w-0">' +
      '<div class="text-sm font-bold text-slate-800" dir="ltr">' + esc(fmtRef(i.r.reference)) + '</div>' +
      (i.r.title ? '<div class="text-xs text-slate-500 leading-snug">' + esc(trunc(i.r.title)) + '</div>' : '') +
      '<div class="text-[11px] font-semibold mt-1 ' + (i.isToday ? 'text-amber-700' : i.isTmr ? 'text-sky-700' : 'text-slate-400') + '">' +
      esc(i.when) + ' — ' + t('rm_open_word') + ' <span class="tabular-nums">(' + i.o.h + ':' + i.o.mi + ')</span></div>' +
      '</div>' +
      '</div>';
    const hasAny = items.length || notifItems.length;
    panel.innerHTML =
      '<div class="px-4 py-3 bg-gradient-to-l from-amber-50 via-white to-white border-b border-amber-100 flex items-center gap-2">' +
      '<span class="text-lg">🔔</span>' +
      '<span class="text-sm font-black text-slate-800">' + t('ntf_title') + '</span>' +
      '<span class="text-[11px] font-black text-white bg-amber-500 rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">' + totalBadge + '</span>' +
      '</div>' +
      (hasAny
        ? '<div class="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">' +
          (notifItems.length
            ? '<div class="px-4 pt-3 pb-1 text-[10px] font-black text-teal-700 bg-teal-50/60">📡 ' + t('ntf_live') + '</div>' +
              notifItems.map(notifRowHtml).join('')
            : '') +
          (items.length
            ? '<div class="px-4 pt-3 pb-1 text-[10px] font-black text-amber-700 bg-amber-50/60">🗓️ ' + t('rm_title') + '</div>' +
              items.map(rowHtml).join('')
            : '') +
          '</div>'
        : '<div class="py-10 text-center text-sm text-slate-400">' + t('ntf_empty') + '</div>') +
      '<div class="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 text-center">' +
      (rtActive ? '📡 ' + t('ntf_realtime') : '🔄 ' + t('ntf_polling')) +
      '</div>';
  }

  A.toggleReminder = function () {
    reminderOpen = !reminderOpen;
    const panel = $('remind-panel');
    if (!panel) return;
    if (reminderOpen) {
      renderReminder();
      notifUnread = 0;
      renderReminder();
      panel.classList.remove('hidden', 'remind-pop');
      void panel.offsetWidth; // إعادة تشغيل الحركة
      panel.classList.add('remind-pop');
    } else {
      panel.classList.add('hidden');
    }
  };

  function bindReminderClose() {
    const btn = $('remind-btn');
    if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); A.toggleReminder(); });
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      document.addEventListener('click', (e) => {
        const panel = $('remind-panel');
        if (!panel || !reminderOpen) return;
        if (!e.target.closest('#remind-panel') && !e.target.closest('#remind-btn')) {
          reminderOpen = false;
          panel.classList.add('hidden');
        }
      });
    }
  }

  // استعادة شريط التنقل لحالته الكاملة (قبل تطبيق قيود الدور)
  function restoreNav() {
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('hidden'));
    const navGrid = document.querySelector('.bottom-nav > div');
    if (navGrid) {
      navGrid.classList.remove('grid-cols-1', 'grid-cols-2');
      navGrid.classList.add('grid-cols-4');
    }
    const badge = $('role-badge');
    if (badge) badge.classList.add('hidden');
  }

  // تحديد صلاحياتي من الملف الشخصي الحي (018): permissions + pending
  // مغلق افتراضيًا: فشل القراءة = لا صلاحيات
  async function initRole() {
    restoreNav();
    A.me = null;
    A.role = '';
    A.facultyId = null;
    A.disabled = false;
    A.pending = false;
    try {
      const { data: { user } } = await DB.auth.getUser();
      if (user) {
        const { data: prof } = await DB.from('profiles')
          .select('role, faculty_id, is_active, pending, permissions, full_name')
          .eq('id', user.id).maybeSingle();
        if (prof) {
          const perms = prof.permissions || {};
          const role = normalizeRole(prof.role);
          A.me = {
            role: Object.keys(PRESETS).includes(role) ? role : 'custom',
            perms: {
              scope: ['all', 'own', 'none'].includes(perms.scope) ? perms.scope : 'none',
              actions: perms.actions || {},
              pages: pagesFromPerms(perms, role),
            },
            is_active: !!prof.is_active,
            pending: !!prof.pending,
            full_name: prof.full_name || (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split('@')[0] : '') || '',
          };
          A.role = A.me.role;
          A.facultyId = prof.faculty_id || null;
          A.disabled = !prof.is_active;
          A.pending = !!prof.pending;
          if (A.me.full_name && $('user-name')) $('user-name').textContent = A.me.full_name;
        } else {
          const r = normalizeRole(user.app_metadata && user.app_metadata.role);
          const preset = PRESETS[r] || PRESETS.viewer;
          A.me = {
            role: Object.keys(PRESETS).includes(r) ? r : 'viewer',
            perms: { scope: preset.scope, actions: Object.assign({}, preset.actions), pages: Object.assign({}, preset.pages || ALL_PAGES) },
            is_active: true,
            pending: false,
            full_name: (user.user_metadata && user.user_metadata.full_name) || (user.email ? user.email.split('@')[0] : '') || '',
          };
          A.role = A.me.role;
          if (A.me.full_name && $('user-name')) $('user-name').textContent = A.me.full_name;
        }

        if (user && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
          const localSuper = ['binomohamza@gmail.com'];
          if (user.email && localSuper.includes(String(user.email).toLowerCase())) {
            A.me = {
              role: 'super_admin',
              perms: { scope: 'all', actions: Object.assign({}, PRESETS.super_admin.actions), pages: Object.assign({}, PRESETS.super_admin.pages) },
              is_active: true,
              pending: false,
              full_name: (A.me && A.me.full_name) || (user.user_metadata && user.user_metadata.full_name) || user.email.split('@')[0],
            };
            A.role = 'super_admin';
            A.disabled = false;
            A.pending = false;
            if ($('user-name')) $('user-name').textContent = A.me.full_name;
          }
        }
      }
    } catch (e) { /* يبقى: بدون صلاحيات */ }
    applyRoleUI();
  }

  function applyRoleUI() {
    const navGrid = document.querySelector('.bottom-nav > div');
    const setGrid = (n) => {
      if (!navGrid) return;
      navGrid.classList.remove('grid-cols-4', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3');
      navGrid.classList.add('grid-cols-' + n);
    };
    const badge = $('role-badge');
    const app = $('authed-app');
    const pendCard = $('pending-card');

    // حساب معلّق: شاشة انتظار فقط
    if (A.pending) {
      if (badge) { badge.classList.remove('hidden'); badge.textContent = t('role_pending_badge'); }
      if (app) app.classList.add('hidden');
      if (pendCard) pendCard.classList.remove('hidden');
      return;
    }
    if (pendCard) pendCard.classList.add('hidden');
    if (app) app.classList.remove('hidden');

    if (A.disabled) {
      // حساب موقوف: شاشة القائمة فقط + شارة واضحة
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.add('hidden'));
      document.querySelectorAll('.nav-btn[data-tab="tab-tenders"]').forEach((b) => b.classList.remove('hidden'));
      setGrid(1);
      if (badge) { badge.classList.remove('hidden'); badge.textContent = t('role_disabled_badge'); }
      const bak2 = $('backup-restore-box');
      if (bak2) bak2.classList.add('hidden');
      const settingsWrap2 = $('settings-wrap');
      if (settingsWrap2) settingsWrap2.classList.add('hidden');
      if (window.switchTo) window.switchTo('tab-tenders');
      toast(t('t_disabled'), 'warn', 8000);
      return;
    }

    // الصلاحيات الدقيقة + الصفحات المسموح بها لكل دور
    const pages = allowedPages();
    const canCreate = A.can('create');
    const canAccounts = A.can('accounts');
    const canView = A.scopeOf() !== 'none';
    const canDashboard = canView && pages.dashboard !== false;
    const canCreatePage = canView && pages.create !== false;
    const canTenders = canView && pages.tenders !== false;
    const canOpening = canView && pages.opening !== false;
    const canAccountsPage = canView && pages.accounts !== false && canAccounts;
    const canBak = canView && pages.backup !== false && canBackup();
    document.querySelectorAll('.nav-btn[data-tab="tab-dashboard"]')
      .forEach((b) => b.classList.toggle('hidden', !canDashboard));
    document.querySelectorAll('.nav-btn[data-tab="tab-create"]')
      .forEach((b) => b.classList.toggle('hidden', !canCreatePage));
    document.querySelectorAll('.nav-btn[data-tab="tab-accounts"]')
      .forEach((b) => b.classList.toggle('hidden', !canAccountsPage));
    document.querySelectorAll('.nav-btn[data-tab="tab-tenders"]')
      .forEach((b) => b.classList.toggle('hidden', !canTenders));
    document.querySelectorAll('.nav-btn[data-tab="tab-opening"]')
      .forEach((b) => b.classList.toggle('hidden', !canOpening));
    document.querySelectorAll('.nav-btn[data-tab="tab-backup"]')
      .forEach((b) => b.classList.toggle('hidden', !canBak));
    const settingsWrap = $('settings-wrap');
    if (settingsWrap) settingsWrap.classList.toggle('hidden', !(canAccountsPage || canBak));
    let n = 0;
    if (canDashboard) n++;
    if (canCreatePage) n++;
    if (canTenders) n++;
    if (canOpening) n++;
    if (canAccountsPage) n++;
    if (canBak) n++;
    setGrid(Math.max(1, n));
    const afb = $('a-faculty-box');
    if (afb) afb.classList.toggle('hidden', !canAccountsPage);
    updateBadge();
    if (window.switchTo) {
      const openerOnly = canOpening && !canCreatePage && !canAccountsPage && A.can('open') && !A.can('edit') && !A.can('delete');
      const initialTab = openerOnly
        ? 'tab-opening'
        : (canDashboard ? 'tab-dashboard' : (canTenders ? 'tab-tenders' : (canOpening ? 'tab-opening' : (canCreatePage ? 'tab-create' : 'tab-dashboard'))));
      window.switchTo(initialTab);
      if (initialTab === 'tab-dashboard' && A.loadDashboard) A.loadDashboard();
      if (initialTab === 'tab-opening' && A.loadOpening) A.loadOpening();
    }
  }

  function updateBadge() {
    const badge = $('role-badge');
    if (!badge) return;
    if (A.pending) badge.textContent = t('role_pending_badge');
    else if (A.disabled) badge.textContent = t('role_disabled_badge');
    else {
      const labelKey = ROLE_LABELS[A.role] || 'badge_custom';
      let suffix = '';
      const f = A.facultyById[A.facultyId];
      if (A.scopeOf() === 'own') {
        suffix = f ? ' — ' + f.icon + ' ' + facName(f) : ' — ' + t('fac_central_label');
      } else if (A.scopeOf() === 'all') {
        suffix = ' — ' + t('scope_all_short');
      }
      badge.textContent = t(labelKey) + suffix;
    }
    badge.classList.remove('hidden');
  }

  // إعادة ترجمة شارة الدور عند تبديل اللغة
  A.updateRoleBadge = function () {
    if (A.me || A.disabled || A.pending) updateBadge();
  };

  // خيارات الكلية ضمن نطاق صلاحياتي فقط
  function scopeFaculties() {
    return A.scopeOf() === 'all' ? A.faculties : A.faculties.filter((f) => f.id === A.facultyId);
  }

  // تعبئة قوائم الكليات (إنشاء استشارة / حساب / تعديل)
  function populateFacultySelects() {
    const fill = (sel, opts) => {
      sel.innerHTML = opts.map((f) =>
        '<option value="' + f.id + '">' + (f.icon || '') + ' ' + esc(facName(f)) + '</option>').join('');
    };
    const fsel = $('f-faculty');
    if (fsel) {
      const cur = fsel.value;
      const opts = scopeFaculties();
      if (!opts.length) {
        fsel.innerHTML = '';
        fsel.disabled = true;
      } else {
        fill(fsel, opts);
        if (opts.length === 1) fsel.disabled = true;
        else fsel.disabled = false;
        if (cur && opts.some((f) => f.id === cur)) fsel.value = cur;
        else {
          const central = opts.find((f) => f.is_central);
          fsel.value = (central && central.id) || opts[0].id;
        }
      }
    }
    const asel = $('a-faculty');
    if (asel) {
      const cur = asel.value;
      const opts = scopeFaculties();
      if (!opts.length) {
        asel.innerHTML = '';
        asel.disabled = true;
      } else {
        fill(asel, opts);
        asel.disabled = opts.length <= 1;
        if (cur && opts.some((f) => f.id === cur)) asel.value = cur;
        else {
          const central = opts.find((f) => f.is_central);
          asel.value = (central && central.id) || opts[0].id;
        }
      }
    }
    const esel = $('e-faculty');
    if (esel) {
      const cur = esel.value;
      fill(esel, A.faculties);
      esel.disabled = A.scopeOf() !== 'all'; // تغيير كلية الاستشارة: نطاق كامل فقط
      if (!esel.disabled && cur && A.faculties.some((f) => f.id === cur)) esel.value = cur;
    }
  }

  // هل الاستشارة ضمن نطاقي؟ (نطاق كامل = الكل، وإلا كليتي)
  function inScope(tt) {
    return A.inScopeOf(tt ? tt.faculty_id : null);
  }

  /* ---------- فتح تلقائي من اللوحة: كل منشورة حلّ موعدها تُفتح
     ويُحذف ملفها (ضمان إضافي بجانب مهمة pg_cron) ---------- */
  async function autoOpenDue() {
    if (!A.me || A.disabled || !A.can('open')) return;
    // وقت الخادم بدل ساعة الجهاز (قد تكون خاطئة — مثل ساعة زائدة)
    let limitIso = new Date().toISOString();
    try {
      const { data: nowData } = await DB.rpc('server_now');
      if (nowData) limitIso = new Date(nowData).toISOString();
    } catch (e) { /* احتياط: وقت الجهاز */ }
    let rows = [];
    try {
      const { data, error } = await DB.from('tenders')
        .select('id, reference, pdf_path')
        .eq('status', 'published')
        .lte('opening_date', limitIso);
      if (error || !data || !data.length) return;
      rows = data;
    } catch (e) { return; }
    let uid = null;
    try { uid = ((await DB.auth.getUser()).data.user || {}).id || null; } catch (e) { /* تجاهل */ }
    let n = 0;
    for (const tt of rows) {
      let data = null, uErr = null;
      try {
        ({ data, error: uErr } = await DB.from('tenders')
          .update({ status: 'opened', opened_at: new Date().toISOString(), opened_by: uid })
          .eq('id', tt.id)
          .eq('status', 'published')
          .select('id'));
      } catch (e) { continue; }
      if (uErr || !data || !data.length) continue;
      n++;
      if (tt.pdf_path) {
        try { await DB.storage.from('tenders').remove([tt.pdf_path]); } catch (e) { console.warn('حذف الملف:', e && e.message || e); }
      }
    }
    if (n) {
      toast(t('t_auto_opened', { n }), 'info', 6000);
      if (A.refreshTenders) A.refreshTenders();
    }
  }

  // ملاحظة: قبل تحديد الصلاحيات (أثناء الربط) تُعتبر مفعّلة لأن الخادم يفرضها فعلًا
  function hasCreate() { return !A.me ? true : A.can('create'); }
  function hasEdit() { return !A.me ? true : A.can('edit'); }
  function hasDelete() { return !A.me ? true : A.can('delete'); }
  function hasOpen() { return !A.me ? true : A.can('open'); }
  function hasLogs() { return !A.me ? true : A.can('logs'); }
  function hasAccounts() { return !A.me ? true : A.can('accounts'); }
  function canBackup() { return !A.me ? true : (A.scopeOf() === 'all' && A.can('delete') && A.can('create')); }

  // التحقق من أن قاعدة البيانات محدثة (الأعمدة الجديدة موجودة)
  async function checkSchema() {
    const banner = $('schema-banner');
    if (!banner) return;
    try {
      const { error } = await DB.from('tenders').select('id, kind, pdf_source, title_fr').limit(1);
      if (error) banner.classList.remove('hidden');
    } catch (e) {
      banner.classList.remove('hidden');
    }
  }

  A.refreshTenders = function () {
    A.loadTenders();
  };

  A.loadDashboard = async function () {
    const statsEl = $('db-stats');
    if (!statsEl) return;
    statsEl.innerHTML = '<div class="spinner my-8"></div>';
    const upEl0 = $('db-upcoming');
    if (upEl0) upEl0.innerHTML = '';

    try {
      let q = DB.from('tenders').select('id, reference, title, kind, status, opening_date, faculty_id, downloads(count)');
      if (A.scopeOf() !== 'all') q = q.eq('faculty_id', A.facultyId);
      const { data: tenders, error } = await q;
      if (error) throw error;
      const list = tenders || [];
      const total = list.length;
      const published = list.filter((x) => x.status === 'published').length;
      const opened = list.filter((x) => x.status === 'opened').length;
      const dlTotal = list.reduce((s, x) => s + ((x.downloads && x.downloads.count) || 0), 0);

      const card = (icon, label, value, color) =>
        '<div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">' +
        '<div class="text-2xl mb-2">' + icon + '</div>' +
        '<div class="text-2xl font-black ' + color + '">' + value + '</div>' +
        '<div class="text-xs text-slate-500 font-semibold mt-1">' + label + '</div>' +
        '</div>';
      statsEl.innerHTML =
        card('📥', t('db_total'), total, 'text-slate-800') +
        card('🟢', t('db_published'), published, 'text-primary-700') +
        card('🔓', t('db_opened'), opened, 'text-indigo-600') +
        card('⬇️', t('db_downloads'), dlTotal, 'text-teal-700');

      const now = Date.now();
      const today = officePartsDate(new Date());
      const tmr = officePartsDate(new Date(now + 86400000));
      const upcoming = list
        .filter((x) => x.status === 'published' && new Date(x.opening_date).getTime() >= now)
        .sort((a, b) => new Date(a.opening_date) - new Date(b.opening_date))
        .slice(0, 5);
      const upEl = $('db-upcoming');
      if (upEl) {
        upEl.innerHTML = upcoming.length ? upcoming.map((x) => {
          const p = officePartsDate(x.opening_date);
          const dayLabel = (p && p.y === today.y && p.mo === today.mo && p.da === today.da) ? t('db_today')
            : (p && p.y === tmr.y && p.mo === tmr.mo && p.da === tmr.da) ? t('db_tomorrow')
            : fmtDate(x.opening_date, true);
          return '<div class="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-3 py-2">' +
            '<div class="min-w-0"><div class="font-bold text-slate-700 text-sm" dir="ltr">' + esc(fmtRef(x.reference)) + '</div>' +
            '<div class="text-xs text-slate-500 mt-0.5 truncate">' + esc(displayTitle(x)) + '</div></div>' +
            '<div class="text-xs font-bold text-primary-700 whitespace-nowrap">' + dayLabel + '</div></div>';
        }).join('') : '<div class="text-xs text-slate-400">' + t('db_empty') + '</div>';
      }

    } catch (e) {
      statsEl.innerHTML = errorState(e);
    }
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  /* ---------- إنشاء استشارة ---------- */

  function bindTitleTranslation(frId, arId, btnFrArId, btnArFrId) {
    const frEl = $(frId);
    const arEl = $(arId);
    const btnFrAr = $(btnFrArId);
    const btnArFr = $(btnArFrId);
    if (!frEl || !arEl) return;
    frEl.addEventListener('input', () => { frEl.dataset.userEdited = '1'; });
    arEl.addEventListener('input', () => { arEl.dataset.userEdited = '1'; });
    async function runTranslate(from, to, sourceEl, targetEl, btn, label) {
      const v = sourceEl.value.trim();
      if (v.length < 2) return;
      if (btn) setBusy(btn, true, t('translating'));
      try {
        const out = await translateText(v, from, to);
        targetEl.value = out;
        delete targetEl.dataset.userEdited;
      } catch (e) {
        toast(t('translation_fail'), 'error', 4000);
      } finally {
        if (btn) setBusy(btn, false, label);
      }
    }
    if (btnFrAr) btnFrAr.addEventListener('click', () => runTranslate('fr', 'ar', frEl, arEl, btnFrAr, t('translate_fr_to_ar')));
    if (btnArFr) btnArFr.addEventListener('click', () => runTranslate('ar', 'fr', arEl, frEl, btnArFr, t('translate_ar_to_fr')));
  }

  function bindCreate() {
    const form = $('create-form');
    if (!form) return;

    $('f-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      $('file-info').textContent = f ? f.name + ' — ' + (f.size / 1024 / 1024).toFixed(2) + ' MB' : '';
    });

    $('f-reference').addEventListener('blur', () => {
      const v = $('f-reference').value.trim();
      if (v) $('f-reference').value = fmtRef(v);
    });

    bindTitleTranslation('f-title-fr', 'f-title', 'translate-title-fr-ar-btn', 'translate-title-ar-fr-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!A.me || !hasCreate()) return toast(t('t_perm_denied'), 'error');
      const refRaw = val('f-reference');
      const ref = fmtRef(refRaw);
      const titleFr = val('f-title-fr').trim();
      const title = val('f-title').trim();
      const duration = val('f-duration');
      const opening = (val('f-date') && val('f-time')) ? (val('f-date') + 'T' + val('f-time')) : (val('f-date') ? (val('f-date') + 'T10:00') : '');
      const file = $('f-file').files[0];
      const kindEl = document.querySelector('input[name="f-kind"]:checked');
      const kind = kindEl ? kindEl.value : 'consultation';
      const facultyId = val('f-faculty') || null;

      if (!ref || !titleFr || !title || !opening || !file) return toast(t('t_fill_all'), 'error');
      if (file.type !== 'application/pdf') return toast(t('t_pdf_only'), 'error');
      if (file.size > 50 * 1024 * 1024) return toast(t('t_too_big'), 'error');
      if (ref.length > 60) return toast(t('t_ref_long'), 'error');
      if (titleFr.length > 200) return toast(t('t_title_long'), 'error');
      if (title.length > 200) return toast(t('t_title_long'), 'error');
      if (duration.length > 100) return toast(t('t_duration_long'), 'error');
      if (isNaN(new Date(opening).getTime())) return toast(t('t_bad_date'), 'error');

      const existing = await DB.from('tenders').select('reference');
      const dup = (existing.data || []).some((x) => sameRef(x.reference, ref));
      if (dup) return toast(t('t_dup_ref', { ref }), 'error', 5000);

      const btn = $('create-btn');
      setBusy(btn, true, t('busy_publish'));
      try {
        let tenderId;

        // المسار 1: Cloudflare R2 (ملفات حتى 200MB) — إن كانت مهيأة
        const prep = await DB.functions.invoke('tender-files', {
          body: { action: 'prepare-upload', size: file.size },
        });

        if (!prep.error && prep.data && prep.data.upload_url) {
          tenderId = prep.data.tender_id;

          // رفع مباشر إلى R2 (لا يمر عبر Supabase فلا يوجد حد 50MB)
          const put = await fetch(prep.data.upload_url, { method: 'PUT', body: file });
          if (!put.ok) {
            try { await DB.functions.invoke('tender-files', { body: { action: 'cancel-upload', tender_id: tenderId } }); } catch (_) {}
            throw new Error(t('t_r2_fail'));
          }

          const fin = await DB.functions.invoke('tender-files', {
            body: {
              action: 'finalize-upload',
              tender_id: tenderId,
              kind,
              reference: ref,
              title: title.trim(),
              title_fr: titleFr,
              duration: duration.trim(),
              opening_date: officeWallToISO(opening) || new Date(opening).toISOString(),
              faculty_id: facultyId,
            },
          });
          if (fin.error) throw fin.error;
          if (!fin.data || !fin.data.ok) {
            try { await DB.functions.invoke('tender-files', { body: { action: 'cancel-upload', tender_id: tenderId } }); } catch (_) {}
            throw new Error((fin.data && fin.data.error) || t('t_publish_fail'));
          }
        } else {
          // المسار 2: Supabase Storage (ملفات حتى 50MB فقط)
          if (file.size > 50 * 1024 * 1024) {
            throw new Error(t('t_r2_not'));
          }
          tenderId = crypto.randomUUID();
          const pdfPath = 'tenders/' + tenderId + '.pdf';

          const { error: upErr } = await DB.storage.from('tenders').upload(pdfPath, file, {
            contentType: 'application/pdf',
          });
          if (upErr) throw upErr;

          const { error: insErr } = await DB.from('tenders').insert({
            id: tenderId,
            kind,
            reference: ref,
            title: title.trim(),
            title_fr: titleFr,
            duration: duration.trim() || null,
            opening_date: new Date(opening).toISOString(),
            pdf_path: pdfPath,
            pdf_source: 'supabase',
            status: 'published',
            secure_link: true,
            faculty_id: facultyId,
          });
          if (insErr) throw insErr;
        }

        form.reset();
        if ($('f-title')) delete $('f-title').dataset.userEdited;
        $('file-info').textContent = '';
        toast(t('t_published'), 'success');
        A.page = 1;
        await A.loadTenders();
        window.switchTo('tab-tenders');
        const publishedTender = {
          id: tenderId,
          kind,
          reference: ref,
          title: title.trim(),
          title_fr: titleFr,
          duration: duration.trim() || null,
          opening_date: new Date(opening).toISOString(),
          secure_link: true,
          faculty_id: facultyId,
        };
        A.showQR(publishedTender);
      } catch (err) {
        console.error(err);
        const msg = String((err && err.message) || err);
        if (msg.includes('duplicate')) {
          toast(t('t_dup2'), 'error', 5000);
        } else if (msg.includes('column of') || msg.includes('schema cache') || msg.includes('does not exist')) {
          toast(t('t_schema'), 'error', 8000);
          checkSchema();
        } else if (msg.includes('R2') || msg.includes('r2') || msg.includes('Cloudflare')) {
          toast(t('t_r2_not2'), 'error', 7000);
        } else {
          toast(t('t_fail', { msg }), 'error', 6000);
        }
      } finally {
        setBusy(btn, false, t('create_btn'));
      }
    });
  }

  /* ---------- الأزرار الثابتة ---------- */

  function bindStaticButtons() {
    const csvBtn = $('dl-csv');
    if (csvBtn) csvBtn.addEventListener('click', exportCsv);
    const pdfBtn = $('dl-pdf');
    if (pdfBtn) pdfBtn.addEventListener('click', exportPdf);
    const printBtn = $('print-qr-btn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
    const openBtn = $('open-confirm-btn');
    if (openBtn) openBtn.addEventListener('click', confirmOpen);
    const replaceBtn = $('replace-confirm-btn');
    if (replaceBtn) replaceBtn.addEventListener('click', confirmReplace);
    const deleteBtn = $('delete-confirm-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', confirmDelete);
    const replaceFile = $('replace-file');
    if (replaceFile) replaceFile.addEventListener('change', (e) => {
      const f = e.target.files[0];
      $('replace-file-info').textContent = f ? f.name + ' — ' + (f.size / 1024 / 1024).toFixed(2) + ' MB' : '';
    });
    bindEditForm();
  }

  /* ---------- تعديل الاستشارة (الرقم والـ QR لا يتغيران) ---------- */

  function openEdit(tt) {
    $('e-id').value = tt.id;
    $('edit-tender-info').innerHTML =
      '<b>' + esc(fmtRef(tt.reference)) + '</b> — ' + kindLabel(tt.kind) +
      '<div class="text-xs text-slate-400 mt-1">' + t('edit_ref_note') + '</div>';
    const kindInput = document.querySelector('input[name="e-kind"][value="' + (tt.kind === 'tender' ? 'tender' : 'consultation') + '"]');
    if (kindInput) kindInput.checked = true;
    $('e-title-fr').value = tt.title_fr || '';
    $('e-title').value = tt.title || '';
    if ($('e-title')) delete $('e-title').dataset.userEdited;
    $('e-duration').value = tt.duration || '';
    const ef = $('e-faculty');
    if (ef) {
      ef.value = tt.faculty_id || (A.faculties.find((f) => f.is_central) || {}).id || '';
      ef.disabled = A.scopeOf() !== 'all'; // تغيير كلية الاستشارة: نطاق كامل فقط
    }
    const wall = isoToOfficeWall(tt.opening_date);
    $('e-date').value = wall ? wall.slice(0, 10) : '';
    $('e-time').value = wall ? (wall.slice(11, 16) || '10:00') : '10:00';
    openModal('edit-modal');
  }

  function bindEditForm() {
    const form = $('edit-form');
    if (!form) return;
    bindTitleTranslation('e-title-fr', 'e-title', 'e-translate-fr-ar-btn', 'e-translate-ar-fr-btn');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!A.me || !hasEdit()) return toast(t('t_perm_denied'), 'error');
      const id = $('e-id').value;
      const titleFr = val('e-title-fr').trim();
      const title = val('e-title').trim();
      const duration = val('e-duration').trim();
      const opening = (val('e-date') && val('e-time')) ? (val('e-date') + 'T' + val('e-time')) : (val('e-date') ? (val('e-date') + 'T10:00') : '');
      const kindEl = document.querySelector('input[name="e-kind"]:checked');
      const kind = kindEl ? kindEl.value : 'consultation';
      if (!id || !title || !opening) return toast(t('t_fill_all'), 'error');
      if (titleFr.length > 200) return toast(t('t_title_long'), 'error');
      if (title.length > 200) return toast(t('t_title_long'), 'error');
      if (duration.length > 100) return toast(t('t_duration_long'), 'error');
      if (isNaN(new Date(opening).getTime())) return toast(t('t_bad_date'), 'error');
      const btn = $('edit-btn');
      setBusy(btn, true, t('busy_edit'));
      try {
        const { error } = await DB.from('tenders')
          .update({
            kind,
            title,
            title_fr: titleFr || null,
            duration,
            opening_date: officeWallToISO(opening) || new Date(opening).toISOString(),
            faculty_id: A.scopeOf() === 'all' ? (val('e-faculty') || null) : (A.facultyId || null),
          })
          .eq('id', id);
        if (error) throw error;
        toast(t('t_edit_saved'), 'success');
        closeModal('edit-modal');
        A.refreshTenders();
      } catch (err) {
        console.error(err);
        toast(t('t_edit_fail') + ' — ' + ((err && err.message) || ''), 'error', 6000);
      } finally {
        setBusy(btn, false, t('edit_m_btn'));
      }
    });
  }

  /* ---------- قائمة الاستشارات ---------- */

  A.loadTenders = async function () {
    const list = $('tenders-list');
    const pager = $('tenders-pager');
    try {
      const term = (val('tender-search') || '').trim().replace(/[(),]/g, '');
      let q = DB.from('tenders').select('*, downloads(count), faculties(*)', { count: 'exact' });
      if (term) q = q.or('reference.ilike.%' + term + '%,title.ilike.%' + term + '%,title_fr.ilike.%' + term + '%');
      if (tenderFilter && tenderFilter.status) q = q.eq('status', tenderFilter.status);
      if (tenderFilter && tenderFilter.facultyId) q = q.eq('faculty_id', tenderFilter.facultyId);
      const from = (A.page - 1) * PAGE_SIZE;
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      A.total = count || 0;

      if (!data || !data.length) {
        list.innerHTML = emptyState(t('empty_tenders_t'), t('empty_tenders_s'));
        pager.innerHTML = '';
        return;
      }
      list.innerHTML = data.map(tenderCard).join('');
      pager.innerHTML = pagerHtml(A.total, A.page, 'main');
      bindPager();
    } catch (err) {
      console.error(err);
      list.innerHTML = errorState(err);
      pager.innerHTML = '';
    }
  };

  /* ---------- إحصائيات + فلاتر (شips) أعلى قائمة الاستشارات ---------- */

  function stChipActive(key) {
    if (!tenderFilter) return key === 'all';
    if (key === 'all') return false;
    if (key === 'published') return tenderFilter.status === 'published';
    if (key === 'opened') return tenderFilter.status === 'opened';
    if (key.indexOf('fac:') === 0) return tenderFilter.facultyId === key.slice(4);
    return false;
  }

  function stChipHtml(key, label, n) {
    const on = stChipActive(key);
    const cls = on
      ? 'bg-slate-800 text-white border-slate-800'
      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400';
    return '<button type="button" data-st-chip="' + key + '" class="text-[11px] font-bold rounded-full border px-3 py-1.5 transition whitespace-nowrap ' + cls + '">' +
      label + ' <span class="tabular-nums">' + n + '</span></button>';
  }

  A.loadStats = async function () {
    const box = $('tenders-stats');
    if (!box || A.disabled) { if (box) box.innerHTML = ''; return; }
    const countQ = (filters) => {
      let q = DB.from('tenders').select('id', { count: 'exact', head: true });
      Object.keys(filters).forEach((k) => { q = q.eq(k, filters[k]); });
      return q.then((r) => r.count || 0);
    };
    try {
      const showFacChips = A.scopeOf() === 'all';
      const [total, pub, opened] = await Promise.all([
        countQ({}),
        countQ({ status: 'published' }),
        countQ({ status: 'opened' }),
      ]);
      A.stats = { total, published: pub, opened };
      let html =
        stChipHtml('all', t('st_all'), total) +
        stChipHtml('published', t('st_published'), pub) +
        stChipHtml('opened', t('st_opened'), opened);
      if (showFacChips) {
        const counts = await Promise.all(A.faculties.map((f) => countQ({ faculty_id: f.id })));
        A.faculties.forEach((f, i) => {
          html += stChipHtml('fac:' + f.id, (f.icon || '') + ' ' + esc(facName(f)), counts[i]);
        });
      }
      box.innerHTML = html;
      box.querySelectorAll('[data-st-chip]').forEach((b) => b.addEventListener('click', () => {
        const k = b.dataset.stChip;
        let f = null;
        if (k === 'published') f = { status: 'published' };
        else if (k === 'opened') f = { status: 'opened' };
        else if (k.indexOf('fac:') === 0) f = { facultyId: k.slice(4) };
        const same = JSON.stringify(f) === JSON.stringify(tenderFilter);
        tenderFilter = same ? null : f;
        A.page = 1;
        A.loadTenders();
        A.loadStats();
      }));
    } catch (e) {
      box.innerHTML = '';
    }
  };

  function tenderCard(tt) {
    const dl = (tt.downloads && tt.downloads[0] && tt.downloads[0].count) || 0;
    const isPub = tt.status === 'published';
    return (
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">' +
      '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
      '<div class="font-bold text-slate-800 flex items-center gap-2 flex-wrap">' + esc(fmtRef(tt.reference)) +
      '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (tt.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-primary-50 text-primary-700') + '">' + kindLabel(tt.kind) + '</span>' +
      facChip(tt.faculties) +
      '</div>' +
      '<div class="text-sm text-slate-600 mt-0.5">' + esc(displayTitle(tt)) + '</div>' +
      '</div>' +
      statusBadge(tt.status) +
      '</div>' +
      '<div class="mt-3 grid grid-cols-2 gap-2 text-sm">' +
      '<div class="bg-slate-50 rounded-lg px-3 py-2">' +
      '<div class="text-xs text-slate-400">' + t('card_opening_l') + '</div>' +
      '<div class="text-slate-700">' + fmtDate(tt.opening_date, true) + '</div>' +
      (tt.opened_at ? '<div class="text-xs text-slate-400">' + t('card_opened_at', { d: fmtDate(tt.opened_at, true) }) + '</div>' : '') +
      '</div>' +
      '<div class="bg-slate-50 rounded-lg px-3 py-2">' +
      '<div class="text-xs text-slate-400">' + t('card_downloads_l') + '</div>' +
      '<div class="text-slate-700 font-bold">' + dl + '</div>' +
      '</div>' +
      '</div>' +
        '<div class="mt-3 grid grid-cols-2 gap-2">' +
          '<button data-act="qr" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_qr') + '</button>' +
          (hasEdit() && inScope(tt) ? '<button data-act="edit" data-id="' + tt.id + '" class="w-full btn-secondary !text-indigo-600">' + t('btn_edit') + '</button>' : '') +
         (hasLogs() && inScope(tt) ? '<button data-act="downloads" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_downloaders', { n: dl }) + '</button>' : '') +
        (isPub ? '<button data-act="direct" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_direct_dl') + '</button>' : '') +
       (isPub && hasEdit() && inScope(tt)
         ? '<button data-act="replace" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_replace') + '</button>'
         : '') +
       (isPub && hasOpen() && inScope(tt)
         ? (new Date(tt.opening_date).getTime() <= Date.now()
             ? '<button data-act="open" data-id="' + tt.id + '" class="w-full btn-danger">' + t('btn_open') + '</button>'
             : '<span class="btn-secondary w-full opacity-60 flex items-center justify-center" title="' + t('t_open_early', { d: fmtDate(tt.opening_date, true) }) + '">' + t('btn_open_locked') + '</span>')
         : '') +
       (hasDelete() && inScope(tt)
         ? '<button data-act="delete" data-id="' + tt.id + '" class="w-full btn-secondary !text-red-600">' + t('btn_delete') + '</button>'
         : '') +
       '</div>' +
      '</div>'
    );
  }

  // نقرات أزرار القائمة (قائمة الاستشارات + صفحة لجنة الفتح)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const tl = $('tenders-list');
    const ol = $('opening-list');
    if (!((tl && tl.contains(btn)) || (ol && ol.contains(btn)))) return;
    if (btn.dataset.act === 'open' && !hasOpen()) return;
    if (btn.dataset.act === 'edit' && !hasEdit()) return;
    if (btn.dataset.act === 'replace' && !hasEdit()) return;
    if (btn.dataset.act === 'delete' && !hasDelete()) return;
    DB.from('tenders').select('*').eq('id', btn.dataset.id).maybeSingle().then(({ data, error }) => {
      if (error || !data) return toast(t('t_fetch_fail'), 'error');
      if (btn.dataset.act === 'qr') A.showQR(data);
      else if (btn.dataset.act === 'downloads') A.showDownloads(data);
      else if (btn.dataset.act === 'direct') directDownload(data);
      else if (btn.dataset.act === 'report') openReport(data);
      else if (btn.dataset.act === 'open') askOpen(data);
      else if (btn.dataset.act === 'edit') openEdit(data);
      else if (btn.dataset.act === 'replace') askReplace(data);
      else if (btn.dataset.act === 'delete') askDelete(data);
    });
  });

  /* ---------- لجنة فتح الأظرفة ---------- */

  A.loadOpening = async function () {
    const list = $('opening-list');
    if (!list) return;
    list.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">' + t('loading') + '</div>';
    try {
      const [tRes, uRes] = await Promise.all([
        DB.from('tenders').select('*, downloads(count), faculties(*)').order('opening_date', { ascending: true }),
        DB.functions.invoke('manage-users', { body: { action: 'list' } }),
      ]);
      const { data, error } = tRes;
      if (error) throw error;

      const userName = {};
      const users = (uRes.data && uRes.data.users) || [];
      users.forEach((u) => { userName[u.id] = u.full_name || u.email; });
      A.userNames = userName;

      const now = Date.now();
      const rows = data || [];
      const ready = rows.filter((t) => t.status === 'published' && new Date(t.opening_date).getTime() <= now);
      const upcoming = rows.filter((t) => t.status === 'published' && new Date(t.opening_date).getTime() > now);
      const opened = rows
        .filter((t) => t.status === 'opened')
        .sort((a, b) => new Date(b.opened_at) - new Date(a.opened_at))
        .slice(0, 10);

      const dl = (t) => (t.downloads && t.downloads[0] && t.downloads[0].count) || 0;

      const card = (tt, isReady) => (
        '<div class="bg-white rounded-2xl shadow-sm border p-4 ' + (isReady ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200') + '">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<div class="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">' + esc(fmtRef(tt.reference)) +
        '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (tt.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-primary-50 text-primary-700') + '">' + kindLabel(tt.kind) + '</span>' +
        facChip(tt.faculties) +
        '</div>' +
        '<div class="text-sm text-slate-600 mt-0.5">' + esc(displayTitle(tt)) + '</div>' +
        '<div class="text-xs text-slate-400 mt-1">' + t('op_time', { d: fmtDate(tt.opening_date, true) }) +
        (isReady ? t('op_now') : '') + '</div>' +
        '</div>' +
        '<div class="text-center shrink-0">' +
        '<div class="text-xl font-black text-slate-700">' + dl(tt) + '</div>' +
        '<div class="text-[10px] text-slate-400">' + t('op_dl_word') + '</div>' +
        '</div>' +
        '</div>' +
        '<div class="mt-3 grid grid-cols-2 gap-2">' +
        '<button data-act="direct" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_direct_dl') + '</button>' +
        '<button data-act="downloads" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('op_btn_dl', { n: dl(tt) }) + '</button>' +
         (isReady && hasOpen()
           ? '<button data-act="open" data-id="' + tt.id + '" class="w-full btn-danger">' + t('btn_open') + '</button>'
           : '<span class="btn-secondary w-full opacity-60 flex items-center justify-center">' + t('op_btn_wait') + '</span>') +
        '</div>' +
        '</div>'
      );

      const openedRow = (tt) => (
        '<div class="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<div class="text-sm font-bold text-slate-700">' + esc(fmtRef(tt.reference)) + ' — ' + esc(displayTitle(tt)) + '</div>' +
        '<div class="text-xs text-slate-400 mt-0.5">' + t('op_opened_at', { d: fmtDate(tt.opened_at, true) }) +
        (tt.opened_by ? t('op_by', { n: esc(userName[tt.opened_by] || t('op_unknown')) }) : '') + '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 shrink-0">' +
        '<button data-act="downloads" data-id="' + tt.id + '" class="text-xs btn-secondary shrink-0">👥 ' + dl(tt) + '</button>' +
        '<button data-act="report" data-id="' + tt.id + '" class="text-xs btn-secondary shrink-0" title="' + t('btn_report') + '">' + t('btn_report') + '</button>' +
        '</div>' +
        '</div>'
      );

      let html = '';
      if (ready.length) {
        html += '<div class="text-xs font-bold text-amber-700 mb-1">' + t('op_ready') + '</div>' + ready.map((tt) => card(tt, true)).join('');
      }
      if (upcoming.length) {
        html += '<div class="text-xs font-bold text-slate-400 mt-4 mb-1">' + t('op_upcoming') + '</div>' + upcoming.map((tt) => card(tt, false)).join('');
      }
      if (opened.length) {
        html += '<div class="text-xs font-bold text-slate-400 mt-4 mb-1">' + t('op_opened') + '</div>' + opened.map(openedRow).join('');
      }
      if (!ready.length && !upcoming.length && !opened.length) {
        html = emptyState(t('empty_opening_t'), t('empty_opening_s'));
      }
      list.innerHTML = html;
    } catch (err) {
      list.innerHTML = errorState(err);
    }
  };

  /* ---------- بطاقة QR ---------- */

  A._qrLibPromise = null;
  function loadQrLib() {
    if (typeof window.QRCode !== 'undefined') return Promise.resolve();
    if (A._qrLibPromise) return A._qrLibPromise;
    A._qrLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js';
      s.onload = resolve;
      s.onerror = () => { A._qrLibPromise = null; reject(new Error('qr_load_failed')); };
      document.head.appendChild(s);
    });
    return A._qrLibPromise;
  }

  A.showQR = async function (t) {
    A.lastQrTender = t;
    $('qr-kind').textContent = kindLabel(t.kind);
    $('qr-reference').textContent = fmtRef(t.reference);
    $('qr-title').textContent = displayTitle(t);
    $('qr-duration').textContent = t.duration || '—';
    $('qr-opening').textContent = fmtDate(t.opening_date, true);

    // الكلية على البطاقة (null = المكتب المركزي)
    const qf = $('qr-faculty');
    if (qf) {
      const fac = (t.faculty_id && A.facultyById[t.faculty_id]) || A.faculties.find((f) => f.is_central);
      if (fac) {
        qf.innerHTML = '<span class="inline-flex items-center gap-1 text-sm font-bold rounded-full px-3 py-1" style="background:' + fac.color + '1a;color:' + fac.color + '">' + (fac.icon || '🎓') + ' ' + esc(facName(fac)) + '</span>';
        qf.classList.remove('hidden');
      } else {
        qf.classList.add('hidden');
      }
    }

    // رابط QR:
    //  - مشفّرة (secure_link): ?open=<UUID> — غير قابل للتخمين
    //  - قديمة: ?c=<أرقام المرجع>
    const configured = (window.TENDER_CONFIG || {}).PUBLIC_BASE_URL;
    const base = (configured || location.href.split('?')[0]).replace(/\/$/, '');
    let url;
    if (t.secure_link) {
      url = base + '?open=' + t.id;
    } else {
      const code = (t.reference || '').replace(/\D/g, '');
      url = code ? base + '?c=' + code : base + '?open=' + t.id;
    }
    const qrUrl = $('qr-url');
    if (qrUrl) qrUrl.textContent = url;

    const canvas = $('qr-canvas');
    try { await loadQrLib(); } catch (_) {}
    if (typeof window.QRCode === 'undefined') {
      toast(t('t_qr_load'), 'error');
      return;
    }
    window.QRCode.toCanvas(canvas, url, { width: 340, margin: 2, errorCorrectionLevel: 'M' }, (err) => {
      if (err) {
        console.error(err);
        toast(t('t_qr_gen'), 'error');
        return;
      }
      openModal('qr-modal');
    });
  };

  /* ---------- سجل التحميلات ---------- */

  A.showDownloads = async function (tt) {
    dlTender = tt;
    dlPage = 1;
    $('dl-title').textContent = t('dl_title', { ref: fmtRef(tt.reference) });
    openModal('downloads-modal');
    await A.loadDownloads();
  };

  A.loadDownloads = async function () {
    if (!dlTender) return;
    const box = $('dl-rows');
    try {
      const from = (dlPage - 1) * PAGE_SIZE;
      const { data, error, count } = await DB.from('downloads')
        .select('*')
        .eq('tender_id', dlTender.id)
        .order('downloaded_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      dlTotal = count || 0;

      if (!data || !data.length) {
        box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm">' + t('dl_empty') + '</div>';
        $('dl-pager').innerHTML = '';
        return;
      }
      box.innerHTML =
        '<div class="overflow-x-auto">' +
        '<table class="w-full text-sm">' +
        '<thead><tr class="text-slate-400 text-xs border-b border-slate-200">' +
        '<th class="py-2 text-right">' + t('th_company') + '</th><th class="py-2 text-right">' + t('th_phone') + '</th>' +
        '<th class="py-2 text-right">' + t('th_email') + '</th><th class="py-2 text-right">IP</th><th class="py-2 text-right">' + t('th_time') + '</th>' +
        '</tr></thead>' +
        '<tbody>' +
        data.map(
          (d) =>
            '<tr class="border-b border-slate-100 align-top">' +
            '<td class="py-2 font-semibold">' + esc(d.company) + '</td>' +
            '<td class="py-2" dir="ltr">' + esc(d.phone) + '</td>' +
            '<td class="py-2 break-all" dir="ltr">' + esc(d.email) + '</td>' +
            '<td class="py-2 text-xs text-slate-400" dir="ltr">' + esc(d.ip_address || '—') + '</td>' +
            '<td class="py-2 text-xs text-slate-500 whitespace-nowrap">' + fmtDate(d.downloaded_at, true) + '</td>' +
            '</tr>'
        ).join('') +
        '</tbody></table></div>';
      $('dl-pager').innerHTML = pagerHtml(dlTotal, dlPage, 'dl');
      bindPager();
    } catch (err) {
      box.innerHTML = errorState(err);
    }
  };

  async function exportCsv() {
    if (!dlTender) return;
    const { data, error } = await DB.from('downloads')
      .select('*')
      .eq('tender_id', dlTender.id)
      .order('downloaded_at');
    if (error || !data) return toast(t('t_export_fail'), 'error');
    const head = ['company', 'phone', 'email', 'ip_address', 'downloaded_at'];
    const rows = data.map((d) => head.map((k) => csvCell(d[k])).join(','));
    const csv = '\uFEFF' + [head.join(','), ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'downloads_' + String(dlTender.reference).replace(/[^\w.-]+/g, '_') + '.csv');
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
  }

  // تصدير سجل التحميلات كـ PDF (نسخة مطبوعة بالغة الواجهة — «حفظ كـ PDF» من مربع الطباعة)
  async function exportPdf() {
    if (!dlTender) return;
    const { data, error } = await DB.from('downloads')
      .select('*')
      .eq('tender_id', dlTender.id)
      .order('downloaded_at', { ascending: true });
    if (error) return toast(t('t_export_fail'), 'error');
    if (!data || !data.length) return toast(t('t_no_records'), 'error');
    const lang = I18N.lang;
    const isRtl = lang === 'ar';
    const th = t('pdf_th');
    const rows = data.map((d, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + esc(d.company) + '</td><td dir="ltr">' + esc(d.phone) + '</td>' +
      '<td dir="ltr">' + esc(d.email) + '</td><td dir="ltr">' + esc(d.ip_address || '—') + '</td>' +
      '<td>' + fmtDate(d.downloaded_at, true) + '</td></tr>'
    ).join('');
    const html =
      '<!DOCTYPE html><html dir="' + (isRtl ? 'rtl' : 'ltr') + '" lang="' + lang + '"><head><meta charset="utf-8">' +
      '<title>' + t('pdf_doc_title', { ref: esc(fmtRef(dlTender.reference)) }) + '</title>' +
      '<style>' +
      'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:24px;color:#1e293b}' +
      'h1{font-size:17px;margin:0 0 2px}' +
      '.sub{font-size:12px;color:#475569;margin:0 0 14px}' +
      'table{width:100%;border-collapse:collapse;font-size:11.5px}' +
      'th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:' + (isRtl ? 'right' : 'left') + '}' +
      'th{background:#f0fdfa;color:#0f766e}' +
      '.foot{margin-top:18px;font-size:11px;color:#64748b;display:flex;justify-content:space-between}' +
      '@media print{body{margin:12px}}' +
      '</style></head><body>' +
      '<h1>' + t('pdf_h1') + '</h1>' +
      '<p class="sub">' + t('pdf_sub', { kind: kindLabel(dlTender.kind), ref: esc(fmtRef(dlTender.reference)), title: esc(dlTender.title), n: data.length, d: fmtDate(new Date().toISOString(), true) }) + '</p>' +
      '<table><thead><tr>' + th.map((h) => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<div class="foot"><span>' + t('pdf_foot1') + '</span><span>' + t('pdf_foot2') + '</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' +
      '</body></html>';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return toast(t('t_popup'), 'error');
    w.document.write(html);
    w.document.close();
  }

  /* ---------- تحميل مباشر (لجنة الفتح — دون QR) ---------- */

  function directDownload(tt) {
    if (!tt || tt.status !== 'published') {
      return toast(t('t_direct_fail'), 'error', 5000);
    }
    toast(t('t_direct_start'), 'info', 2500);
    DB.functions.invoke('get-download', {
      body: {
        tender_id: tt.id,
        no_log: true,
        company: t('t_direct_as'),
        phone: '000000000',
        email: 'committee@uatbb.dz',
      },
    })
      .then(({ data, error }) => {
        if (error || !data || !data.url) {
          const msg = error ? String(error.message || error) : '';
          if (msg.includes('link_failed') || msg.includes('no_file')) {
            return toast(t('t_direct_nofile'), 'error', 5000);
          }
          return toast(t('t_direct_fail'), 'error', 5000);
        }
        window.open(data.url, '_blank');
      })
      .catch(() => toast(t('t_direct_fail'), 'error', 5000));
  }

  /* ---------- فتح الأظرفة ---------- */

  function askOpen(tt) {
    openTender = tt;
    $('open-tender-info').innerHTML =
      '<b>' + esc(fmtRef(tt.reference)) + '</b> — ' + esc(displayTitle(tt)) +
      '<br><span class="text-xs text-slate-400">' + t('op_time', { d: fmtDate(tt.opening_date, true) }) + '</span>';
    $('open-ref-input').value = '';
    openModal('open-modal');
    setTimeout(() => $('open-ref-input').focus(), 100);
  }

  async function confirmOpen() {
    const tt = openTender;
    if (!tt) return;
    if (!A.me || !hasOpen()) return toast(t('t_open_perm'), 'error');
    if (new Date(tt.opening_date).getTime() > Date.now()) {
      return toast(t('t_open_early', { d: fmtDate(tt.opening_date, true) }), 'error', 6000);
    }
    if (!sameRef(val('open-ref-input'), tt.reference)) return toast(t('t_ref_mismatch'), 'error');

    const btn = $('open-confirm-btn');
    setBusy(btn, true, t('busy_open'));
    try {
      const { data: { user } } = await DB.auth.getUser();

      const { data, error } = await DB.from('tenders')
        .update({ status: 'opened', opened_at: new Date().toISOString(), opened_by: user ? user.id : null })
        .eq('id', tt.id)
        .eq('status', 'published')
        .select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('already_opened');

      if (tt.pdf_path) {
        const { error: delErr } = await DB.storage.from('tenders').remove([tt.pdf_path]);
        if (delErr) console.warn('تنبيه: الحالة تغيّرت لكن ملف التخزين:', delErr.message || delErr);
      }

      closeModal('open-modal');
      toast(t('t_opened'), 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      const msg = String((err && err.message) || err);
      if (msg.includes('already_opened')) {
        toast(t('t_already_opened'), 'error', 5000);
        A.refreshTenders();
      } else {
        toast(t('t_fail', { msg }), 'error', 6000);
      }
    } finally {
      setBusy(btn, false, t('open_m_btn'));
    }
  }

  /* ---------- توليد إعلان الاستشارة (عربي/فرنسي — صفحتان A4) ---------- */

  const ANN_MONTHS_AR = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const ANN_MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function fmtMoney(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* ---------- محضر فتح الأظرفة (وثيقة رسمية قابلة للطباعة) ---------- */

  async function openReport(tt) {
    if (!tt || tt.status !== 'opened') return;
    let downloads = [];
    try {
      const { data, error } = await DB.from('downloads')
        .select('*')
        .eq('tender_id', tt.id)
        .order('downloaded_at', { ascending: true });
      if (error) throw error;
      downloads = data || [];
    } catch (e) {
      return toast(t('t_fail', { msg: String((e && e.message) || e) }), 'error', 6000);
    }
    let faculty = null;
    if (tt.faculty_id) {
      try {
        const { data } = await DB.from('faculties').select('*').eq('id', tt.faculty_id).maybeSingle();
        faculty = data;
      } catch (e) { /* تجاهل */ }
    }
    const lang = I18N.lang;
    const isRtl = lang === 'ar';
    const facName = faculty
      ? (isRtl ? faculty.name_ar : (faculty.name_fr || faculty.name_ar))
      : t('pv_central');
    const openedByName = (tt.opened_by && A.userNames && A.userNames[tt.opened_by]) || t('op_unknown');
    const dlRows = downloads.length
      ? downloads.map((d, i) =>
          '<tr><td>' + (i + 1) + '</td><td>' + esc(d.company) + '</td><td dir="ltr">' + esc(d.phone) + '</td>' +
          '<td dir="ltr">' + esc(d.email) + '</td><td>' + fmtDate(d.downloaded_at, true) + '</td></tr>').join('')
      : '<tr><td colspan="5" class="empty">' + t('pv_none') + '</td></tr>';

    const html =
      '<!DOCTYPE html><html dir="' + (isRtl ? 'rtl' : 'ltr') + '" lang="' + lang + '"><head><meta charset="utf-8">' +
      '<title>' + t('pv_title') + ' — ' + esc(fmtRef(tt.reference)) + '</title>' +
      '<style>' +
      'body{font-family:"Cairo","Segoe UI",Tahoma,Arial,sans-serif;margin:28px;color:#0f172a}' +
      '.head{text-align:center;border-bottom:3px double #047857;padding-bottom:12px;margin-bottom:14px}' +
      '.head h1{font-size:19px;margin:0 0 3px;color:#065f46}' +
      '.head p{font-size:12.5px;margin:0;color:#334155}' +
      'table.info{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:16px}' +
      'table.info td{border:1px solid #cbd5e1;padding:6px 10px}' +
      'table.info td.k{background:#ecfdf5;color:#065f46;font-weight:700;width:32%}' +
      'h2{font-size:13.5px;margin:0 0 6px;color:#0f172a}' +
      'table.list{width:100%;border-collapse:collapse;font-size:11.5px;margin-bottom:22px}' +
      'th,td{border:1px solid #cbd5e1;padding:4px 8px}' +
      'th{background:#ecfdf5;color:#047857;font-weight:700}' +
      'td.empty{text-align:center;color:#64748b}' +
      '.sigs{display:flex;gap:24px;margin-top:34px}' +
      '.sig{flex:1;text-align:center;font-size:12.5px;font-weight:700}' +
      '.sig .line{height:86px;border-top:1px solid #94a3b8;margin-top:56px;padding-top:6px;color:#475569;font-weight:600;font-size:11px}' +
      '.foot{margin-top:26px;font-size:10.5px;color:#64748b;display:flex;justify-content:space-between}' +
      '@media print{body{margin:14px}.sig .line{height:70px}}' +
      '</style></head><body>' +
      '<div class="head">' +
      '<h1>' + t('pv_title') + '</h1>' +
      '<p>' + t('univ') + ' — ' + t('app_name') + '</p>' +
      '</div>' +
      '<table class="info">' +
      '<tr><td class="k">' + t('pv_ref') + '</td><td><b>' + esc(fmtRef(tt.reference)) + '</b></td>' +
      '<td class="k">' + t('pv_kind') + '</td><td>' + kindLabel(tt.kind) + '</td></tr>' +
      '<tr><td class="k">' + t('pv_title_l') + '</td><td colspan="3">' + esc(displayTitle(tt)) + '</td></tr>' +
      '<tr><td class="k">' + t('pv_faculty') + '</td><td colspan="3">' + esc(facName) + '</td></tr>' +
      '<tr><td class="k">' + t('pv_open_sched') + '</td><td>' + fmtDate(tt.opening_date, true) + '</td>' +
      '<td class="k">' + t('pv_open_actual') + '</td><td>' + fmtDate(tt.opened_at, true) + '</td></tr>' +
      '<tr><td class="k">' + t('pv_opened_by') + '</td><td colspan="3">' + esc(openedByName) + '</td></tr>' +
      '</table>' +
      '<h2>' + t('pv_dl_title') + ' <span style="font-weight:400;color:#64748b">(' + t('pv_n', { n: downloads.length }) + ')</span></h2>' +
      '<table class="list"><thead><tr>' +
      '<th style="width:34px">#</th><th>' + t('pv_th_company') + '</th><th>' + t('pv_th_phone') + '</th>' +
      '<th>' + t('pv_th_email') + '</th><th>' + t('pv_th_time') + '</th>' +
      '</tr></thead><tbody>' + dlRows + '</tbody></table>' +
      '<div class="sigs">' +
      '<div class="sig">' + t('pv_sig1') + '<div class="line">' + t('pv_sign') + '</div></div>' +
      '<div class="sig">' + t('pv_sig2') + '<div class="line">' + t('pv_sign') + '</div></div>' +
      '<div class="sig">' + t('pv_sig3') + '<div class="line">' + t('pv_sign') + '</div></div>' +
      '</div>' +
      '<div class="foot"><span>' + t('pdf_foot1') + '</span><span>' + fmtDate(new Date().toISOString(), true) + '</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>' +
      '</body></html>';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return toast(t('t_popup'), 'error');
    w.document.write(html);
    w.document.close();
  }

  /* ---------- تغيير دفتر الشروط (نفس الـ QR) ---------- */

  function askReplace(tt) {
    replaceTender = tt;
    $('replace-tender-info').innerHTML =
      '<b>' + esc(fmtRef(tt.reference)) + '</b> — ' + esc(displayTitle(tt)) +
      '<br><span class="text-xs text-slate-400">' + t('rep_info_note') + '</span>';
    $('replace-file').value = '';
    $('replace-file-info').textContent = '';
    openModal('replace-modal');
  }

  async function confirmReplace() {
    const tt = replaceTender;
    if (!tt) return;
    if (!A.me || !hasEdit()) return toast(t('t_replace_perm'), 'error');
    const f = $('replace-file').files[0];
    if (!f) return toast(t('t_choose_pdf'), 'error');
    if (f.type !== 'application/pdf') return toast(t('t_pdf_only'), 'error');
    if (f.size > 50 * 1024 * 1024) return toast(t('t_too_big'), 'error');

    const btn = $('replace-confirm-btn');
    setBusy(btn, true, t('busy_replace'));
    try {
      if (tt.pdf_source === 'r2') {
        const prep = await DB.functions.invoke('tender-files', {
          body: { action: 'prepare-replace', tender_id: tt.id },
        });
        if (prep.error) throw prep.error;
        if (!prep.data || !prep.data.upload_url) throw new Error(t('t_r2_not3'));
        const put = await fetch(prep.data.upload_url, { method: 'PUT', body: f });
        if (!put.ok) throw new Error(t('t_upload_fail'));
      } else {
        // رفع الجديد في مسار فريد جديد + تحديث مسار الصف
        // (الـ QR يستخدم رقم الاستشارة فقط — فيبقى صالحًا بدون أي تغيير)
        const newPath = 'tenders/' + tt.id + '-r' + Date.now() + '.pdf';

        // 1) رفع الملف الجديد (مسار جديد دائمًا → لا تعارض 409)
        const { error: upErr } = await DB.storage.from('tenders').upload(newPath, f, {
          contentType: 'application/pdf',
        });
        if (upErr) throw upErr;

        // 2) تحديث مسار الملف في صف الاستشارة
        const { error: rowErr } = await DB.from('tenders')
          .update({ pdf_path: newPath })
          .eq('id', tt.id);
        if (rowErr) {
          await DB.storage.from('tenders').remove([newPath]);
          throw rowErr;
        }

        // 3) حذف الملف القديم (بجهد — إن فشل يبقى غير قابل للوصول)
        if (tt.pdf_path && tt.pdf_path !== newPath) {
          const { error: rmErr } = await DB.storage.from('tenders').remove([tt.pdf_path]);
          if (rmErr) console.warn('تنبيه: بقي الملف القديم:', rmErr.message || rmErr);
        }
      }
      closeModal('replace-modal');
      toast(t('t_replaced'), 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      toast(t('t_fail', { msg: (err && err.message) || err }), 'error', 6000);
    } finally {
      setBusy(btn, false, t('rep_m_btn'));
    }
  }

  /* ---------- حذف الاستشارة ---------- */

  function askDelete(tt) {
    deleteTender = tt;
    $('delete-tender-info').innerHTML =
      '<b>' + esc(fmtRef(tt.reference)) + '</b> — ' + esc(displayTitle(tt)) +
      '<br><span class="text-xs text-slate-400">' +
      (tt.status === 'published' ? t('del_info_pub') : t('del_info_open')) +
      '</span>';
    $('delete-ref-input').value = '';
    openModal('delete-modal');
    setTimeout(() => $('delete-ref-input').focus(), 100);
  }

  async function confirmDelete() {
    const tt = deleteTender;
    if (!tt) return;
    if (!A.me || !hasDelete()) return toast(t('t_delete_perm'), 'error');
    if (!sameRef(val('delete-ref-input'), tt.reference)) return toast(t('t_ref_mismatch'), 'error');

    const btn = $('delete-confirm-btn');
    setBusy(btn, true, t('busy_delete'));
    try {
      if (tt.pdf_source === 'r2') {
        const { data, error } = await DB.functions.invoke('tender-files', {
          body: { action: 'delete-tender', tender_id: tt.id },
        });
        if (error) throw error;
        if (!data || !data.ok) throw new Error((data && data.error) || t('t_delete_fail'));
      } else {
        // 1) حذف الصف من قاعدة البيانات (مع التحقق الفعلي من التنفيذ)
        const { data: delRows, error } = await DB.from('tenders').delete().eq('id', tt.id).select('id');
        if (error) throw error;
        if (!delRows || !delRows.length) {
          throw new Error(t('t_not_deleted'));
        }
        // 2) حذف الملف من التخزين (إن وُجد)
        if (tt.pdf_path) {
          const { error: rmErr } = await DB.storage.from('tenders').remove([tt.pdf_path]);
          if (rmErr) console.warn('تنبيه: حُذفت الاستشارة لكن الملف:', rmErr.message || rmErr);
        }
      }
      closeModal('delete-modal');
      toast(t('t_deleted'), 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      toast(t('t_fail', { msg: (err && err.message) || err }), 'error', 6000);
    } finally {
      setBusy(btn, false, t('del_m_btn'));
    }
  }

  /* ---------- إدارة الحسابات ---------- */

  let accFilter = 'all'; // all | active | suspended

  function bindAccounts() {
    const eaSave = $('ea-save-btn');
    if (eaSave) eaSave.addEventListener('click', saveEditAccount);
    const form = $('account-form');
    if (!form) return;
    // زر إضافة قابل للطي
    const tg = $('acc-add-toggle');
    const fbox = $('account-form-box');
    if (tg && fbox) tg.addEventListener('click', () => fbox.classList.toggle('hidden'));
    // بحث فوري في الحسابات
    const s = $('accounts-search');
    if (s) s.addEventListener('input', debounce(() => { if (A.renderAccounts) A.renderAccounts(); }, 250));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!A.me || !hasAccounts()) return toast(t('t_perm_denied'), 'error');
      const full_name = $('a-name').value.trim();
      const email = $('a-email').value.trim();
      const password = $('a-pass').value;
      const roleEl = document.querySelector('input[name="a-role"]:checked');
      const role = roleEl ? roleEl.value : 'viewer';
      const faculty_id = val('a-faculty') || null;
      if (!full_name || !email || !password) return toast(t('t_fill'), 'error');
      if (password.length < 8) return toast(t('t_pass_short'), 'error');
      const btn = form.querySelector('button[type=submit]');
      setBusy(btn, true, t('busy_add'));
      try {
        const createBody = { action: 'create', full_name, email, password, role, faculty_id };
        if (role === 'admin' || role === 'admin_rectora') createBody.permissions = PRESETS[role];
        const { data, error } = await DB.functions.invoke('manage-users', { body: createBody });
        if (error) throw error;
        if (!data || data.error) {
          const msg =
            data.error === 'weak_password' ? t('t_pass_short')
            : data.error === 'bad_email' ? t('t_bad_email')
            : data.error;
          throw new Error(msg);
        }
        toast(t('t_acc_added'), 'success');
        form.reset();
        if (fbox) fbox.classList.add('hidden');
        A.refreshAccounts();
      } catch (err) {
        console.error(err);
        toast(t('t_fail', { msg: (err && err.message) || err }), 'error', 5000);
      } finally {
        setBusy(btn, false, t('acc_add_btn'));
      }
    });
  }

  /* ---------- نسخة احتياطية يدوية (إداري) ---------- */

  const T_COLS = ['id', 'kind', 'reference', 'title', 'title_fr', 'duration', 'opening_date', 'pdf_path', 'pdf_source', 'status', 'opened_at', 'opened_by', 'created_at'];
  const D_COLS = ['id', 'tender_id', 'company', 'phone', 'email', 'ip_address', 'user_agent', 'downloaded_at'];
  const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

  function csvRows(rows, cols) {
    return cols.join(',') + '\n' +
      rows.map((r) =>
        cols.map((c) => '"' + String(r[c] == null ? '' : r[c]).replaceAll('"', '""') + '"').join(',')
      ).join('\n');
  }

  // تنزيل لقطة من الحالة الحالية (3 ملفات) — يُستخدم في النسخ وفي الاستعادة (نسخة أمان)
  async function snapshotFiles() {
    const [tRes, dRes, uRes] = await Promise.all([
      DB.from('tenders').select('*'),
      DB.from('downloads').select('*'),
      DB.functions.invoke('manage-users', { body: { action: 'list' } }),
    ]);
    if (tRes.error) throw tRes.error;
    if (dRes.error) throw dRes.error;
    const stamp = new Date().toISOString().slice(0, 10);
    const users = (uRes.data && uRes.data.users) || [];
    downloadBlob(new Blob([JSON.stringify(tRes.data, null, 2)], { type: 'application/json' }),
      'backup_tenders_' + stamp + '.json');
    setTimeout(() => {
      downloadBlob(new Blob(['\uFEFF' + csvRows(dRes.data || [], D_COLS)],
        { type: 'text/csv;charset=utf-8' }), 'backup_downloads_' + stamp + '.csv');
      setTimeout(() => {
        downloadBlob(new Blob(['\uFEFF' + csvRows(users,
          ['id', 'email', 'full_name', 'role', 'faculty_id', 'is_active', 'created_at'])], { type: 'text/csv;charset=utf-8' }),
          'backup_users_' + stamp + '.csv');
      }, 700);
    }, 700);
  }

  function bindBackup() {
    const b = $('backup-btn');
    if (!b) return;
    b.addEventListener('click', async () => {
      if (!A.me || !canBackup()) return toast(t('t_perm_denied'), 'error');
      setBusy(b, true, t('busy_backup'));
      try {
        await snapshotFiles();
        setTimeout(() => {
          toast(t('t_backup_done'), 'success', 6000);
          setBusy(b, false, t('bk_btn'));
        }, 1500);
      } catch (err) {
        console.error(err);
        toast(t('t_backup_fail') + ' — ' + ((err && err.message) || ''), 'error', 6000);
        setBusy(b, false, t('bk_btn'));
      }
    });
  }

  /* ---------- استعادة من ملفات نسخة (إداري) ---------- */

  let restoreData = null;

  // محلل CSV (يدعم علامات الاقتباس والفواصل داخل الحقول)
  function parseCsv(text) {
    const rows = [];
    let row = [], cur = '', inQ = false;
    const s = String(text).replace(/^\uFEFF/, '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inQ) {
        if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cur); cur = ''; }
      else if (ch === '\n') { row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else if (ch !== '\r') cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  async function handleRestoreFiles(e) {
    if (!A.me || !canBackup()) return;
    const box = $('restore-summary');
    const files = Array.from((e.target.files) || []);
    let tenders = null, downloads = null;
    for (const f of files) {
      let text;
      try { text = await f.text(); } catch { continue; }
      if (f.name.toLowerCase().endsWith('.json')) {
        try {
          const arr = JSON.parse(text);
          if (Array.isArray(arr) && arr.length && arr[0] && arr[0].id && arr[0].reference) tenders = arr;
        } catch { /* ليس ملف نسخ صالح */ }
      } else if (f.name.toLowerCase().endsWith('.csv')) {
        const rows = parseCsv(text);
        if (!rows.length) continue;
        const hdr = {};
        rows[0].forEach((h, i) => { hdr[h] = i; });
        if (hdr.tender_id !== undefined) {
          downloads = rows.slice(1).map((r) => {
            const o = {};
            for (const c of D_COLS) o[c] = (r[hdr[c]] || '').trim() === '' ? null : r[hdr[c]];
            return o;
          }).filter((o) => o.id && o.tender_id);
        }
      }
    }
    e.target.value = '';
    if (!tenders) {
      restoreData = null;
      box.classList.remove('hidden');
      box.innerHTML = '<span class="text-red-600 font-semibold">' + t('rs_found_none') + '</span>';
      return;
    }
    restoreData = { tenders, downloads: downloads || [] };
    box.classList.remove('hidden');
    box.innerHTML =
      '<span class="inline-block bg-slate-100 text-slate-700 rounded-full px-3 py-1 font-semibold">' +
      t('rs_found_t') + ': ' + tenders.length + '</span> ' +
      '<span class="inline-block bg-slate-100 text-slate-700 rounded-full px-3 py-1 font-semibold">' +
      t('rs_found_d') + ': ' + downloads.length + '</span>';
  }

  function bindRestore() {
    const inp = $('restore-files');
    const b = $('restore-btn');
    if (!inp || !b) return;
    inp.addEventListener('change', handleRestoreFiles);
    b.addEventListener('click', () => {
      if (!A.me || !canBackup()) return toast(t('t_perm_denied'), 'error');
      if (!restoreData) return toast(t('rs_found_none'), 'warn', 5000);
      const info = $('restore-modal-info');
      info.innerHTML =
        '<div class="font-bold text-slate-800 mb-1">' + t('rs_found_t') + ': ' + restoreData.tenders.length + '</div>' +
        '<div class="mb-2">' + t('rs_found_d') + ': ' + (restoreData.downloads.length || t('rs_info_dl_none')) + '</div>' +
        '<div class="text-xs text-slate-400 leading-relaxed">' + t('rs_note_pdf') + '</div>';
      openModal('restore-modal');
    });
    const cb = $('restore-confirm-btn');
    if (cb) cb.addEventListener('click', confirmRestore);
  }

  async function confirmRestore() {
    if (!restoreData) return;
    const btn = $('restore-confirm-btn');
    setBusy(btn, true, t('busy_restore'));
    try {
      if ($('restore-safety').checked) {
        try { await snapshotFiles(); } catch (e) { console.warn('snapshot skipped:', e); }
        await new Promise((r) => setTimeout(r, 2000));
      }
      // 1) مسح السجل ثم الاستشارات (الاستبدال الكامل)
      const { error: d1 } = await DB.from('downloads').delete().neq('id', ZERO_UUID);
      if (d1) throw d1;
      const { error: d2 } = await DB.from('tenders').delete().neq('id', ZERO_UUID);
      if (d2) throw d2;
      // 2) إدخال الاستشارات (دفعة واحدة = عملية ذرّية)
      const clean = restoreData.tenders.map((r) => {
        const o = {};
        for (const c of T_COLS) if (r[c] !== undefined) o[c] = r[c];
        return o;
      }).filter((o) => o.id && o.reference);
      if (clean.length) {
        const { error: i1 } = await DB.from('tenders').insert(clean);
        if (i1) throw i1;
      }
      // 3) إدخال سجل التحميلات
      if (restoreData.downloads.length) {
        const { error: i2 } = await DB.from('downloads').insert(restoreData.downloads);
        if (i2) throw i2;
      }
      toast(t('t_restore_done', { n: clean.length }), 'success', 6000);
      restoreData = null;
      $('restore-summary').classList.add('hidden');
      closeModal('restore-modal');
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      toast(t('t_restore_fail') + ' — ' + ((err && err.message) || ''), 'error', 8000);
      setBusy(btn, false, t('rs_m_btn'));
    }
  }

  A.refreshAccounts = async function () {
    const list = $('accounts-list');
    const pend = $('pending-list');
    const chips = $('accounts-chips');
    if (!list) return;
    if (A.me && !A.can('accounts')) {
      if (list) list.innerHTML = '';
      if (pend) pend.innerHTML = '';
      if (chips) chips.innerHTML = '';
      return;
    }
    list.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">' + t('loading') + '</div>';
    if (pend) pend.innerHTML = '';
    try {
      const { data, error } = await DB.functions.invoke('manage-users', { body: { action: 'list' } });
      if (error) throw error;
      if (!data || !data.users) throw new Error((data && data.error) || t('t_fetch_users'));
      A.users = data.users.map((u) => Object.assign({}, u, { role: normalizeRole(u.role) }));
      A.renderAccounts();
    } catch (err) {
      console.error(err);
      list.innerHTML = errorState(err);
    }
  };

  // عرض الحسابات: شارات فلترة + طلبات الانتظار + القائمة (بحث/فلتر دون إعادة جلب)
  A.renderAccounts = function () {
    const chips = $('accounts-chips');
    const pend = $('pending-list');
    const list = $('accounts-list');
    if (!list) return;
    const users = A.users || [];
    const pendingUsers = users.filter((u) => u.pending);
    const shown = users.filter((u) => !u.pending);
    const nActive = shown.filter((u) => u.is_active !== false).length;
    const nSuspended = shown.length - nActive;

    // شارات الفلترة (نفس أسلوب إحصائيات الاستشارات)
    if (chips) {
      const chip = (key, label, n) => {
        const on = accFilter === key;
        return '<button type="button" data-acc-chip="' + key + '" class="text-[11px] font-bold rounded-full border px-3 py-1.5 transition whitespace-nowrap ' +
          (on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400') + '">' +
          label + ' <span class="tabular-nums">' + n + '</span></button>';
      };
      chips.innerHTML =
        chip('all', t('acc_stats_all'), shown.length) +
        chip('active', t('acc_stats_active'), nActive) +
        chip('suspended', t('acc_stats_suspended'), nSuspended);
      chips.querySelectorAll('[data-acc-chip]').forEach((b) =>
        b.addEventListener('click', () => { accFilter = b.dataset.accChip; A.renderAccounts(); })
      );
    }

    // طلبات بانتظار الموافقة
    if (pend) {
      pend.innerHTML = pendingUsers.length
        ? '<div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-3">' +
          '<div class="font-bold text-amber-800 text-sm mb-2">🕓 ' + t('acc_pending_title') + ' (' + pendingUsers.length + ')</div>' +
          '<div class="space-y-2">' + pendingUsers.map(pendingCard).join('') + '</div>' +
          '</div>'
        : '';
      bindPendingControls(pend);
    }

    // القائمة: فلتر + بحث
    const term = (val('accounts-search') || '').trim().toLowerCase();
    let rows = shown.filter((u) =>
      accFilter === 'all' ? true : (accFilter === 'active' ? u.is_active !== false : u.is_active === false));
    if (term) rows = rows.filter((u) =>
      (u.full_name || '').toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term));
    list.innerHTML = rows.length
      ? rows.map(accountCard).join('')
      : emptyState(term || accFilter !== 'all' ? t('acc_none_found') : t('empty_accounts_t'), '');
    bindAccountControls(list);
  };

  // محرر الصلاحيات الدقيقة (نطاق + أفعال + قوالب + كلية)
  function permEditorHtml(u) {
    const p = u.permissions || { scope: 'own', actions: {} };
    const allOk = A.scopeOf() === 'all';
    const scopes = allOk ? ['all', 'own', 'none'] : ['own', 'none'];
    const scopeHtml = scopes.map((s) =>
      '<label class="flex items-center gap-1.5 text-xs font-bold cursor-pointer">' +
      '<input type="radio" name="perm-scope" value="' + s + '"' + (p.scope === s ? ' checked' : '') + ' class="w-3.5 h-3.5">' +
      '<span>' + t('scope_' + s) + '</span></label>'
    ).join('');
    const actHtml = ACTIONS.map((a) =>
      '<label class="flex items-center gap-1.5 text-xs font-bold cursor-pointer bg-slate-50 rounded-lg px-2 py-1.5">' +
      '<input type="checkbox" data-act-chk="' + a + '"' + (p.actions[a] ? ' checked' : '') + ' class="w-3.5 h-3.5">' +
      '<span>' + t('act_' + a) + '</span></label>'
    ).join('');
    const currentPages = p.pages || (PRESETS[u.role] && PRESETS[u.role].pages) || ALL_PAGES;
    const pagesHtml = PAGES.map((key) =>
      '<label class="flex items-center gap-1.5 text-xs font-bold cursor-pointer bg-slate-50 rounded-lg px-2 py-1.5">' +
      '<input type="checkbox" data-page-chk="' + key + '"' + (currentPages[key] !== false ? ' checked' : '') + ' class="w-3.5 h-3.5">' +
      '<span>' + t('page_' + key) + '</span></label>'
    ).join('');
    const presetHtml = Object.keys(PRESETS).map((k) =>
      '<button type="button" data-preset="' + k + '" class="text-[10px] font-bold rounded-full border border-slate-200 hover:border-primary-400 hover:text-primary-700 px-2.5 py-1 whitespace-nowrap">' + t('preset_' + k) + '</button>'
    ).join('');
    const facOpts = scopeFaculties().map((f) =>
      '<option value="' + f.id + '"' + (u.faculty_id === f.id ? ' selected' : '') + '>' + (f.icon || '') + ' ' + esc(facName(f)) + '</option>'
    ).join('');
    return (
      '<div class="space-y-2.5">' +
      '<div class="flex flex-wrap gap-3">' + scopeHtml + '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">' + actHtml + '</div>' +
      '<div><div class="text-[10px] font-bold text-slate-400 mb-1">' + t('pages_label') + '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">' + pagesHtml + '</div></div>' +
      '<div class="flex flex-wrap items-center gap-1.5">' +
      '<span class="text-[10px] font-bold text-slate-400">' + t('presets_label') + '</span>' + presetHtml +
      '</div>' +
      (facOpts ? '<div><label class="lbl">' + t('acc_faculty') + '</label>' +
        '<select data-perm-fac class="inp !text-xs !py-1.5">' + facOpts + '</select></div>' : '') +
      '<button type="button" data-perm-save="' + u.id + '" class="btn-primary w-full !py-2 !text-xs">' + t('perm_save') + '</button>' +
      '</div>'
    );
  }

  function bindPermEditor(box) {
    box.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.preset;
        const p = PRESETS[k];
        const r = box.querySelector('input[name="perm-scope"][value="' + p.scope + '"]');
        if (r) r.checked = true;
        ACTIONS.forEach((a) => {
          const c = box.querySelector('[data-act-chk="' + a + '"]');
          if (c) c.checked = !!p.actions[a];
        });
        PAGES.forEach((key) => {
          const c = box.querySelector('[data-page-chk="' + key + '"]');
          if (c) c.checked = !p.pages || p.pages[key] !== false;
        });
      })
    );
    box.querySelectorAll('[data-perm-save]').forEach((b) =>
      b.addEventListener('click', () => savePerms(b.dataset.permSave))
    );
  }

  function savePerms(uid) {
    const box = $('perm-' + uid);
    if (!box) return;
    const u = (A.users || []).find((x) => x.id === uid);
    if (!u) return;
    const scopeEl = box.querySelector('input[name="perm-scope"]:checked');
    const scope = scopeEl ? scopeEl.value : 'own';
    const actions = {};
    ACTIONS.forEach((a) => {
      const c = box.querySelector('[data-act-chk="' + a + '"]');
      actions[a] = !!(c && c.checked);
    });
    const pages = {};
    PAGES.forEach((key) => {
      const c = box.querySelector('[data-page-chk="' + key + '"]');
      pages[key] = !!(c && c.checked);
    });
    const facEl = box.querySelector('[data-perm-fac]');
    const body = { action: u.pending ? 'approve' : 'update', id: uid, permissions: { scope, actions, pages } };
    if (facEl) body.faculty_id = facEl.value || null;
    const btn = box.querySelector('[data-perm-save]');
    if (btn) btn.disabled = true;
    DB.functions.invoke('manage-users', { body }).then(({ data, error }) => {
      if (error) return toast(t('t_role_change_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast(t('t_role_cannot_self'), 'error');
      if (data && data.error) return toast(t('t_fail', { msg: data.error }), 'error', 5000);
      toast(t(u.pending ? 't_acc_approved' : 't_acc_updated'), 'success');
      A.refreshAccounts();
    });
  }

  function pendingCard(u) {
    const initial = esc((u.full_name || u.email || '?').trim().charAt(0).toUpperCase());
    return (
      '<div class="account-row pending-row">' +
      '<div class="account-avatar pending-avatar">' + initial + '</div>' +
      '<div class="account-main">' +
      '<div class="account-name">' + esc(u.full_name || u.email) + ' <span class="pending-tag">🕓 ' + t('acc_pending_title') + '</span></div>' +
      '<div class="account-email" dir="ltr">' + esc(u.email) + '</div>' +
      '</div>' +
      '<div class="account-actions">' +
      '<button type="button" data-approve="' + u.id + '" class="btn btn-small btn-primary">✅ ' + t('btn_approve') + '</button>' +
      '<button type="button" data-reject="' + u.id + '" data-email="' + esc(u.email) + '" class="btn btn-small btn-danger">🗑️ ' + t('btn_reject') + '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function bindPendingControls(root) {
    root.querySelectorAll('[data-approve]').forEach((b) =>
      b.addEventListener('click', () => changeUserField(b.dataset.approve, { is_active: true, role: 'viewer' }))
    );
    root.querySelectorAll('[data-reject]').forEach((b) =>
      b.addEventListener('click', () => rejectUser(b.dataset.reject, b.dataset.email))
    );
  }

  const ACT_ICONS = { create: '📝', edit: '✏️', delete: '🗑️', open: '🔓', logs: '📊', accounts: '👥' };

  // شارات صغيرة: الصلاحيات الممنوحة فعليًا لهذا الحساب
  function permChips(u) {
    const acts = (u.permissions && u.permissions.actions) || {};
    const granted = ACTIONS.filter((a) => acts[a] === true);
    const scope = (u.permissions && u.permissions.scope) || 'none';
    const scopeChip = scope === 'all'
      ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 whitespace-nowrap">🌐 ' + t('scope_all') + '</span>'
      : scope === 'own'
        ? '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 whitespace-nowrap">📍 ' + t('scope_own') + '</span>'
        : '';
    const chips = granted.map((a) =>
      '<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">' + ACT_ICONS[a] + ' ' + t('act_' + a) + '</span>'
    ).join('');
    return '<div class="flex flex-wrap items-center gap-1 mt-1.5">' + scopeChip + (chips ||
      '<span class="text-[9px] text-slate-400">— ' + t('scope_none') + ' —</span>') + '</div>';
  }

  function roleOptions(u) {
    const opts = [
      ['super_admin', 'acc_role_super'],
      ['admin', 'acc_role_admin'],
      ['admin_rectora', 'acc_role_rectora'],
      ['faculty_admin', 'acc_role_fadmin'],
      ['opener', 'acc_role_open'],
      ['viewer', 'acc_role_viewer']
    ];
    let html = opts.map(([r, key]) =>
      '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + t(key) + '</option>'
    ).join('');
    if (!opts.some(([r]) => r === u.role)) {
      html = '<option value="" disabled selected>' + t(ROLE_LABELS[u.role] || 'badge_custom') + '</option>' + html;
    }
    return html;
  }

  function facultyOptions(u) {
    const opts = scopeFaculties();
    let html = '<option value=""' + (!u.faculty_id ? ' selected' : '') + '>🏛️ ' + t('fac_central_label') + '</option>';
    html += opts.map((f) =>
      '<option value="' + f.id + '"' + (u.faculty_id === f.id ? ' selected' : '') + '>' + (f.icon || '') + ' ' + esc(facName(f)) + '</option>'
    ).join('');
    return html;
  }

  function accountCard(u) {
    const active = u.is_active !== false;
    const badgeKey = ROLE_LABELS[u.role] || 'badge_custom';
    const badgeCls = ROLE_BADGE_CLS[u.role] || ROLE_BADGE_CLS.custom;
    const fac = u.faculty_id ? A.facultyById[u.faculty_id] : null;
    const initial = esc((u.full_name || u.email || '?').trim().charAt(0).toUpperCase());
    const canEdit = !u.is_you;
    const showFac = canEdit && A.scopeOf() === 'all';
    return (
      '<div class="account-item">' +
      '<div class="account-row' + (active ? '' : ' inactive-row') + '">' +
      '<div class="account-avatar">' + initial + '</div>' +
      '<div class="account-main">' +
      '<div class="account-name">' +
      esc(u.full_name || u.email) +
      (u.is_you ? ' <span class="you-tag">' + t('you_tag') + '</span>' : '') +
      (!active ? ' <span class="status-tag inactive">⛔ ' + t('st_inactive') + '</span>' : '') +
      '</div>' +
      '<div class="account-email" dir="ltr">' + esc(u.email) + '</div>' +
      '<div class="account-badges">' +
      '<span class="role-badge ' + badgeCls + '">' + t(badgeKey) + '</span>' +
      (fac ? facChip(fac) : '') +
      '</div>' +
      permChips(u) +
      '</div>' +
      (canEdit ? (
        '<div class="account-actions">' +
        '<select class="account-select" data-role="' + u.id + '" aria-label="role">' + roleOptions(u) + '</select>' +
        (showFac ? '<select class="account-select" data-fac="' + u.id + '" aria-label="faculty">' + facultyOptions(u) + '</select>' : '') +
        '<button type="button" data-edit="' + u.id + '" class="btn btn-small btn-secondary">📝 ' + t('btn_edit_acc') + '</button>' +
        '<button type="button" data-perm="' + u.id + '" class="btn btn-small btn-secondary">⚙️ ' + t('btn_perm') + '</button>' +
        '<button type="button" data-toggle="' + u.id + '" data-active="' + (active ? '1' : '0') + '" class="btn btn-small ' + (active ? 'btn-secondary' : 'btn-primary') + '">' +
        (active ? '⏸️ ' + t('btn_suspend') : '▶️ ' + t('btn_activate')) + '</button>' +
        '<button type="button" data-del="' + u.id + '" data-email="' + esc(u.email) + '" class="btn btn-small btn-danger">' + t('btn_delete_word') + '</button>' +
        '</div>'
      ) : '') +
      '</div>' +
      (canEdit ? '<div id="perm-' + u.id + '" class="perm-box hidden"></div>' : '') +
      '</div>'
    );
  }

  function bindAccountControls(root) {
    root.querySelectorAll('[data-role]').forEach((sel) =>
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        if (sel.value === 'admin' || sel.value === 'admin_rectora') {
          changeUserField(sel.dataset.role, { role: sel.value, permissions: PRESETS[sel.value] }, t('t_role_confirm', { label: t('acc_role_' + (sel.value === 'admin' ? 'admin' : 'rectora')) }));
        } else {
          changeUserField(sel.dataset.role, { role: sel.value }, t('t_role_confirm', { label: t('acc_role_' + (sel.value === 'super_admin' ? 'super' : sel.value === 'faculty_admin' ? 'fadmin' : sel.value === 'opener' ? 'open' : 'viewer')) }));
        }
      })
    );
    root.querySelectorAll('[data-fac]').forEach((sel) =>
      sel.addEventListener('change', () => {
        changeUserField(sel.dataset.fac, { faculty_id: sel.value || null });
      })
    );
    root.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = (A.users || []).find((x) => x.id === b.dataset.edit);
        if (u) openEditAccount(u);
      })
    );
    root.querySelectorAll('[data-perm]').forEach((b) =>
      b.addEventListener('click', () => {
        const uid = b.dataset.perm;
        const box = $('perm-' + uid);
        if (!box) return;
        const willOpen = box.classList.contains('hidden');
        box.classList.toggle('hidden', !willOpen);
        b.classList.toggle('btn-primary', willOpen);
        if (willOpen && !box.dataset.loaded) {
          const u = (A.users || []).find((x) => x.id === uid);
          if (u) {
            box.innerHTML = permEditorHtml(u);
            bindPermEditor(box);
            box.dataset.loaded = '1';
          }
        }
      })
    );
    root.querySelectorAll('[data-toggle]').forEach((b) =>
      b.addEventListener('click', () => toggleUser(b))
    );
    root.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', () => deleteAccount(b.dataset.del, b.dataset.email))
    );
  }

  // تحديث عام لحقل من حقول الحساب (حالة)
  function changeUserField(id, patch, confirmMsg) {
    if (confirmMsg && !confirm(confirmMsg)) { A.refreshAccounts(); return; }
    DB.functions.invoke('manage-users', { body: Object.assign({ action: 'update', id }, patch) }).then(({ data, error }) => {
      if (error) return toast(t('t_role_change_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast(t('t_role_cannot_self'), 'error');
      if (data && data.error) return toast(t('t_fail', { msg: data.error }), 'error', 5000);
      toast(t('t_acc_updated'), 'success');
      A.refreshAccounts();
    });
  }

  function toggleUser(b) {
    const active = b.dataset.active === '1';
    changeUserField(b.dataset.toggle, { is_active: !active },
      active ? t('t_suspend_confirm') : t('t_activate_confirm'));
  }

  function openEditAccount(u) {
    const idEl = $('ea-id');
    const nameEl = $('ea-name');
    const emailEl = $('ea-email');
    const passEl = $('ea-pass');
    const roleEl = $('ea-role');
    const facEl = $('ea-faculty');
    const facBox = $('ea-faculty-box');
    const activeEl = $('ea-active');
    if (!idEl || !nameEl || !emailEl || !passEl || !roleEl || !facEl || !activeEl) return;
    idEl.value = u.id;
    nameEl.value = u.full_name || '';
    emailEl.value = u.email || '';
    passEl.value = '';
    roleEl.innerHTML = roleOptions(u);
    facEl.innerHTML = facultyOptions(u);
    const canFac = A.scopeOf() === 'all';
    facEl.disabled = !canFac;
    if (facBox) facBox.classList.toggle('hidden', !canFac);
    activeEl.checked = u.is_active !== false;
    openModal('edit-account-modal');
  }

  function saveEditAccount() {
    const id = $('ea-id').value;
    const full_name = $('ea-name').value.trim();
    const email = $('ea-email').value.trim();
    const password = $('ea-pass').value;
    const role = $('ea-role').value;
    const active = $('ea-active').checked;
    if (!id) return;
    if (!full_name) return toast(t('t_fill'), 'error');
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) return toast(t('t_bad_email'), 'error');
    if (password && password.length < 8) return toast(t('acc_pass_short'), 'error');
    if (!role) return toast(t('t_fill'), 'error');
    const patch = { action: 'update', id, full_name, email, is_active: active, role };
    if (password) patch.password = password;
    if (A.scopeOf() === 'all') patch.faculty_id = $('ea-faculty').value || null;
    if (role === 'admin' || role === 'admin_rectora') patch.permissions = PRESETS[role];
    const btn = $('ea-save-btn');
    if (btn) btn.disabled = true;
    DB.functions.invoke('manage-users', { body: patch }).then(({ data, error }) => {
      if (btn) btn.disabled = false;
      if (error) return toast(t('t_role_change_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast(t('t_role_cannot_self'), 'error');
      if (data && data.error) return toast(t('t_fail', { msg: data.error }), 'error', 5000);
      closeModal('edit-account-modal');
      toast(t('t_acc_updated'), 'success');
      A.refreshAccounts();
    }).catch((err) => {
      if (btn) btn.disabled = false;
      toast(t('t_fail', { msg: err.message || err }), 'error', 5000);
    });
  }

  function rejectUser(id, email) {
    if (!confirm(t('t_reject_confirm', { email }))) return;
    DB.functions.invoke('manage-users', { body: { action: 'reject', id } }).then(({ data, error }) => {
      if (error) return toast(t('t_del_acc_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast(t('t_cannot_del_self'), 'error');
      if (data && data.error) return toast(t('t_fail', { msg: data.error }), 'error', 5000);
      toast(t('t_acc_rejected'), 'success');
      A.refreshAccounts();
    });
  }

  function deleteAccount(id, email) {
    if (!confirm(t('t_del_acc_confirm', { email }))) return;
    DB.functions.invoke('manage-users', { body: { action: 'delete', id } }).then(({ data, error }) => {
      if (error) return toast(t('t_del_acc_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_delete_self') return toast(t('t_cannot_del_self'), 'error');
      toast(t('t_acc_deleted'), 'success');
      A.refreshAccounts();
    });
  }

  /* ---------- تبديل اللغة: إعادة رسم قوائم الكليات والإحصائيات ---------- */

  document.addEventListener('langchange', () => {
    if (!A.me) return;
    populateFacultySelects();
    A.loadStats();
    if (A.users && A.users.length && A.can('accounts')) A.refreshAccounts();
  });

  /* ---------- ترقيم الصفحات ---------- */

  function pagerHtml(total, page, prefix) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return '';
    return (
      '<div class="flex items-center justify-center gap-3 mt-4 text-sm">' +
      '<button id="pager-' + prefix + '-prev" ' + (page <= 1 ? 'disabled' : '') + ' class="btn-secondary px-3 py-1.5">' + t('pg_prev') + '</button>' +
      '<span class="text-slate-500">' + t('pg_of', { p: page, n: pages, t: total }) + '</span>' +
      '<button id="pager-' + prefix + '-next" ' + (page >= pages ? 'disabled' : '') + ' class="btn-secondary px-3 py-1.5">' + t('pg_next') + '</button>' +
      '</div>'
    );
  }

  function bindPager() {
    const pm = $('pager-main-prev');
    const pn = $('pager-main-next');
    if (pm) pm.addEventListener('click', () => { A.page--; A.loadTenders(); });
    if (pn) pn.addEventListener('click', () => { A.page++; A.loadTenders(); });
    const dm = $('pager-dl-prev');
    const dn = $('pager-dl-next');
    if (dm) dm.addEventListener('click', () => { dlPage--; A.loadDownloads(); });
    if (dn) dn.addEventListener('click', () => { dlPage++; A.loadDownloads(); });
  }
})();
