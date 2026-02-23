/**
 * 実践記録 app.js v1.3.0
 * 新機能:
 *  ① JSONエクスポート / インポート / データ削除
 *  ② 毎日のリマインダー通知（Web Notifications API）
 *  ③ 過去3ヶ月の実践率折れ線グラフ（SVG）
 */

// =====================================================
// 定数・グローバル状態
// =====================================================
const WEEKDAY_LABELS     = ['月', '火', '水', '木', '金'];
const WEEKLY_KEY_PREFIX  = 'weeklyCommitment_';
const REFLECTION_KEY_PREFIX = 'weeklyReflection_';
const NOTIF_ENABLED_KEY  = 'notifEnabled';
const NOTIF_TIME_KEY     = 'notifTime';

let currentWeekOffset  = 0;
let currentMonthOffset = 0;
let selectedDateKey    = null;

// =====================================================
// 日付ユーティリティ
// =====================================================
function getWeekIndex() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.floor((now - start) / (7 * 24 * 60 * 60 * 1000));
}
function getWeekIndexForOffset(offset) { return getWeekIndex() + offset; }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getWeekDaysForOffset(offset) {
  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + monOffset + offset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { dateKey, dayOfMonth: d.getDate(), weekday: WEEKDAY_LABELS[i], isToday: dateKey === todayKey() };
  });
}

function getThisWeekWeekdayKeys() {
  return getWeekDaysForOffset(currentWeekOffset).map(d => d.dateKey);
}
function getThisWeekYesCount() {
  return getThisWeekWeekdayKeys().filter(k => getDayRecord(k).practiced === 'yes').length;
}

/** 指定月オフセットの週ごとデータ */
function getMonthWeeksWithYesCount(monthOffset = 0) {
  const now   = new Date();
  const base  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year  = base.getFullYear();
  const month = base.getMonth();
  const last  = new Date(year, month + 1, 0);
  const weeks = [];
  let mon = new Date(year, month, 1);
  const dow = mon.getDay();
  mon.setDate(1 + (dow === 0 ? -6 : 1 - dow));
  if (mon.getMonth() !== month) mon.setDate(mon.getDate() + 7);
  let weekNum = 1;
  while (mon.getMonth() === month && mon <= last) {
    const keys = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      if (d.getMonth() !== month) break;
      keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    }
    const yesCount = keys.filter(k => getDayRecord(k).practiced === 'yes').length;
    const noCount  = keys.filter(k => getDayRecord(k).practiced === 'no').length;
    weeks.push({ label: `第${weekNum}週`, yesCount, noCount, total: keys.length, keys });
    mon.setDate(mon.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

/** 指定月の各週のweekIndex一覧 */
function getWeekIndexesForMonth(monthOffset = 0) {
  const now   = new Date();
  const base  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year  = base.getFullYear();
  const month = base.getMonth();
  const last  = new Date(year, month + 1, 0);
  const result = [];
  let mon = new Date(year, month, 1);
  const dow = mon.getDay();
  mon.setDate(1 + (dow === 0 ? -6 : 1 - dow));
  if (mon.getMonth() !== month) mon.setDate(mon.getDate() + 7);
  while (mon.getMonth() === month && mon <= last) {
    const startOfYear = new Date(mon.getFullYear(), 0, 1);
    const weekIdx = Math.floor((mon - startOfYear) / (7 * 24 * 60 * 60 * 1000));
    result.push({ weekIdx });
    mon.setDate(mon.getDate() + 7);
  }
  return result;
}

function getMonthLabelForOffset(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}年${d.getMonth()+1}月`;
}

// =====================================================
// localStorage CRUD
// =====================================================
function getWeeklyCommitment(offset = 0) {
  return localStorage.getItem(WEEKLY_KEY_PREFIX + getWeekIndexForOffset(offset)) || '';
}
function setWeeklyCommitment(text) {
  localStorage.setItem(WEEKLY_KEY_PREFIX + getWeekIndexForOffset(0), (text||'').trim());
}
function getWeeklyReflection(offset = 0) {
  return localStorage.getItem(REFLECTION_KEY_PREFIX + getWeekIndexForOffset(offset)) || '';
}
function setWeeklyReflectionForOffset(offset, text) {
  localStorage.setItem(REFLECTION_KEY_PREFIX + getWeekIndexForOffset(offset), (text||'').trim());
}
function getDayRecord(dateKey) {
  try {
    const raw = localStorage.getItem(dateKey);
    if (!raw) return { practiced: '', comment: '' };
    const p = JSON.parse(raw);
    return { practiced: p.practiced || '', comment: p.comment || '' };
  } catch { return { practiced: '', comment: '' }; }
}
function setDayRecord(dateKey, record) {
  localStorage.setItem(dateKey, JSON.stringify(record));
}

// =====================================================
// ① データエクスポート / インポート / 削除
// =====================================================

/** localStorage の全データを JSON としてダウンロード */
function exportData() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  const json     = JSON.stringify(data, null, 2);
  const blob     = new Blob([json], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const dateStr  = new Date().toISOString().slice(0, 10);
  a.href         = url;
  a.download     = `jissen-kiroku-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** JSON ファイルをインポートして localStorage に復元 */
function importData(file) {
  const statusEl = document.getElementById('importStatus');
  const reader   = new FileReader();
  reader.onload  = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
      statusEl.textContent = `✅ インポート完了（${Object.keys(data).length}件）。ページを再読み込みします…`;
      statusEl.className   = 'mt-2 text-xs text-emerald-600';
      statusEl.classList.remove('hidden');
      setTimeout(() => location.reload(), 1500);
    } catch {
      statusEl.textContent = '❌ ファイルが正しくありません。エクスポートしたJSONを選択してください。';
      statusEl.className   = 'mt-2 text-xs text-red-500';
      statusEl.classList.remove('hidden');
    }
  };
  reader.readAsText(file);
}

/** 全データ削除（確認あり） */
function clearAllData() {
  if (!confirm('本当にすべてのデータを削除しますか？\nこの操作は取り消せません。\n（削除前にエクスポートを推奨します）')) return;
  localStorage.clear();
  alert('データを削除しました。');
  location.reload();
}

function initDataSettings() {
  document.getElementById('btnExport')?.addEventListener('click', exportData);
  document.getElementById('btnClearData')?.addEventListener('click', clearAllData);
  const importFile = document.getElementById('importFile');
  importFile?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    importFile.value = ''; // 同じファイルを再選択できるようリセット
  });
}

// =====================================================
// ② 通知リマインダー
// =====================================================

function getNotifEnabled() { return localStorage.getItem(NOTIF_ENABLED_KEY) === 'true'; }
function setNotifEnabled(v) { localStorage.setItem(NOTIF_ENABLED_KEY, String(v)); }
function getNotifTime()    { return localStorage.getItem(NOTIF_TIME_KEY) || '18:00'; }
function setNotifTime(t)   { localStorage.setItem(NOTIF_TIME_KEY, t); }

/** 通知UIを現在の権限状態に合わせて更新 */
function updateNotifUI() {
  const unsupported = document.getElementById('notifUnsupported');
  const denied      = document.getElementById('notifDenied');
  const reqBtn      = document.getElementById('btnRequestNotif');
  const granted     = document.getElementById('notifGranted');
  if (!('Notification' in window)) {
    unsupported?.classList.remove('hidden');
    return;
  }
  const perm = Notification.permission;
  if (perm === 'denied') {
    denied?.classList.remove('hidden');
    return;
  }
  if (perm === 'default') {
    reqBtn?.classList.remove('hidden');
    return;
  }
  // granted
  granted?.classList.remove('hidden');
  const toggle     = document.getElementById('toggleNotif');
  const timeArea   = document.getElementById('notifTimeArea');
  const timeInput  = document.getElementById('notifTime');
  const enabled    = getNotifEnabled();
  if (toggle) toggle.setAttribute('aria-checked', String(enabled));
  if (timeArea)  timeArea.classList.toggle('hidden', !enabled);
  if (timeInput) timeInput.value = getNotifTime();
}

/** 指定時刻まで待ってから通知を送るスケジューラ（タブが開いている間のみ動作） */
function scheduleNotification() {
  if (!getNotifEnabled()) return;
  if (Notification.permission !== 'granted') return;

  const [h, m] = getNotifTime().split(':').map(Number);
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;
  setTimeout(() => {
    // 平日（月〜金）のみ通知
    const day = new Date().getDay();
    if (day >= 1 && day <= 5) {
      // 今日まだ記録していない場合のみ
      const todayRec = getDayRecord(todayKey());
      if (!todayRec.practiced) {
        new Notification('実践記録', {
          body: '今日の実践を記録しましょう 📝',
          icon: 'icons/icon.svg',
        });
      }
    }
    scheduleNotification(); // 翌日のスケジュール
  }, delay);
}

function initNotificationSettings() {
  updateNotifUI();

  document.getElementById('btnRequestNotif')?.addEventListener('click', async () => {
    const result = await Notification.requestPermission();
    updateNotifUI();
    if (result === 'granted') scheduleNotification();
  });

  const toggle = document.getElementById('toggleNotif');
  toggle?.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-checked') !== 'true';
    setNotifEnabled(next);
    toggle.setAttribute('aria-checked', String(next));
    document.getElementById('notifTimeArea')?.classList.toggle('hidden', !next);
    if (next) scheduleNotification();
  });

  document.getElementById('saveNotifTime')?.addEventListener('click', () => {
    const val = document.getElementById('notifTime')?.value;
    if (val) setNotifTime(val);
    const saved = document.getElementById('notifTimeSaved');
    saved?.classList.remove('hidden');
    setTimeout(() => saved?.classList.add('hidden'), 2000);
  });
}

// =====================================================
// ③ 過去3ヶ月の折れ線グラフ（SVG）
// =====================================================

function renderTrendChart() {
  const svg    = document.getElementById('trendChartSvg');
  const legend = document.getElementById('trendChartLegend');
  if (!svg || !legend) return;

  // 過去3ヶ月 + 今月 = 最大4点
  const points = [];
  for (let mo = -2; mo <= 0; mo++) {
    const weeks    = getMonthWeeksWithYesCount(mo);
    const totalYes = weeks.reduce((s, w) => s + w.yesCount, 0);
    const totalDay = weeks.reduce((s, w) => s + w.total, 0);
    const rate     = totalDay === 0 ? null : Math.round((totalYes / totalDay) * 100);
    points.push({ label: getMonthLabelForOffset(mo).replace(/(\d+)年(\d+)月/, '$2月'), rate });
  }

  const W = svg.parentElement?.clientWidth || 300;
  const H = 140;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  const padL = 36, padR = 16, padT = 12, padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const validPoints = points.filter(p => p.rate !== null);
  if (validPoints.length === 0) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#94a3b8" font-size="12">データがまだありません</text>`;
    legend.innerHTML = '';
    return;
  }

  const xs = points.map((_, i) => padL + (chartW / (points.length - 1)) * i);
  const yOf = (rate) => padT + chartH - (rate / 100) * chartH;

  // グリッド線（0, 50, 100%）
  let svgHtml = '';
  [0, 50, 100].forEach(v => {
    const y = yOf(v);
    svgHtml += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>`;
    svgHtml += `<text x="${padL - 4}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${v}</text>`;
  });

  // 折れ線パス
  const pathParts = [];
  let prevX = null, prevY = null;
  points.forEach((p, i) => {
    if (p.rate === null) return;
    const x = xs[i], y = yOf(p.rate);
    pathParts.push(prevX === null ? `M${x},${y}` : `L${x},${y}`);
    prevX = x; prevY = y;
  });
  svgHtml += `<path d="${pathParts.join(' ')}" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // データ点・ラベル
  points.forEach((p, i) => {
    const x = xs[i];
    const xLabel = x;
    if (p.rate !== null) {
      const y = yOf(p.rate);
      svgHtml += `<circle cx="${x}" cy="${y}" r="5" fill="#0ea5e9" stroke="white" stroke-width="2"/>`;
      svgHtml += `<text x="${x}" y="${y - 9}" text-anchor="middle" fill="#0369a1" font-size="11" font-weight="600">${p.rate}%</text>`;
    }
    // X軸ラベル
    svgHtml += `<text x="${xLabel}" y="${H - 4}" text-anchor="middle" fill="#94a3b8" font-size="10">${p.label}</text>`;
  });

  svg.innerHTML = svgHtml;
  legend.innerHTML = '';
}

// =====================================================
// 既存機能（週間記録、月間サマリー）
// =====================================================

function setSelectedDate(dateKey) {
  selectedDateKey = dateKey;
  updateSelectedDateLabel();
  loadDayRecordIntoForm();
  updateYesNoButtons();
  renderCalendarStrip();
}

function updateSelectedDateLabel() {
  const el = document.getElementById('selectedDateLabel');
  if (!el) return;
  if (!selectedDateKey) { el.textContent = '日付を選択してください'; return; }
  const [y, m, d] = selectedDateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const w = ['日','月','火','水','木','金','土'][date.getDay()];
  el.textContent = `${date.getMonth()+1}月${date.getDate()}日（${w}）`;
}

function loadDayRecordIntoForm() {
  const el = document.getElementById('dayComment');
  if (!el) return;
  el.value = selectedDateKey ? getDayRecord(selectedDateKey).comment : '';
}

function updateYesNoButtons() {
  const btnYes = document.getElementById('btnYes');
  const btnNo  = document.getElementById('btnNo');
  if (!btnYes || !btnNo) return;
  const practiced = selectedDateKey ? getDayRecord(selectedDateKey).practiced : '';
  const base = 'flex-1 py-3 rounded-xl border-2 font-medium transition';
  btnYes.className = base + (practiced === 'yes' ? ' border-sky-500 bg-sky-500 text-white' : ' border-slate-200 bg-white text-slate-600 hover:border-slate-300');
  btnNo.className  = base + (practiced === 'no'  ? ' border-red-500 bg-red-500 text-white'  : ' border-slate-200 bg-white text-slate-600 hover:border-slate-300');
}

function saveDayRecord(updates) {
  if (!selectedDateKey) return;
  setDayRecord(selectedDateKey, { ...getDayRecord(selectedDateKey), ...updates });
  updateYesNoButtons();
  renderCalendarStrip();
  renderPieChart();
  renderBarChart();
}

function renderCommitmentBanner() {
  const el = document.getElementById('commitmentBannerText');
  if (!el) return;
  el.textContent = getWeeklyCommitment(currentWeekOffset) || 'コミットメントを入力して保存するとここに表示されます';
}

function renderWeekRangeLabel() {
  const el      = document.getElementById('weekRangeLabel');
  const btnPrev = document.getElementById('btnPrevWeek');
  const btnNext = document.getElementById('btnNextWeek');
  if (!el) return;
  if (currentWeekOffset === 0) {
    el.textContent = '今週';
  } else {
    const days = getWeekDaysForOffset(currentWeekOffset);
    const [,m1,d1] = days[0].dateKey.split('-').map(Number);
    const [,m2,d2] = days[4].dateKey.split('-').map(Number);
    el.textContent = `${m1}/${d1} 〜 ${m2}/${d2}`;
  }
  if (btnNext) btnNext.disabled = currentWeekOffset >= 3;
  if (btnPrev) btnPrev.disabled = currentWeekOffset <= -4;
}

function renderCalendarStrip() {
  const container = document.getElementById('calendarStrip');
  if (!container) return;
  container.innerHTML = getWeekDaysForOffset(currentWeekOffset).map(({ dateKey, dayOfMonth, weekday, isToday }) => {
    const isSelected = selectedDateKey === dateKey;
    const record = getDayRecord(dateKey);
    let bg = 'bg-white border-slate-200 text-slate-700';
    if (isSelected) bg = 'border-sky-500 bg-sky-500 text-white';
    else if (isToday) bg = 'border-slate-300 bg-slate-100 text-slate-800';
    else if (record.practiced === 'yes') bg = 'border-emerald-300 bg-emerald-50 text-emerald-800';
    else if (record.practiced === 'no')  bg = 'border-red-200 bg-red-50 text-red-800';
    return `<button type="button" class="flex-shrink-0 w-12 h-14 flex flex-col items-center justify-center rounded-xl border-2 ${bg} transition" data-date="${dateKey}" aria-label="${dateKey}を選択">
      <span class="text-xs font-medium opacity-80">${weekday}</span>
      <span class="text-base font-semibold">${dayOfMonth}</span>
    </button>`;
  }).join('');
  container.querySelectorAll('button[data-date]').forEach(btn => {
    btn.addEventListener('click', () => setSelectedDate(btn.dataset.date));
  });
}

function renderPieChart() {
  const container = document.getElementById('pieChartContainer');
  const legend    = document.getElementById('pieChartLegend');
  if (!container || !legend) return;
  const yesCount = getThisWeekYesCount();
  const ratio    = yesCount / 5;
  const r = 44, size = 120, cx = 60, cy = 60;
  const circ = 2 * Math.PI * r;
  container.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform -rotate-90">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0ea5e9" stroke-width="12" stroke-dasharray="${ratio*circ} ${circ}" stroke-linecap="round"/>
  </svg>`;
  legend.innerHTML = `<div class="space-y-1"><p class="font-medium text-slate-800">Yes: ${yesCount}日 / 5日</p><p class="text-slate-500">${Math.round(ratio*100)}% 実践</p></div>`;
}

function renderBarChart() {
  const container = document.getElementById('barChartContainer');
  const labelsEl  = document.getElementById('barChartLabels');
  if (!container || !labelsEl) return;
  const weeks  = getMonthWeeksWithYesCount(0);
  const maxYes = Math.max(5, ...weeks.map(w => w.yesCount));
  const barMaxH = 120;
  container.innerHTML = weeks.map(w => {
    const h   = maxYes === 0 ? 0 : (w.yesCount / maxYes) * barMaxH;
    const pct = w.total === 0 ? 0 : Math.round((w.yesCount / w.total) * 100);
    return `<div class="flex-1 flex flex-col items-center min-w-0" style="max-width:4rem;">
      <span class="text-xs font-semibold text-slate-600 mb-1">${pct}%</span>
      <div class="w-full flex flex-col justify-end rounded-t bg-slate-100" style="height:${barMaxH}px;">
        <div class="w-full bg-sky-500 rounded-t transition-all duration-300" style="height:${h}px;min-height:${w.yesCount>0?4:0}px;"></div>
      </div>
    </div>`;
  }).join('');
  labelsEl.innerHTML = weeks.map(w => `<span class="flex-1 text-center truncate min-w-0" style="max-width:4rem;">${w.label}</span>`).join('');
}

// --- 月間サマリー ---
function renderMonthlySummary() {
  const monthOffset = currentMonthOffset;
  const monthLabelEl = document.getElementById('monthLabel');
  if (monthLabelEl) monthLabelEl.textContent = getMonthLabelForOffset(monthOffset);

  const btnNextMonth = document.getElementById('btnNextMonth');
  if (btnNextMonth) btnNextMonth.disabled = monthOffset >= 0;

  const weeks        = getMonthWeeksWithYesCount(monthOffset);
  const totalYes     = weeks.reduce((s,w) => s+w.yesCount, 0);
  const totalDays    = weeks.reduce((s,w) => s+w.total, 0);
  const totalRecorded= weeks.reduce((s,w) => s+w.yesCount+w.noCount, 0);
  const rate         = totalDays === 0 ? 0 : Math.round((totalYes/totalDays)*100);

  const el = (id) => document.getElementById(id);
  if (el('summaryTotalYes'))   el('summaryTotalYes').textContent   = totalYes;
  if (el('summaryTotalDays'))  el('summaryTotalDays').textContent  = totalRecorded;
  if (el('summaryRate'))       el('summaryRate').textContent       = rate + '%';
  if (el('summaryRateLabel'))  el('summaryRateLabel').textContent  = rate + '%';
  if (el('summaryProgressBar'))el('summaryProgressBar').style.width= rate + '%';

  const weeksContainer = el('monthlySummaryWeeks');
  if (weeksContainer) {
    weeksContainer.innerHTML = weeks.map(w => {
      const pct      = w.total === 0 ? 0 : Math.round((w.yesCount/w.total)*100);
      const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200';
      return `<div class="flex items-center gap-3">
        <span class="text-xs text-slate-500 w-10 shrink-0">${w.label}</span>
        <div class="flex-1 bg-slate-100 rounded-full h-2.5">
          <div class="${barColor} h-2.5 rounded-full transition-all duration-500" style="width:${pct}%"></div>
        </div>
        <span class="text-xs font-medium text-slate-600 w-16 text-right shrink-0">${w.yesCount}/${w.total}日 (${pct}%)</span>
      </div>`;
    }).join('') || '<p class="text-sm text-slate-400">データがありません</p>';
  }

  renderMonthlyCommitments(monthOffset);
  renderMonthlyReflections(monthOffset);
  renderTrendChart();

  const card = el('monthlyAiAdviceCard');
  if (card) card.classList.add('hidden');
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

function renderMonthlyCommitments(monthOffset) {
  const container = document.getElementById('monthlyCommitments');
  if (!container) return;
  const weekIndexes = getWeekIndexesForMonth(monthOffset);
  const weeks       = getMonthWeeksWithYesCount(monthOffset);
  const items = weekIndexes.map((wi,i) => ({
    label: weeks[i] ? weeks[i].label : `第${i+1}週`,
    commitment: localStorage.getItem(WEEKLY_KEY_PREFIX + wi.weekIdx) || '',
  }));
  if (!items.length || items.every(it => !it.commitment)) {
    container.innerHTML = '<p class="text-sm text-slate-400">コミットメントの記録がありません</p>';
    return;
  }
  container.innerHTML = items.map(item => item.commitment
    ? `<div class="rounded-xl border border-sky-100 bg-sky-50 p-3"><p class="text-xs font-medium text-sky-600 mb-1">${item.label}</p><p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(item.commitment)}</p></div>`
    : `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><p class="text-xs font-medium text-slate-400 mb-1">${item.label}</p><p class="text-sm text-slate-400 italic">未入力</p></div>`
  ).join('');
}

function renderMonthlyReflections(monthOffset) {
  const container = document.getElementById('monthlyReflections');
  if (!container) return;
  const weekIndexes = getWeekIndexesForMonth(monthOffset);
  const weeks       = getMonthWeeksWithYesCount(monthOffset);
  const items = weekIndexes.map((wi,i) => ({
    label: weeks[i] ? weeks[i].label : `第${i+1}週`,
    reflection: localStorage.getItem(REFLECTION_KEY_PREFIX + wi.weekIdx) || '',
  }));
  if (!items.length || items.every(it => !it.reflection)) {
    container.innerHTML = '<p class="text-sm text-slate-400">振り返りの記録がありません</p>';
    return;
  }
  container.innerHTML = items.map(item => item.reflection
    ? `<div class="rounded-xl border border-slate-200 bg-white p-3"><p class="text-xs font-medium text-slate-500 mb-1">${item.label}</p><p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(item.reflection)}</p></div>`
    : `<div class="rounded-xl border border-slate-100 bg-slate-50 p-3"><p class="text-xs font-medium text-slate-400 mb-1">${item.label}</p><p class="text-sm text-slate-400 italic">未入力</p></div>`
  ).join('');
}

// =====================================================
// Claude API 共通
// =====================================================
async function callClaudeApi(prompt, textEl, card, btn) {
  card.classList.remove('hidden');
  textEl.textContent = '考え中...';
  btn.disabled = true;
  btn.classList.add('opacity-60');
  try {
    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    textEl.textContent = data.content.map(b => b.text||'').join('') || 'アドバイスを取得できませんでした。';
  } catch {
    textEl.textContent = 'アドバイスの取得に失敗しました。しばらく時間をおいて再試行してください。';
  } finally {
    btn.disabled = false;
    btn.classList.remove('opacity-60');
  }
}

function initAiAdvice() {
  const btn    = document.getElementById('btnAiAdvice');
  const card   = document.getElementById('aiAdviceCard');
  const textEl = document.getElementById('aiAdviceText');
  if (!btn||!card||!textEl) return;
  btn.addEventListener('click', async () => {
    const commitment = getWeeklyCommitment(currentWeekOffset).trim();
    const reflection = getWeeklyReflection(currentWeekOffset).trim();
    if (!reflection) { card.classList.remove('hidden'); textEl.textContent = '週の振り返りを入力して保存してから押してください。'; return; }
    await callClaudeApi(
      `あなたはビジネスリーダーの成長をサポートするコーチです。以下の週間記録をもとに、具体的で温かみのある日本語のアドバイスを200字以内で1つだけ書いてください。アドバイスのみを出力し、前置きや見出しは不要です。\n\n【今週のコミットメント】\n${commitment||'（未入力）'}\n\n【今週の実践回数】\n${getThisWeekYesCount()} / 5日\n\n【週の振り返り】\n${reflection}`,
      textEl, card, btn
    );
  });
}

function initMonthlyAiAdvice() {
  const btn    = document.getElementById('btnMonthlyAiAdvice');
  const card   = document.getElementById('monthlyAiAdviceCard');
  const textEl = document.getElementById('monthlyAiAdviceText');
  if (!btn||!card||!textEl) return;
  btn.addEventListener('click', async () => {
    const weeks      = getMonthWeeksWithYesCount(currentMonthOffset);
    const totalYes   = weeks.reduce((s,w) => s+w.yesCount, 0);
    const totalDays  = weeks.reduce((s,w) => s+w.total, 0);
    const rate       = totalDays === 0 ? 0 : Math.round((totalYes/totalDays)*100);
    const weekIndexes= getWeekIndexesForMonth(currentMonthOffset);
    const detail     = weekIndexes.map((wi,i) => {
      const label      = weeks[i] ? weeks[i].label : `第${i+1}週`;
      const commitment = localStorage.getItem(WEEKLY_KEY_PREFIX + wi.weekIdx) || '（未入力）';
      const reflection = localStorage.getItem(REFLECTION_KEY_PREFIX + wi.weekIdx) || '（未入力）';
      const yc = weeks[i]?.yesCount ?? 0, tot = weeks[i]?.total ?? 0;
      return `${label}: Yes ${yc}/${tot}日\n  コミットメント: ${commitment}\n  振り返り: ${reflection}`;
    }).join('\n\n');
    await callClaudeApi(
      `あなたはビジネスリーダーの成長をサポートするコーチです。以下の月間記録をもとに、1ヶ月を通じた気づきと来月に向けた具体的なアドバイスを300字以内の日本語で書いてください。アドバイスのみを出力し、前置きや見出しは不要です。\n\n【月間実践率】\n${rate}%（${totalYes}/${totalDays}日）\n\n【週ごとの記録】\n${detail||'（記録なし）'}`,
      textEl, card, btn
    );
  });
}

// =====================================================
// 初期化系
// =====================================================
function initWeeklyCommitment() {
  const input    = document.getElementById('weeklyCommitment');
  const saveBtn  = document.getElementById('saveWeeklyCommitment');
  const savedMsg = document.getElementById('weeklyCommitmentSaved');
  if (!input||!saveBtn||!savedMsg) return;
  input.value = getWeeklyCommitment(0);
  saveBtn.addEventListener('click', () => {
    setWeeklyCommitment(input.value.trim());
    input.value = getWeeklyCommitment(0);
    renderCommitmentBanner();
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
  });
}

function initWeeklyReflection() {
  const textarea = document.getElementById('weeklyReflection');
  const saveBtn  = document.getElementById('saveWeeklyReflection');
  const savedMsg = document.getElementById('weeklyReflectionSaved');
  if (!textarea||!saveBtn||!savedMsg) return;
  const load = () => { textarea.value = getWeeklyReflection(currentWeekOffset); };
  load();
  saveBtn.addEventListener('click', () => {
    setWeeklyReflectionForOffset(currentWeekOffset, textarea.value.trim());
    textarea.value = getWeeklyReflection(currentWeekOffset);
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
  });
  window.loadWeeklyReflectionForOffset = load;
}

function initDailyRecord() {
  document.getElementById('btnYes')?.addEventListener('click', () => { if (selectedDateKey) saveDayRecord({ practiced: 'yes' }); });
  document.getElementById('btnNo')?.addEventListener('click',  () => { if (selectedDateKey) saveDayRecord({ practiced: 'no'  }); });

  const commentEl    = document.getElementById('dayComment');
  const saveCommentBtn = document.getElementById('saveDayComment');
  if (saveCommentBtn && commentEl) {
    saveCommentBtn.addEventListener('click', () => {
      if (!selectedDateKey) return;
      saveDayRecord({ comment: commentEl.value.trim() });
      saveCommentBtn.textContent = '保存済み';
      saveCommentBtn.classList.replace('bg-slate-100','bg-emerald-100');
      saveCommentBtn.classList.replace('text-slate-700','text-emerald-800');
      setTimeout(() => {
        saveCommentBtn.textContent = 'コメントを保存';
        saveCommentBtn.classList.replace('bg-emerald-100','bg-slate-100');
        saveCommentBtn.classList.replace('text-emerald-800','text-slate-700');
      }, 2500);
    });
  }
}

function goToPrevWeek() {
  if (currentWeekOffset <= -4) return;
  currentWeekOffset--;
  const keys = getWeekDaysForOffset(currentWeekOffset).map(d => d.dateKey);
  selectedDateKey = keys[0];
  refreshWeekView();
}
function goToNextWeek() {
  if (currentWeekOffset >= 3) return;
  currentWeekOffset++;
  const keys = getWeekDaysForOffset(currentWeekOffset).map(d => d.dateKey);
  selectedDateKey = keys.includes(todayKey()) ? todayKey() : keys[0];
  refreshWeekView();
}
function refreshWeekView() {
  renderWeekRangeLabel();
  renderCalendarStrip();
  updateSelectedDateLabel();
  loadDayRecordIntoForm();
  updateYesNoButtons();
  renderCommitmentBanner();
  renderPieChart();
  if (window.loadWeeklyReflectionForOffset) window.loadWeeklyReflectionForOffset();
}

function initWeekNavigation() {
  document.getElementById('btnPrevWeek')?.addEventListener('click', goToPrevWeek);
  document.getElementById('btnNextWeek')?.addEventListener('click', goToNextWeek);
}

function initMonthNavigation() {
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => { currentMonthOffset--; renderMonthlySummary(); });
  document.getElementById('btnNextMonth')?.addEventListener('click', () => { if (currentMonthOffset < 0) { currentMonthOffset++; renderMonthlySummary(); } });
}

// タブ切り替え（3タブ対応）
function initTabs() {
  const tabs = [
    { btn: 'tabWeekly',   view: 'viewWeekly'  },
    { btn: 'tabMonthly',  view: 'viewMonthly' },
    { btn: 'tabSettings', view: 'viewSettings'},
  ];
  tabs.forEach(({ btn, view }) => {
    document.getElementById(btn)?.addEventListener('click', () => {
      tabs.forEach(t => {
        document.getElementById(t.btn)?.classList.replace('tab-active','tab-inactive');
        document.getElementById(t.view)?.classList.add('hidden');
      });
      document.getElementById(btn)?.classList.replace('tab-inactive','tab-active');
      document.getElementById(view)?.classList.remove('hidden');
      if (view === 'viewMonthly')  renderMonthlySummary();
      if (view === 'viewSettings') updateNotifUI();
    });
  });
}

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

function init() {
  initWeeklyCommitment();
  initWeeklyReflection();
  initWeekNavigation();
  initDailyRecord();
  initAiAdvice();
  initMonthlyAiAdvice();
  initMonthNavigation();
  initTabs();
  initDataSettings();
  initNotificationSettings();
  initServiceWorker();

  // 初期描画
  renderCommitmentBanner();
  renderWeekRangeLabel();
  renderCalendarStrip();
  const keys = getWeekDaysForOffset(0).map(d => d.dateKey);
  setSelectedDate(keys.includes(todayKey()) ? todayKey() : keys[0]);
  renderPieChart();
  renderBarChart();

  // 通知スケジュール（許可済みかつ有効なら）
  if (Notification.permission === 'granted' && getNotifEnabled()) {
    scheduleNotification();
  }
}

document.addEventListener('DOMContentLoaded', init);