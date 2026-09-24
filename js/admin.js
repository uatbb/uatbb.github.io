/* ===== لوحة المدير: إنشاء + قائمة + QR + سجل التحميلات + فتح الأظرفة + تغيير + حذف ===== */
(function () {
  const PAGE_SIZE = 20;
  const A = (window.Admin = {});
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

  A.init = function () {
    bindCreate();
    bindStaticButtons();
    bindAccounts();
    bindReminderClose();
    const s = $('tender-search');
    if (s) s.addEventListener('input', debounce(() => { A.page = 1; A.loadTenders(); }, 300));
    A.page = 1;
    checkSchema();
    initRole().then(async () => { await autoOpenDue(); A.loadTenders(); A.checkOpeningReminder(); });
  };

  /* ---------- تذكير بمواعيد الفتح (اليوم / غدًا) ---------- */

  let reminderData = [];
  let reminderTimer = null;
  let reminderOpen = false;

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
    const tmr = new Date(now.getTime() + 86400000);
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    const p = (n) => String(n).padStart(2, '0');
    const lang = (window.I18N && I18N.lang) || 'ar';
    const days = DAY_NAMES[lang] || DAY_NAMES.ar;
    const items = [];
    (reminderData || []).forEach((r) => {
      const d = new Date(r.opening_date);
      if (isNaN(d)) return;
      const isToday = sameDay(d, now);
      const isTmr = !isToday && sameDay(d, tmr);
      const when = isToday ? t('rm_today') : isTmr ? t('rm_tomorrow') : (days[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1));
      items.push({ d, isToday, isTmr, when, r });
    });

    // شارة العدد على الجرس
    if (!items.length) {
      badge.classList.add('hidden');
      badge.classList.remove('flex');
      if (ico) ico.classList.remove('animate-pulse');
      return;
    }
    badge.textContent = items.length;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
    if (ico) ico.classList.toggle('animate-pulse', items.some((i) => i.isToday));

    // محتوى اللوحة (تُحدَّث فقط وهي مفتوحة)
    if (!reminderOpen) return;
    const trunc = (s) => (s && s.length > 60 ? s.slice(0, 60) + '…' : s);
    const rowHtml = (i) =>
      '<div class="px-4 py-3 flex items-start gap-2.5 ' +
      (i.isToday ? 'bg-amber-50' : i.isTmr ? 'bg-sky-50/70' : '') + '">' +
      '<span class="mt-0.5 text-base">' + (i.isToday ? '🔴' : i.isTmr ? '🔵' : '⚪') + '</span>' +
      '<div class="min-w-0">' +
      '<div class="text-sm font-bold text-slate-800" dir="auto">' + esc(i.r.reference) + '</div>' +
      (i.r.title ? '<div class="text-xs text-slate-500 leading-snug">' + esc(trunc(i.r.title)) + '</div>' : '') +
      '<div class="text-[11px] font-semibold mt-1 ' + (i.isToday ? 'text-amber-700' : i.isTmr ? 'text-sky-700' : 'text-slate-400') + '">' +
      esc(i.when) + ' — ' + t('rm_open_word') + ' <span class="tabular-nums">(' + p(i.d.getHours()) + ':' + p(i.d.getMinutes()) + ')</span></div>' +
      '</div>' +
      '</div>';
    panel.innerHTML =
      '<div class="px-4 py-3 bg-gradient-to-l from-amber-50 via-white to-white border-b border-amber-100 flex items-center gap-2">' +
      '<span class="text-lg">🔔</span>' +
      '<span class="text-sm font-black text-slate-800">' + t('rm_title') + '</span>' +
      '<span class="text-[11px] font-black text-white bg-amber-500 rounded-full h-5 min-w-[20px] px-1.5 flex items-center justify-center">' + items.length + '</span>' +
      '</div>' +
      (items.length
        ? '<div class="max-h-[55vh] overflow-y-auto divide-y divide-slate-100">' + items.map(rowHtml).join('') + '</div>'
        : '<div class="py-10 text-center text-sm text-slate-400">' + t('rm_empty') + '</div>') +
      '<div class="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-100 text-center">🔄 ' + t('rm_auto') + '</div>';
  }

  A.toggleReminder = function () {
    reminderOpen = !reminderOpen;
    const panel = $('remind-panel');
    if (!panel) return;
    if (reminderOpen) {
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

  // تحديد دور المستخدم: admin (كامل) | committee (لجنة عرض) | opener (لجنة فتح)
  async function initRole() {
    restoreNav();
    let role = 'admin';
    try {
      const { data: { user } } = await DB.auth.getUser();
      // الدور من app_metadata (لا يكتبه المستخدم) — user_metadata احتياط انتقالي
      const r = user && ((user.app_metadata && user.app_metadata.role) || (user.user_metadata && user.user_metadata.role));
      if (r === 'committee' || r === 'opener') role = r;
    } catch (e) { /* الافتراض: كامل */ }
    A.role = role;
    if (role !== 'admin') applyRestrictedMode();
  }

  function applyRestrictedMode() {
    // تبويبا الإنشاء والحسابات للإداري فقط (إخفاء — لا حذف، لتبقى قابلة للاستعادة)
    document.querySelectorAll('.nav-btn[data-tab="tab-create"], .nav-btn[data-tab="tab-accounts"]').forEach((b) => b.classList.add('hidden'));
    // لجنة الفتح: تبويب الفتح فقط (تُخفى قائمة الاستشارات أيضًا)
    if (A.role === 'opener') {
      document.querySelectorAll('.nav-btn[data-tab="tab-tenders"]').forEach((b) => b.classList.add('hidden'));
    }
    const navGrid = document.querySelector('.bottom-nav > div');
    if (navGrid) {
      navGrid.classList.remove('grid-cols-4', 'grid-cols-1', 'grid-cols-2');
      navGrid.classList.add(A.role === 'opener' ? 'grid-cols-1' : 'grid-cols-2');
    }
    const badge = $('role-badge');
    if (badge) {
      badge.classList.remove('hidden');
      badge.textContent = A.role === 'opener' ? t('role_opener_badge') : t('role_committee_badge');
    }
    // لجنة الفتح تفتح على صفحة الفتح، ولجنة العرض على القائمة
    if (window.switchTo) window.switchTo(A.role === 'opener' ? 'tab-opening' : 'tab-tenders');
  }

  // إعادة ترجمة شارة الدور عند تبديل اللغة
  A.updateRoleBadge = function () {
    const badge = $('role-badge');
    if (!badge) return;
    if (A.role && A.role !== 'admin') {
      badge.textContent = A.role === 'opener' ? t('role_opener_badge') : t('role_committee_badge');
    }
  };

  /* ---------- فتح تلقائي من اللوحة: كل منشورة حلّ موعدها تُفتح
     ويُحذف ملفها (ضمان إضافي بجانب مهمة pg_cron) ---------- */
  async function autoOpenDue() {
    if (A.role === 'committee') return;
    let rows = [];
    try {
      const { data, error } = await DB.from('tenders')
        .select('id, reference, pdf_path')
        .eq('status', 'published')
        .lte('opening_date', new Date().toISOString());
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

  function isAdmin() { return A.role !== 'committee' && A.role !== 'opener'; }
  function canOpen() { return isAdmin() || A.role === 'opener'; }
  function isCommittee() { return A.role === 'committee'; }

  // التحقق من أن قاعدة البيانات محدثة (الأعمدة الجديدة موجودة)
  async function checkSchema() {
    const banner = $('schema-banner');
    if (!banner) return;
    try {
      const { error } = await DB.from('tenders').select('id, kind, pdf_source').limit(1);
      if (error) banner.classList.remove('hidden');
    } catch (e) {
      banner.classList.remove('hidden');
    }
  }

  A.refreshTenders = function () {
    A.loadTenders();
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  /* ---------- إنشاء استشارة ---------- */

  function bindCreate() {
    const form = $('create-form');
    if (!form) return;
    if (!isAdmin()) return;

    $('f-file').addEventListener('change', (e) => {
      const f = e.target.files[0];
      $('file-info').textContent = f ? f.name + ' — ' + (f.size / 1024 / 1024).toFixed(2) + ' MB' : '';
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return toast(t('t_admin_only_create'), 'error');
      const ref = val('f-reference');
      const title = val('f-title');
      const duration = val('f-duration');
      const opening = val('f-opening');
      const file = $('f-file').files[0];
      const kindEl = document.querySelector('input[name="f-kind"]:checked');
      const kind = kindEl ? kindEl.value : 'consultation';

      if (!ref.trim() || !title.trim() || !opening || !file) return toast(t('t_fill_all'), 'error');
      if (file.type !== 'application/pdf') return toast(t('t_pdf_only'), 'error');
      if (file.size > 50 * 1024 * 1024) return toast(t('t_too_big'), 'error');
      if (ref.trim().length > 50) return toast(t('t_ref_long'), 'error');
      if (title.trim().length > 200) return toast(t('t_title_long'), 'error');
      if (duration.length > 100) return toast(t('t_duration_long'), 'error');
      if (isNaN(new Date(opening).getTime())) return toast(t('t_bad_date'), 'error');

      // التحقق من أن الرقم غير مستخدم
      const dup = await DB.from('tenders').select('id').eq('reference', ref.trim()).maybeSingle();
      if (dup.data) return toast(t('t_dup_ref', { ref: ref.trim() }), 'error', 5000);

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
              reference: ref.trim(),
              title: title.trim(),
              duration: duration.trim(),
              opening_date: new Date(opening).toISOString(),
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
            reference: ref.trim(),
            title: title.trim(),
            duration: duration.trim() || null,
            opening_date: new Date(opening).toISOString(),
            pdf_path: pdfPath,
            pdf_source: 'supabase',
            status: 'published',
          });
          if (insErr) throw insErr;
        }

        form.reset();
        $('file-info').textContent = '';
        toast(t('t_published'), 'success');
        A.page = 1;
        await A.loadTenders();
        window.switchTo('tab-tenders');
        A.showQR({
          id: tenderId,
          kind,
          reference: ref.trim(),
          title: title.trim(),
          duration: duration.trim() || null,
          opening_date: new Date(opening).toISOString(),
        });
      } catch (err) {
        console.error(err);
        const msg = String((err && err.message) || err);
        if (msg.includes('duplicate')) {
          toast(t('t_dup2'), 'error', 5000);
        } else if (msg.includes('column of') || msg.includes('schema cache')) {
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
  }

  /* ---------- قائمة الاستشارات ---------- */

  A.loadTenders = async function () {
    const list = $('tenders-list');
    const pager = $('tenders-pager');
    try {
      const term = (val('tender-search') || '').trim().replace(/[(),]/g, '');
      let q = DB.from('tenders').select('*, downloads(count)', { count: 'exact' });
      if (term) q = q.or('reference.ilike.%' + term + '%,title.ilike.%' + term + '%');
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

  function tenderCard(tt) {
    const dl = (tt.downloads && tt.downloads[0] && tt.downloads[0].count) || 0;
    const isPub = tt.status === 'published';
    return (
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">' +
      '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
      '<div class="font-bold text-slate-800 flex items-center gap-2 flex-wrap">' + esc(tt.reference) +
      '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (tt.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700') + '">' + kindLabel(tt.kind) + '</span>' +
      '</div>' +
      '<div class="text-sm text-slate-600 mt-0.5">' + esc(tt.title) + '</div>' +
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
       '<button data-act="downloads" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_downloaders', { n: dl }) + '</button>' +
       (isPub ? '<button data-act="direct" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_direct_dl') + '</button>' : '') +
      (isPub && canOpen()
        ? '<button data-act="replace" data-id="' + tt.id + '" class="w-full btn-secondary">' + t('btn_replace') + '</button>' +
          (new Date(tt.opening_date).getTime() <= Date.now()
            ? '<button data-act="open" data-id="' + tt.id + '" class="w-full btn-danger">' + t('btn_open') + '</button>'
            : '<span class="btn-secondary w-full opacity-60 flex items-center justify-center" title="' + t('t_open_early', { d: fmtDate(tt.opening_date, true) }) + '">' + t('btn_open_locked') + '</span>')
        : '') +
      (isAdmin()
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
    if (btn.dataset.act === 'open' && !canOpen()) return;
    if ((btn.dataset.act === 'replace' || btn.dataset.act === 'delete') && !isAdmin()) return;
    DB.from('tenders').select('*').eq('id', btn.dataset.id).maybeSingle().then(({ data, error }) => {
      if (error || !data) return toast(t('t_fetch_fail'), 'error');
      if (btn.dataset.act === 'qr') A.showQR(data);
      else if (btn.dataset.act === 'downloads') A.showDownloads(data);
      else if (btn.dataset.act === 'direct') directDownload(data);
      else if (btn.dataset.act === 'open') askOpen(data);
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
        DB.from('tenders').select('*, downloads(count)').order('opening_date', { ascending: true }),
        DB.functions.invoke('manage-users', { body: { action: 'list' } }),
      ]);
      const { data, error } = tRes;
      if (error) throw error;

      const userName = {};
      const users = (uRes.data && uRes.data.users) || [];
      users.forEach((u) => { userName[u.id] = u.full_name || u.email; });

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
        '<div class="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">' + esc(tt.reference) +
        '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (tt.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700') + '">' + kindLabel(tt.kind) + '</span>' +
        '</div>' +
        '<div class="text-sm text-slate-600 mt-0.5">' + esc(tt.title) + '</div>' +
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
        (isReady && canOpen()
          ? '<button data-act="open" data-id="' + tt.id + '" class="w-full btn-danger">' + t('btn_open') + '</button>'
          : '<span class="btn-secondary w-full opacity-60 flex items-center justify-center">' + t('op_btn_wait') + '</span>') +
        '</div>' +
        '</div>'
      );

      const openedRow = (tt) => (
        '<div class="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<div class="text-sm font-bold text-slate-700">' + esc(tt.reference) + ' — ' + esc(tt.title) + '</div>' +
        '<div class="text-xs text-slate-400 mt-0.5">' + t('op_opened_at', { d: fmtDate(tt.opened_at, true) }) +
        (tt.opened_by ? t('op_by', { n: esc(userName[tt.opened_by] || t('op_unknown')) }) : '') + '</div>' +
        '</div>' +
        '<button data-act="downloads" data-id="' + tt.id + '" class="text-xs btn-secondary shrink-0">👥 ' + dl(tt) + '</button>' +
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

  A.showQR = function (t) {
    $('qr-kind').textContent = kindLabel(t.kind);
    $('qr-reference').textContent = t.reference;
    $('qr-title').textContent = t.title;
    $('qr-duration').textContent = t.duration || '—';
    $('qr-opening').textContent = fmtDate(t.opening_date, true);

    // رابط QR: رمز قصير من أرقام المرجع (01/2026 → ?c=012026) — وUUID كامل احتياطًا
    const configured = (window.TENDER_CONFIG || {}).PUBLIC_BASE_URL;
    const base = (configured || location.href.split('?')[0]).replace(/\/$/, '');
    const code = (t.reference || '').replace(/\D/g, '');
    const url = code ? base + '?c=' + code : base + '?open=' + t.id;
    const qrUrl = $('qr-url');
    if (qrUrl) qrUrl.textContent = url;

    const canvas = $('qr-canvas');
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
    $('dl-title').textContent = t('dl_title', { ref: tt.reference });
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
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'downloads_' + dlTender.reference + '.csv');
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
      '<title>' + t('pdf_doc_title', { ref: esc(dlTender.reference) }) + '</title>' +
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
      '<p class="sub">' + t('pdf_sub', { kind: kindLabel(dlTender.kind), ref: esc(dlTender.reference), title: esc(dlTender.title), n: data.length, d: fmtDate(new Date().toISOString(), true) }) + '</p>' +
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
      '<b>' + esc(tt.reference) + '</b> — ' + esc(tt.title) +
      '<br><span class="text-xs text-slate-400">' + t('op_time', { d: fmtDate(tt.opening_date, true) }) + '</span>';
    $('open-ref-input').value = '';
    openModal('open-modal');
    setTimeout(() => $('open-ref-input').focus(), 100);
  }

  async function confirmOpen() {
    const tt = openTender;
    if (!tt) return;
    if (!canOpen()) return toast(t('t_open_perm'), 'error');
    if (new Date(tt.opening_date).getTime() > Date.now()) {
      return toast(t('t_open_early', { d: fmtDate(tt.opening_date, true) }), 'error', 6000);
    }
    if (val('open-ref-input') !== tt.reference) return toast(t('t_ref_mismatch'), 'error');

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

  /* ---------- تغيير دفتر الشروط (نفس الـ QR) ---------- */

  function askReplace(tt) {
    replaceTender = tt;
    $('replace-tender-info').innerHTML =
      '<b>' + esc(tt.reference) + '</b> — ' + esc(tt.title) +
      '<br><span class="text-xs text-slate-400">' + t('rep_info_note') + '</span>';
    $('replace-file').value = '';
    $('replace-file-info').textContent = '';
    openModal('replace-modal');
  }

  async function confirmReplace() {
    const tt = replaceTender;
    if (!tt) return;
    if (!isAdmin()) return toast(t('t_replace_perm'), 'error');
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
      '<b>' + esc(tt.reference) + '</b> — ' + esc(tt.title) +
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
    if (!isAdmin()) return toast(t('t_delete_perm'), 'error');
    if (val('delete-ref-input') !== tt.reference) return toast(t('t_ref_mismatch'), 'error');

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

  function bindAccounts() {
    const form = $('account-form');
    if (!form) return;
    if (!isAdmin()) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return toast(t('t_acc_perm'), 'error');
      const full_name = $('a-name').value.trim();
      const email = $('a-email').value.trim();
      const password = $('a-pass').value;
      const roleEl = document.querySelector('input[name="a-role"]:checked');
      const role = roleEl ? roleEl.value : 'admin';
      if (!full_name || !email || !password) return toast(t('t_fill'), 'error');
      if (password.length < 8) return toast(t('t_pass_short'), 'error');
      const btn = form.querySelector('button[type=submit]');
      setBusy(btn, true, t('busy_add'));
      try {
        const { data, error } = await DB.functions.invoke('manage-users', {
          body: { action: 'create', full_name, email, password, role },
        });
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
        A.refreshAccounts();
      } catch (err) {
        console.error(err);
        toast(t('t_fail', { msg: (err && err.message) || err }), 'error', 5000);
      } finally {
        setBusy(btn, false, t('acc_add_btn'));
      }
    });
  }

  A.refreshAccounts = async function () {
    const list = $('accounts-list');
    if (!list) return;
    list.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">' + t('loading') + '</div>';
    try {
      const { data, error } = await DB.functions.invoke('manage-users', { body: { action: 'list' } });
      if (error) throw error;
      if (!data || !data.users) throw new Error((data && data.error) || t('t_fetch_users'));
      if (!data.users.length) {
        list.innerHTML = emptyState(t('empty_accounts_t'), '');
        return;
      }
      list.innerHTML = data.users.map(accountCard).join('');
      list.querySelectorAll('[data-del]').forEach((b) =>
        b.addEventListener('click', () => deleteAccount(b.dataset.del, b.dataset.email))
      );
      if (!isCommittee()) {
        list.querySelectorAll('[data-role-select]').forEach((sel) =>
          sel.addEventListener('change', () => changeRole(sel.dataset.roleSelect, sel.value, sel))
        );
      }
    } catch (err) {
      console.error(err);
      list.innerHTML = errorState(err);
    }
  };

  function accountCard(u) {
    const r = u.role === 'opener' ? 'opener' : u.role === 'committee' ? 'committee' : 'admin';
    const roleBadge = {
      admin: '<span class="text-[10px] font-bold bg-teal-50 text-teal-700 rounded px-1.5 py-0.5">' + t('badge_full') + '</span>',
      committee: '<span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">' + t('badge_view') + '</span>',
      opener: '<span class="text-[10px] font-bold bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">' + t('badge_open') + '</span>',
    }[r];
    const roleSelect = !isAdmin() ? '' : (
      '<select data-role-select="' + u.id + '" ' + (u.is_you ? 'disabled title="' + t('cant_change_self') + '"' : '') +
      ' class="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white">' +
      '<option value="admin"' + (r === 'admin' ? ' selected' : '') + '>' + t('sel_full') + '</option>' +
      '<option value="committee"' + (r === 'committee' ? ' selected' : '') + '>' + t('sel_view') + '</option>' +
      '<option value="opener"' + (r === 'opener' ? ' selected' : '') + '>' + t('sel_open') + '</option>' +
      '</select>'
    );
    return (
      '<div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">' +
      '<div class="min-w-0">' +
      '<div class="font-bold text-sm text-slate-800 flex items-center gap-1.5 flex-wrap">' + esc(u.full_name || u.email) +
      roleBadge +
      (u.is_you ? ' <span class="text-[10px] text-teal-600 font-bold">' + t('you_tag') + '</span>' : '') + '</div>' +
      '<div class="text-xs text-slate-400" dir="ltr">' + esc(u.email) + '</div>' +
      '<div class="text-[10px] text-slate-400 mt-0.5">' + t('created_in', { d: fmtDate(u.created_at) }) + '</div>' +
      '</div>' +
      (u.is_you
        ? ''
        : '<div class="flex flex-col items-end gap-1.5">' +
          roleSelect +
          '<button data-del="' + u.id + '" data-email="' + esc(u.email) + '" class="text-xs text-red-600 font-bold hover:bg-red-50 rounded-lg px-3 py-1 whitespace-nowrap">' + t('btn_delete_word') + '</button>' +
          '</div>') +
      '</div>'
    );
  }

  function changeRole(id, role, sel) {
    const label = role === 'opener' ? t('sel_open') : role === 'committee' ? t('sel_view') : t('sel_full');
    if (!confirm(t('t_role_confirm', { label }))) {
      A.refreshAccounts();
      return;
    }
    DB.functions.invoke('manage-users', { body: { action: 'update', id, role } }).then(({ data, error }) => {
      if (error) return toast(t('t_role_change_fail', { msg: error.message || error }), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast(t('t_role_cannot_self'), 'error');
      toast(t('t_role_changed'), 'success');
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
