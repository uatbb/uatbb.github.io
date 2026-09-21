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
  const kindLabel = (k) => (k === 'tender' ? 'طلب عروض' : 'استشارة');

  A.init = function () {
    bindCreate();
    bindStaticButtons();
    bindAccounts();
    const s = $('tender-search');
    if (s) s.addEventListener('input', debounce(() => { A.page = 1; A.loadTenders(); }, 300));
    A.page = 1;
    checkSchema();
    initRole().then(() => A.loadTenders());
  };

  // تحديد دور المستخدم: admin (كامل) | committee (لجنة عرض) | opener (لجنة فتح)
  async function initRole() {
    let role = 'admin';
    try {
      const { data: { user } } = await DB.auth.getUser();
      const r = user && user.user_metadata && user.user_metadata.role;
      if (r === 'committee' || r === 'opener') role = r;
    } catch (e) { /* الافتراض: كامل */ }
    A.role = role;
    if (role !== 'admin') applyRestrictedMode();
  }

  function applyRestrictedMode() {
    // تبويبا الإنشاء والحسابات للإداري فقط
    document.querySelectorAll('.nav-btn[data-tab="tab-create"], .nav-btn[data-tab="tab-accounts"]').forEach((b) => b.remove());
    const navGrid = document.querySelector('.bottom-nav > div');
    if (navGrid) navGrid.classList.replace('grid-cols-4', 'grid-cols-2');
    const badge = $('role-badge');
    if (badge) {
      badge.classList.remove('hidden');
      badge.textContent = A.role === 'opener' ? '🔓 لجنة فتح الأظرفة' : '👁️ لجنة — عرض فقط';
    }
    // لجنة الفتح تفتح على صفحة الفتح، ولجنة العرض على القائمة
    if (window.switchTo) window.switchTo(A.role === 'opener' ? 'tab-opening' : 'tab-tenders');
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
      if (!isAdmin()) return toast('الإنشاء متاح للإداري فقط', 'error');
      const ref = val('f-reference');
      const title = val('f-title');
      const duration = val('f-duration');
      const opening = val('f-opening');
      const file = $('f-file').files[0];
      const kindEl = document.querySelector('input[name="f-kind"]:checked');
      const kind = kindEl ? kindEl.value : 'consultation';

      if (!ref.trim() || !title.trim() || !opening || !file) return toast('أكمل جميع الحقول المطلوبة', 'error');
      if (file.type !== 'application/pdf') return toast('الملف يجب أن يكون PDF', 'error');
      if (file.size > 50 * 1024 * 1024) return toast('حجم الملف يتجاوز 50MB', 'error');

      // التحقق من أن الرقم غير مستخدم
      const dup = await DB.from('tenders').select('id').eq('reference', ref.trim()).maybeSingle();
      if (dup.data) return toast('⚠️ رقم الاستشارة "' + ref.trim() + '" موجود بالفعل — اختر رقمًا آخر', 'error', 5000);

      const btn = $('create-btn');
      setBusy(btn, true, '⏳ جارٍ الرفع والنشر...');
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
            throw new Error('فشل رفع الملف إلى Cloudflare R2');
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
            throw new Error(fin.data && fin.data.error || 'فشل النشر');
          }
        } else {
          // المسار 2: Supabase Storage (ملفات حتى 50MB فقط)
          if (file.size > 50 * 1024 * 1024) {
            throw new Error('خدمة R2 غير مفعلة — الملفات الأكبر من 50MB تتطلب إعداد R2');
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
        toast('✅ تم النشر — بطاقة QR جاهزة', 'success');
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
          toast('⚠️ رقم الاستشارة مستخدم بالفعل — اختر رقمًا آخر', 'error', 5000);
        } else if (msg.includes('column of') || msg.includes('schema cache')) {
          toast('⚠️ قاعدة البيانات غير محدثة — شغّل 006_full_update.sql في SQL Editor ثم أعد المحاولة', 'error', 8000);
          checkSchema();
        } else if (msg.includes('R2') || msg.includes('r2') || msg.includes('Cloudflare')) {
          toast('خدمة R2 غير مهيأة — أكمل إعداد R2 ثم أعد المحاولة', 'error', 7000);
        } else {
          toast('فشل: ' + msg, 'error', 6000);
        }
      } finally {
        setBusy(btn, false, '🚀 نشر وتوليد QR');
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
        list.innerHTML = emptyState('لا توجد استشارات أو طلبات عروض بعد', 'أنشئ أول استشارة من تبويب «إنشاء استشارة»');
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

  function tenderCard(t) {
    const dl = (t.downloads && t.downloads[0] && t.downloads[0].count) || 0;
    const isPub = t.status === 'published';
    return (
      '<div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">' +
      '<div class="flex items-start justify-between gap-3">' +
      '<div class="min-w-0">' +
      '<div class="font-bold text-slate-800 flex items-center gap-2 flex-wrap">' + esc(t.reference) +
      '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (t.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700') + '">' + kindLabel(t.kind) + '</span>' +
      '</div>' +
      '<div class="text-sm text-slate-600 mt-0.5">' + esc(t.title) + '</div>' +
      '</div>' +
      statusBadge(t.status) +
      '</div>' +
      '<div class="mt-3 grid grid-cols-2 gap-2 text-sm">' +
      '<div class="bg-slate-50 rounded-lg px-3 py-2">' +
      '<div class="text-xs text-slate-400">فتح الأظرفة</div>' +
      '<div class="text-slate-700">' + fmtDate(t.opening_date, true) + '</div>' +
      (t.opened_at ? '<div class="text-xs text-slate-400">فُتحت: ' + fmtDate(t.opened_at, true) + '</div>' : '') +
      '</div>' +
      '<div class="bg-slate-50 rounded-lg px-3 py-2">' +
      '<div class="text-xs text-slate-400">التحميلات</div>' +
      '<div class="text-slate-700 font-bold">' + dl + '</div>' +
      '</div>' +
      '</div>' +
      '<div class="mt-3 grid grid-cols-2 gap-2">' +
      '<button data-act="qr" data-id="' + t.id + '" class="w-full btn-secondary">🔳 بطاقة QR</button>' +
      '<button data-act="downloads" data-id="' + t.id + '" class="w-full btn-secondary">👥 من حمّل (' + dl + ')</button>' +
      (isPub && canOpen()
        ? '<button data-act="replace" data-id="' + t.id + '" class="w-full btn-secondary">📄 تغيير دفتر الشروط</button>' +
          '<button data-act="open" data-id="' + t.id + '" class="w-full btn-danger">🔓 فتح الأظرفة</button>'
        : '') +
      (isAdmin()
        ? '<button data-act="delete" data-id="' + t.id + '" class="w-full btn-secondary !text-red-600">🗑️ حذف الاستشارة</button>'
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
      if (error || !data) return toast('فشل جلب الاستشارة', 'error');
      if (btn.dataset.act === 'qr') A.showQR(data);
      else if (btn.dataset.act === 'downloads') A.showDownloads(data);
      else if (btn.dataset.act === 'open') askOpen(data);
      else if (btn.dataset.act === 'replace') askReplace(data);
      else if (btn.dataset.act === 'delete') askDelete(data);
    });
  });

  /* ---------- لجنة فتح الأظرفة ---------- */

  A.loadOpening = async function () {
    const list = $('opening-list');
    if (!list) return;
    list.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">⏳ جارٍ التحميل...</div>';
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

      const card = (t, isReady) => (
        '<div class="bg-white rounded-2xl shadow-sm border p-4 ' + (isReady ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200') + '">' +
        '<div class="flex items-start justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<div class="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">' + esc(t.reference) +
        '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + (t.kind === 'tender' ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700') + '">' + kindLabel(t.kind) + '</span>' +
        '</div>' +
        '<div class="text-sm text-slate-600 mt-0.5">' + esc(t.title) + '</div>' +
        '<div class="text-xs text-slate-400 mt-1">فتح الأظرفة: ' + fmtDate(t.opening_date, true) +
        (isReady ? ' — <b class="text-amber-700">حان الموعد</b>' : '') + '</div>' +
        '</div>' +
        '<div class="text-center shrink-0">' +
        '<div class="text-xl font-black text-slate-700">' + dl(t) + '</div>' +
        '<div class="text-[10px] text-slate-400">تحميل</div>' +
        '</div>' +
        '</div>' +
        '<div class="mt-3 grid grid-cols-2 gap-2">' +
        '<button data-act="downloads" data-id="' + t.id + '" class="w-full btn-secondary">👥 المتعاملون (' + dl(t) + ')</button>' +
        (isReady && canOpen()
          ? '<button data-act="open" data-id="' + t.id + '" class="w-full btn-danger">🔓 فتح الأظرفة</button>'
          : '<span class="btn-secondary w-full opacity-60 flex items-center justify-center">🔒 بانتظار الموعد</span>') +
        '</div>' +
        '</div>'
      );

      const openedRow = (t) => (
        '<div class="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">' +
        '<div class="min-w-0">' +
        '<div class="text-sm font-bold text-slate-700">' + esc(t.reference) + ' — ' + esc(t.title) + '</div>' +
        '<div class="text-xs text-slate-400 mt-0.5">فُتحت: ' + fmtDate(t.opened_at, true) +
        (t.opened_by ? ' • بواسطة: ' + esc(userName[t.opened_by] || 'غير معروف') : '') + '</div>' +
        '</div>' +
        '<button data-act="downloads" data-id="' + t.id + '" class="text-xs btn-secondary shrink-0">👥 ' + dl(t) + '</button>' +
        '</div>'
      );

      let html = '';
      if (ready.length) {
        html += '<div class="text-xs font-bold text-amber-700 mb-1">⏰ جاهزة للفتح الآن</div>' + ready.map((t) => card(t, true)).join('');
      }
      if (upcoming.length) {
        html += '<div class="text-xs font-bold text-slate-400 mt-4 mb-1">📅 قادمة</div>' + upcoming.map((t) => card(t, false)).join('');
      }
      if (opened.length) {
        html += '<div class="text-xs font-bold text-slate-400 mt-4 mb-1">✅ ما فُتح</div>' + opened.map(openedRow).join('');
      }
      if (!ready.length && !upcoming.length && !opened.length) {
        html = emptyState('لا توجد استشارات بعد', 'تظهر هنا الاستشارات المنشورة حسب موعد فتح الأظرفة');
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

    // رابط QR
    const configured = (window.TENDER_CONFIG || {}).PUBLIC_BASE_URL;
    const base = (configured || location.href.split('?')[0]).replace(/\/$/, '');
    const url = base + '?open=' + t.id;
    const qrUrl = $('qr-url');
    if (qrUrl) qrUrl.textContent = url;

    const canvas = $('qr-canvas');
    if (typeof window.QRCode === 'undefined') {
      toast('فشل تحميل مكتبة QR', 'error');
      return;
    }
    window.QRCode.toCanvas(canvas, url, { width: 220, margin: 2, errorCorrectionLevel: 'M' }, (err) => {
      if (err) {
        console.error(err);
        toast('فشل توليد QR', 'error');
        return;
      }
      openModal('qr-modal');
    });
  };

  /* ---------- سجل التحميلات ---------- */

  A.showDownloads = async function (t) {
    dlTender = t;
    dlPage = 1;
    $('dl-title').textContent = 'سجل التحميلات — ' + t.reference;
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
        box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm">لا توجد تحميلات بعد</div>';
        $('dl-pager').innerHTML = '';
        return;
      }
      box.innerHTML =
        '<table class="w-full text-sm">' +
        '<thead><tr class="text-slate-400 text-xs border-b border-slate-200">' +
        '<th class="py-2 text-right">المؤسسة</th><th class="py-2 text-right">الهاتف</th>' +
        '<th class="py-2 text-right">البريد</th><th class="py-2 text-right">IP</th><th class="py-2 text-right">الوقت</th>' +
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
        '</tbody></table>';
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
    if (error || !data) return toast('فشل التصدير', 'error');
    const head = ['company', 'phone', 'email', 'ip_address', 'downloaded_at'];
    const rows = data.map((d) => head.map((k) => csvCell(d[k])).join(','));
    const csv = '\uFEFF' + [head.join(','), ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'downloads_' + dlTender.reference + '.csv');
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replaceAll('"', '""') + '"' : v;
  }

  // تصدير سجل التحميلات كـ PDF (نسخة مطبوعة عربية — «حفظ كـ PDF» من مربع الطباعة)
  async function exportPdf() {
    if (!dlTender) return;
    const { data, error } = await DB.from('downloads')
      .select('*')
      .eq('tender_id', dlTender.id)
      .order('downloaded_at', { ascending: true });
    if (error) return toast('فشل التصدير', 'error');
    if (!data || !data.length) return toast('لا توجد سجلات للتصدير', 'error');
    const rows = data.map((d, i) =>
      '<tr><td>' + (i + 1) + '</td><td>' + esc(d.company) + '</td><td dir="ltr">' + esc(d.phone) + '</td>' +
      '<td dir="ltr">' + esc(d.email) + '</td><td dir="ltr">' + esc(d.ip_address || '—') + '</td>' +
      '<td>' + fmtDate(d.downloaded_at, true) + '</td></tr>'
    ).join('');
    const html =
      '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">' +
      '<title>سجل التحميلات — ' + esc(dlTender.reference) + '</title>' +
      '<style>' +
      'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;margin:24px;color:#1e293b}' +
      'h1{font-size:17px;margin:0 0 2px}' +
      '.sub{font-size:12px;color:#475569;margin:0 0 14px}' +
      'table{width:100%;border-collapse:collapse;font-size:11.5px}' +
      'th,td{border:1px solid #cbd5e1;padding:5px 8px;text-align:right}' +
      'th{background:#f0fdfa;color:#0f766e}' +
      '.foot{margin-top:18px;font-size:11px;color:#64748b;display:flex;justify-content:space-between}' +
      '@media print{body{margin:12px}}' +
      '</style></head><body>' +
      '<h1>جامعة عين تموشنت بلحاج بوشعيب — مكتب الصفقات</h1>' +
      '<p class="sub">سجل تحميل دفتر الشروط — ' + kindLabel(dlTender.kind) + ' عدد: ' + esc(dlTender.reference) + ' — ' + esc(dlTender.title) +
      ' &nbsp;|&nbsp; عدد السجلات: ' + data.length + ' &nbsp;|&nbsp; تاريخ الطباعة: ' + fmtDate(new Date().toISOString(), true) + '</p>' +
      '<table><thead><tr><th>#</th><th>المؤسسة</th><th>الهاتف</th><th>البريد</th><th>IP</th><th>آخر تحميل</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<div class="foot"><span>وثيقة داخلية — مكتب الصفقات</span><span>التوقيع: ........................</span></div>' +
      '<script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>' +
      '</body></html>';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return toast('سمِّح بالنوافذ المنبثقة ثم أعد المحاولة', 'error');
    w.document.write(html);
    w.document.close();
  }

  /* ---------- فتح الأظرفة ---------- */

  function askOpen(t) {
    openTender = t;
    $('open-tender-info').innerHTML =
      '<b>' + esc(t.reference) + '</b> — ' + esc(t.title) +
      '<br><span class="text-xs text-slate-400">فتح الأظرفة: ' + fmtDate(t.opening_date, true) + '</span>';
    $('open-ref-input').value = '';
    openModal('open-modal');
    setTimeout(() => $('open-ref-input').focus(), 100);
  }

  async function confirmOpen() {
    const t = openTender;
    if (!t) return;
    if (!canOpen()) return toast('الفتح متاح للإداري ولجنة فتح الأظرفة فقط', 'error');
    if (val('open-ref-input') !== t.reference) return toast('رقم الاستشارة غير مطابق', 'error');

    const btn = $('open-confirm-btn');
    setBusy(btn, true, '⏳ جارٍ تنفيذ الفتح...');
    try {
      const { data: { user } } = await DB.auth.getUser();

      const { data, error } = await DB.from('tenders')
        .update({ status: 'opened', opened_at: new Date().toISOString(), opened_by: user ? user.id : null })
        .eq('id', t.id)
        .eq('status', 'published')
        .select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('already_opened');

      if (t.pdf_path) {
        const { error: delErr } = await DB.storage.from('tenders').remove([t.pdf_path]);
        if (delErr) console.warn('تنبيه: الحالة تغيّرت لكن ملف التخزين:', delErr.message || delErr);
      }

      closeModal('open-modal');
      toast('✅ فُتحت الأظرفة وحُذف الملف نهائيًا', 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      const msg = String((err && err.message) || err);
      if (msg.includes('already_opened')) {
        toast('هذه الاستشارة فُتحت مسبقًا', 'error', 5000);
        A.refreshTenders();
      } else {
        toast('فشل: ' + msg, 'error', 6000);
      }
    } finally {
      setBusy(btn, false, '🔓 تأكيد الفتح والحذف النهائي');
    }
  }

  /* ---------- تغيير دفتر الشروط (نفس الـ QR) ---------- */

  function askReplace(t) {
    replaceTender = t;
    $('replace-tender-info').innerHTML =
      '<b>' + esc(t.reference) + '</b> — ' + esc(t.title) +
      '<br><span class="text-xs text-slate-400">يُحذف الملف الحالي ويُرفع الجديد. رمز QR يبقى نفسه.</span>';
    $('replace-file').value = '';
    $('replace-file-info').textContent = '';
    openModal('replace-modal');
  }

  async function confirmReplace() {
    const t = replaceTender;
    if (!t) return;
    if (!isAdmin()) return toast('تغيير الملف متاح للإداري فقط', 'error');
    const f = $('replace-file').files[0];
    if (!f) return toast('اختر ملف PDF الجديد', 'error');
    if (f.type !== 'application/pdf') return toast('الملف يجب أن يكون PDF', 'error');
    if (f.size > 50 * 1024 * 1024) return toast('حجم الملف يتجاوز 50MB', 'error');

    const btn = $('replace-confirm-btn');
    setBusy(btn, true, '⏳ جارٍ الاستبدال...');
    try {
      if (t.pdf_source === 'r2') {
        const prep = await DB.functions.invoke('tender-files', {
          body: { action: 'prepare-replace', tender_id: t.id },
        });
        if (prep.error) throw prep.error;
        if (!prep.data || !prep.data.upload_url) throw new Error('خدمة R2 غير مهيأة');
        const put = await fetch(prep.data.upload_url, { method: 'PUT', body: f });
        if (!put.ok) throw new Error('فشل رفع الملف');
      } else {
        // رفع الجديد في مسار فريد جديد + تحديث مسار الصف
        // (الـ QR يستخدم رقم الاستشارة فقط — فيبقى صالحًا بدون أي تغيير)
        const newPath = 'tenders/' + t.id + '-r' + Date.now() + '.pdf';

        // 1) رفع الملف الجديد (مسار جديد دائمًا → لا تعارض 409)
        const { error: upErr } = await DB.storage.from('tenders').upload(newPath, f, {
          contentType: 'application/pdf',
        });
        if (upErr) throw upErr;

        // 2) تحديث مسار الملف في صف الاستشارة
        const { error: rowErr } = await DB.from('tenders')
          .update({ pdf_path: newPath })
          .eq('id', t.id);
        if (rowErr) {
          await DB.storage.from('tenders').remove([newPath]);
          throw rowErr;
        }

        // 3) حذف الملف القديم (بجهد — إن فشل يبقى غير قابل للوصول)
        if (t.pdf_path && t.pdf_path !== newPath) {
          const { error: rmErr } = await DB.storage.from('tenders').remove([t.pdf_path]);
          if (rmErr) console.warn('تنبيه: بقي الملف القديم:', rmErr.message || rmErr);
        }
      }
      closeModal('replace-modal');
      toast('✅ تم استبدال الملف — رمز QR نفسه صالح', 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      toast('فشل: ' + ((err && err.message) || err), 'error', 6000);
    } finally {
      setBusy(btn, false, '📤 استبدال الملف');
    }
  }

  /* ---------- حذف الاستشارة ---------- */

  function askDelete(t) {
    deleteTender = t;
    $('delete-tender-info').innerHTML =
      '<b>' + esc(t.reference) + '</b> — ' + esc(t.title) +
      '<br><span class="text-xs text-slate-400">' +
      (t.status === 'published' ? 'الاستشارة منشورة — سيُحذف الملف وكل سجل التحميلات.' : 'فُتحت مسبقًا — سيُحذف كل شيء (الملف محذوف أصلًا).') +
      '</span>';
    $('delete-ref-input').value = '';
    openModal('delete-modal');
    setTimeout(() => $('delete-ref-input').focus(), 100);
  }

  async function confirmDelete() {
    const t = deleteTender;
    if (!t) return;
    if (!isAdmin()) return toast('الحذف متاح للإداري فقط', 'error');
    if (val('delete-ref-input') !== t.reference) return toast('رقم الاستشارة غير مطابق', 'error');

    const btn = $('delete-confirm-btn');
    setBusy(btn, true, '⏳ جارٍ الحذف...');
    try {
      if (t.pdf_source === 'r2') {
        const { data, error } = await DB.functions.invoke('tender-files', {
          body: { action: 'delete-tender', tender_id: t.id },
        });
        if (error) throw error;
        if (!data || !data.ok) throw new Error((data && data.error) || 'فشل الحذف');
      } else {
        // 1) حذف الصف من قاعدة البيانات (مع التحقق الفعلي من التنفيذ)
        const { data: delRows, error } = await DB.from('tenders').delete().eq('id', t.id).select('id');
        if (error) throw error;
        if (!delRows || !delRows.length) {
          throw new Error('لم ينفذ الحذف — شغّل ملف التحديث 006_full_update.sql في SQL Editor (السماح بالحذف)');
        }
        // 2) حذف الملف من التخزين (إن وُجد)
        if (t.pdf_path) {
          const { error: rmErr } = await DB.storage.from('tenders').remove([t.pdf_path]);
          if (rmErr) console.warn('تنبيه: حُذفت الاستشارة لكن الملف:', rmErr.message || rmErr);
        }
      }
      closeModal('delete-modal');
      toast('✅ حُذفت الاستشارة نهائيًا', 'success', 5000);
      A.refreshTenders();
    } catch (err) {
      console.error(err);
      toast('فشل: ' + ((err && err.message) || err), 'error', 6000);
    } finally {
      setBusy(btn, false, '🗑️ تأكيد الحذف النهائي');
    }
  }

  /* ---------- إدارة الحسابات ---------- */

  function bindAccounts() {
    const form = $('account-form');
    if (!form) return;
    if (!isAdmin()) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) return toast('إدارة الحسابات متاحة للإداري فقط', 'error');
      const full_name = $('a-name').value.trim();
      const email = $('a-email').value.trim();
      const password = $('a-pass').value;
      const roleEl = document.querySelector('input[name="a-role"]:checked');
      const role = roleEl ? roleEl.value : 'admin';
      if (!full_name || !email || !password) return toast('أكمل جميع الحقول', 'error');
      if (password.length < 8) return toast('كلمة المرور: 8 أحرف على الأقل', 'error');
      const btn = form.querySelector('button[type=submit]');
      setBusy(btn, true, '⏳ جارٍ الإضافة...');
      try {
        const { data, error } = await DB.functions.invoke('manage-users', {
          body: { action: 'create', full_name, email, password, role },
        });
        if (error) throw error;
        if (!data || data.error) {
          const msg =
            data.error === 'weak_password' ? 'كلمة المرور: 8 أحرف على الأقل'
            : data.error === 'bad_email' ? 'بريد إلكتروني غير صالح'
            : data.error;
          throw new Error(msg);
        }
        toast('✅ تمت إضافة الحساب — يمكنه الدخول فورًا', 'success');
        form.reset();
        A.refreshAccounts();
      } catch (err) {
        console.error(err);
        toast('فشل: ' + ((err && err.message) || err), 'error', 5000);
      } finally {
        setBusy(btn, false, '➕ إضافة الحساب');
      }
    });
  }

  A.refreshAccounts = async function () {
    const list = $('accounts-list');
    if (!list) return;
    list.innerHTML = '<div class="text-center text-slate-400 text-sm py-6">⏳ جارٍ التحميل...</div>';
    try {
      const { data, error } = await DB.functions.invoke('manage-users', { body: { action: 'list' } });
      if (error) throw error;
      if (!data || !data.users) throw new Error((data && data.error) || 'فشل الجلب');
      if (!data.users.length) {
        list.innerHTML = emptyState('لا توجد حسابات', '');
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
      admin: '<span class="text-[10px] font-bold bg-teal-50 text-teal-700 rounded px-1.5 py-0.5">كامل</span>',
      committee: '<span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">لجنة عرض</span>',
      opener: '<span class="text-[10px] font-bold bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">لجنة فتح</span>',
    }[r];
    const roleSelect = !isAdmin() ? '' : (
      '<select data-role-select="' + u.id + '" ' + (u.is_you ? 'disabled title="لا يمكنك تغيير دورك الحالي"' : '') +
      ' class="text-[11px] border border-slate-200 rounded-lg px-1.5 py-1 bg-white">' +
      '<option value="admin"' + (r === 'admin' ? ' selected' : '') + '>صلاحيات كاملة</option>' +
      '<option value="committee"' + (r === 'committee' ? ' selected' : '') + '>لجنة — عرض فقط</option>' +
      '<option value="opener"' + (r === 'opener' ? ' selected' : '') + '>لجنة فتح الأظرفة</option>' +
      '</select>'
    );
    return (
      '<div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-2">' +
      '<div class="min-w-0">' +
      '<div class="font-bold text-sm text-slate-800 flex items-center gap-1.5 flex-wrap">' + esc(u.full_name || u.email) +
      roleBadge +
      (u.is_you ? ' <span class="text-[10px] text-teal-600 font-bold">(أنت)</span>' : '') + '</div>' +
      '<div class="text-xs text-slate-400" dir="ltr">' + esc(u.email) + '</div>' +
      '<div class="text-[10px] text-slate-400 mt-0.5">أُنشئ في ' + fmtDate(u.created_at) + '</div>' +
      '</div>' +
      (u.is_you
        ? ''
        : '<div class="flex flex-col items-end gap-1.5">' +
          roleSelect +
          '<button data-del="' + u.id + '" data-email="' + esc(u.email) + '" class="text-xs text-red-600 font-bold hover:bg-red-50 rounded-lg px-3 py-1 whitespace-nowrap">حذف</button>' +
          '</div>') +
      '</div>'
    );
  }

  function changeRole(id, role, sel) {
    const label = role === 'opener' ? 'لجنة فتح الأظرفة' : role === 'committee' ? 'لجنة — عرض فقط' : 'صلاحيات كاملة';
    if (!confirm('تغيير دور الحساب إلى «' + label + '»؟')) {
      A.refreshAccounts();
      return;
    }
    DB.functions.invoke('manage-users', { body: { action: 'update', id, role } }).then(({ data, error }) => {
      if (error) return toast('فشل التغيير: ' + (error.message || error), 'error', 5000);
      if (data && data.error === 'cannot_change_self') return toast('لا يمكنك تغيير دورك الحالي', 'error');
      toast('✅ تم تغيير الدور', 'success');
      A.refreshAccounts();
    });
  }

  function deleteAccount(id, email) {
    if (!confirm('حذف الحساب "' + email + '"؟ سيفقد تسجيله فورًا ولا يمكن التراجع.')) return;
    DB.functions.invoke('manage-users', { body: { action: 'delete', id } }).then(({ data, error }) => {
      if (error) return toast('فشل الحذف: ' + (error.message || error), 'error', 5000);
      if (data && data.error === 'cannot_delete_self') return toast('لا يمكنك حذف حسابك الحالي', 'error');
      toast('✅ حُذف الحساب', 'success');
      A.refreshAccounts();
    });
  }

  /* ---------- ترقيم الصفحات ---------- */

  function pagerHtml(total, page, prefix) {
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) return '';
    return (
      '<div class="flex items-center justify-center gap-3 mt-4 text-sm">' +
      '<button id="pager-' + prefix + '-prev" ' + (page <= 1 ? 'disabled' : '') + ' class="btn-secondary px-3 py-1.5">السابق</button>' +
      '<span class="text-slate-500">صفحة ' + page + ' من ' + pages + ' (' + total + ')</span>' +
      '<button id="pager-' + prefix + '-next" ' + (page >= pages ? 'disabled' : '') + ' class="btn-secondary px-3 py-1.5">التالي</button>' +
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
