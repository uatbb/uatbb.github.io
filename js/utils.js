/* ===== أدوات مشتركة ===== */
(function () {
  const AR_LOCALE = 'ar-DZ';

  window.esc = function (v) {
    return String(v == null ? '' : v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;')
      .replaceAll('`', '&#96;');
  };

  // منطقة زمنية رسمية ثابتة (موقع الجامعة) — حتى يظهر وقت فتح الأظرفة
  // نفسه على أي جهاز (هاتف/حاسوب) مهما كانت إعدادات منطقة زمنيته
  const OFFICE_TZ = 'Africa/Algiers';

  window.fmtDate = function (iso, withTime) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    if (window.I18N && I18N.lang === 'fr') {
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: OFFICE_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(d);
      const g = (type) => { const e = parts.find((x) => x.type === type); return e ? e.value : '00'; };
      const p = (n) => String(n).padStart(2, '0');
      const base = p(g('day')) + '/' + p(g('month')) + '/' + g('year');
      return withTime ? base + ' ' + p(g('hour')) + ':' + p(g('minute')) : base;
    }
    return new Intl.DateTimeFormat(AR_LOCALE, {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {}),
      timeZone: OFFICE_TZ,
    }).format(d);
  };

  // أجزاء التاريخ/الوقت بمنطقة المكتب الثابتة (الجزائر) — لا تتأثر بمنطقة زمنية الجهاز
  const WD_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function officeParts(v) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: OFFICE_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
      hourCycle: 'h23',
    }).formatToParts(v);
    const g = (ty) => { const e = parts.find((x) => x.type === ty); return e ? e.value : ''; };
    const wd = g('weekday');
    return { y: g('year'), mo: g('month'), da: g('day'), h: g('hour'), mi: g('minute'), wd: WD_IDX[wd] != null ? WD_IDX[wd] : 0 };
  }

  // ISO → وقت جزائري (شكل YYYY-MM-DDTHH:MM) لحقول datetime-local
  window.isoToOfficeWall = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const o = officeParts(d);
    return o.y + '-' + o.mo + '-' + o.da + 'T' + o.h + ':' + o.mi;
  };

  // وقت جزائري (YYYY-MM-DDTHH:MM) → ISO — أي وقت كتبه الموظف يُفهم كتوقيت الجزائر
  window.officeWallToISO = function (wall) {
    if (!wall) return null;
    const asLocal = new Date(wall);
    if (isNaN(asLocal.getTime())) return null;
    const o = officeParts(asLocal);
    const asOffice = new Date(o.y + '-' + o.mo + '-' + o.da + 'T' + o.h + ':' + o.mi);
    const diff = asOffice.getTime() - asLocal.getTime();
    return new Date(asLocal.getTime() - diff).toISOString();
  };

  // أجزاء التاريخ/الوقت بتوقيت الجزائر لأي قيمة (ISO أو Date)
  window.officePartsDate = function (v) {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return null;
    return officeParts(d);
  };

  window.countdownMs = function (iso) {
    return new Date(iso).getTime() - Date.now();
  };

  window.fmtCountdown = function (ms) {
    if (ms <= 0) return (window.I18N ? I18N.t('cd_expired') : 'انتهى');
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const p = (n) => String(n).padStart(2, '0');
    const dayPart = d > 0 ? (window.I18N ? I18N.t('cd_day', { d }) : d + ' يوم ') : '';
    return dayPart + p(h) + ':' + p(m) + ':' + p(sec);
  };

  window.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  window.plain = function (v) { return String(v == null ? '' : v).replace(/ ?<i class=["']ico[^"']*["']><\/i>/g, ''); };
  window.toast = function (msg, type, ms) {
    type = type || 'info';
    ms = ms || 4200;
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    const styles = {
      success: 'bg-primary-700 text-white',
      error: 'bg-red-600 text-white',
      info: 'bg-slate-800 text-white',
      warn: 'bg-amber-500 text-white',
    };
    el.className =
      'toast pointer-events-auto max-w-md w-full sm:w-auto px-4 py-3 rounded-xl shadow-lg text-sm ' +
      (styles[type] || styles.info);
    el.innerHTML = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }, ms);
  };

  window.openModal = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  };

  window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('hidden');
    document.body.style.overflow = '';
  };

  window.setBusy = function (btn, busy, text) {
    if (!btn) return;
    if (busy) {
      btn.dataset.orig = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = text;
    } else {
      btn.disabled = false;
      btn.innerHTML = text || btn.dataset.orig || btn.innerHTML;
    }
  };

  window.getIpSafe = async function () {
    try {
      const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      const j = await r.json();
      return j.ip || null;
    } catch {
      return null;
    }
  };

  window.emptyState = function (title, sub) {
    return (
      '<div class="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center">' +
      '<div class="text-4xl mb-3"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 13.4h4.2l1.4 2.8h5.6l1.4-2.8h4.2"/><path d="M6.8 5.4A2 2 0 0 1 8.7 4h6.6a2 2 0 0 1 1.9 1.4l2.1 6.6v4.4a2 2 0 0 1-2 2H6.7a2 2 0 0 1-2-2V12z"/></svg></div>' +
      '<div class="font-bold text-slate-600">' + window.esc(window.plain(title)) + '</div>' +
      (sub ? '<div class="text-xs text-slate-400 mt-1">' + window.esc(sub) + '</div>' : '') +
      '</div>'
    );
  };

  window.errorState = function (err) {
    return (
      '<div class="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4.6 2.9 20.1h18.2z"/><path d="M12 10.2v4"/><circle cx="12" cy="16.9" r="1" fill="currentColor" stroke="none"/></svg> ' +
      window.esc((err && err.message) || String(err)) +
      '</div>'
    );
  };

  window.statusBadge = function (s) {
    const t = window.I18N ? I18N.t : (k) => k;
    const map = {
      published: [t('st_published'), 'bg-primary-50 text-primary-700 border-primary-200'],
      opened: [t('st_opened'), 'bg-slate-100 text-slate-500 border-slate-200'],
    };
    const item = map[s] || [s, 'bg-slate-100 text-slate-500 border-slate-200'];
    return (
      '<span class="text-[11px] font-bold rounded-full border px-2.5 py-0.5 whitespace-nowrap ' +
      item[1] + '">' + window.esc(window.plain(item[0])) + '</span>'
    );
  };

  window.fmtRef = function (ref) {
    const raw = String(ref || '').trim();
    if (!raw) return '';
    const tokens = raw.split(/[\s/.\-–—°]+/).filter(Boolean);
    const isYear = (tok) => /^(19|20)\d{2}$/.test(tok);
    const isNum = (tok) => /^\d{1,4}$/.test(tok);
    const isNoise = (tok) => /^(n|no|numero|u|a|t|uat)$/i.test(tok);
    let num = '';
    let year = '';
    const suffixTokens = [];
    tokens.forEach((tok) => {
      if (!year && isYear(tok)) { year = tok; return; }
      if (!num && isNum(tok) && !isYear(tok)) { num = tok; return; }
      if (isNoise(tok)) return;
      suffixTokens.push(tok);
    });
    if (!num) return raw;
    if (!year) year = String(new Date().getFullYear());
    const suffix = suffixTokens.map((tok) => (/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(tok) ? tok.toUpperCase() : tok)).join(' ');
    return 'N° ' + num + ' /U.A.T/' + year + (suffix ? ' ' + suffix : '');
  };

  window.sameRef = function (a, b) {
    return window.fmtRef(a) === window.fmtRef(b);
  };
})();
