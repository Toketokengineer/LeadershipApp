/**
 * 実践記録 - 今週のコミットメント + 毎日の実践記録（平日のみ）
 * データ: localStorage
 * - 今週のコミットメント: weeklyCommitment_<weekIndex>
 * - 週の振り返り: weeklyReflection_<weekIndex>
 * - 日付ごと: YYYY-MM-DD -> { practiced: "yes"|"no"|"", comment: string }
 */
const WEEKDAY_LABELS = ['月', '火', '水', '木', '金'];
/** 表示中の週オフセット（0=今週, -1=先週, 1=次週） */
let currentWeekOffset = 0;
/** 月間サマリーの表示月オフセット（0=今月） */
let currentMonthOffset = 0;

function getWeekIndex() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now - start;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}
function getWeekIndexForOffset(offset) {
  return getWeekIndex() + offset;
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** 指定オフセットの週の月〜金（5日） */
function getWeekDaysForOffset(offset) {
  const now = new Date();
  const day = now.getDay();
  const monOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + monOffset + offset * 7);
  const result = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = d.getDate();
    const dateKey = `${y}-${m}-${String(dayNum).padStart(2, '0')}`;
    result.push({
      dateKey,
      dayOfMonth: dayNum,
      weekday: WEEKDAY_LABELS[i],
      isToday: dateKey === todayKey(),
    });
  }
  return result;
}
/** 今週の月〜金（互換） */
function getWeekDays() {
  return getWeekDaysForOffset(0);
}
/** 表示中週の月〜金の日付キー配列 */
function getThisWeekWeekdayKeys() {
  return getWeekDaysForOffset(currentWeekOffset).map((d) => d.dateKey);
}
/** 表示中週の Yes の数（最大5） */
function getThisWeekYesCount() {
  return getThisWeekWeekdayKeys().filter((key) => getDayRecord(key).practiced === 'yes').length;
}
/** 今月の週ごとの Yes 数（月曜始まり、その月に含まれる平日のみ） */
function getMonthWeeksWithYesCount(monthOffset) {
  if (monthOffset === undefined) monthOffset = 0;
  const now = new Date();
  const year = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const last = new Date(year, month + 1, 0);
  const weeks = [];
  let mon = new Date(year, month, 1);
  const dayOfWeek = mon.getDay();
  const monOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  mon.setDate(1 + monOff);
  if (mon.getMonth() !== month) mon.setDate(mon.getDate() + 7);
  let weekNum = 1;
  while (mon.getMonth() === month && mon <= last) {
    const keys = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      if (d.getMonth() !== month) break;
      keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    }
    const yesCount = keys.filter((key) => getDayRecord(key).practiced === 'yes').length;
    const noCount = keys.filter((key) => getDayRecord(key).practiced === 'no').length;
    weeks.push({ label: `第${weekNum}週`, yesCount, noCount, total: keys.length, keys });
    mon.setDate(mon.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

// --- 今週のコミットメント ---
const WEEKLY_KEY_PREFIX = 'weeklyCommitment_';
function getWeeklyCommitmentKey(offset) {
  if (offset === undefined) offset = 0;
  return WEEKLY_KEY_PREFIX + getWeekIndexForOffset(offset);
}
function getWeeklyCommitment(offset) {
  return localStorage.getItem(getWeeklyCommitmentKey(offset)) || '';
}
function setWeeklyCommitment(text) {
  localStorage.setItem(getWeeklyCommitmentKey(0), (text || '').trim());
}

// --- 週の振り返り ---
const REFLECTION_KEY_PREFIX = 'weeklyReflection_';
function getWeeklyReflectionKey(offset) {
  if (offset === undefined) offset = 0;
  return REFLECTION_KEY_PREFIX + getWeekIndexForOffset(offset);
}
function getWeeklyReflection(offset) {
  return localStorage.getItem(getWeeklyReflectionKey(offset)) || '';
}
function setWeeklyReflection(text) {
  localStorage.setItem(getWeeklyReflectionKey(0), (text || '').trim());
}
function setWeeklyReflectionForOffset(offset, text) {
  localStorage.setItem(getWeeklyReflectionKey(offset), (text || '').trim());
}

// --- 日付ごとの記録 ---
function getDayRecord(dateKey) {
  try {
    const raw = localStorage.getItem(dateKey);
    if (!raw) return { practiced: '', comment: '' };
    const parsed = JSON.parse(raw);
    return {
      practiced: parsed.practiced || '',
      comment: parsed.comment || '',
    };
  } catch {
    return { practiced: '', comment: '' };
  }
}
function setDayRecord(dateKey, record) {
  localStorage.setItem(dateKey, JSON.stringify(record));
}

let selectedDateKey = null;
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
  if (!selectedDateKey) {
    el.textContent = '日付を選択してください';
    return;
  }
  const [y, m, d] = selectedDateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const w = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  el.textContent = `${month}月${day}日（${w}）`;
}
function loadDayRecordIntoForm() {
  const commentEl = document.getElementById('dayComment');
  if (!commentEl) return;
  if (!selectedDateKey) {
    commentEl.value = '';
    return;
  }
  const record = getDayRecord(selectedDateKey);
  commentEl.value = record.comment;
}
function updateYesNoButtons() {
  const btnYes = document.getElementById('btnYes');
  const btnNo = document.getElementById('btnNo');
  if (!btnYes || !btnNo) return;
  const practiced = selectedDateKey ? getDayRecord(selectedDateKey).practiced : '';
  const base = 'flex-1 py-3 rounded-xl border-2 font-medium transition';
  const activeYes = 'border-sky-500 bg-sky-500 text-white';
  const activeNo = 'border-red-500 bg-red-500 text-white';
  const inactive = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';
  btnYes.className = base + (practiced === 'yes' ? ' ' + activeYes : ' ' + inactive);
  btnNo.className = base + (practiced === 'no' ? ' ' + activeNo : ' ' + inactive);
}
function saveDayRecord(updates) {
  if (!selectedDateKey) return;
  const current = getDayRecord(selectedDateKey);
  const next = { ...current, ...updates };
  setDayRecord(selectedDateKey, next);
  updateYesNoButtons();
  renderCalendarStrip();
  renderPieChart();
  renderBarChart();
}
function renderCommitmentBanner() {
  const el = document.getElementById('commitmentBannerText');
  if (!el) return;
  const text = getWeeklyCommitment(currentWeekOffset);
  el.textContent = text || 'コミットメントを入力して保存するとここに表示されます';
}
function renderWeekRangeLabel() {
  const el = document.getElementById('weekRangeLabel');
  const btnPrev = document.getElementById('btnPrevWeek');
  const btnNext = document.getElementById('btnNextWeek');
  if (!el) return;
  if (currentWeekOffset === 0) {
    el.textContent = '今週';
  } else {
    const days = getWeekDaysForOffset(currentWeekOffset);
    const first = days[0];
    const last = days[4];
    const [y1, m1, d1] = first.dateKey.split('-').map(Number);
    const [y2, m2, d2] = last.dateKey.split('-').map(Number);
    el.textContent = `${m1}/${d1} 〜 ${m2}/${d2}`;
  }
  if (btnNext) btnNext.disabled = currentWeekOffset >= 3;
  if (btnPrev) btnPrev.disabled = currentWeekOffset <= -4;
}
function renderCalendarStrip() {
  const container = document.getElementById('calendarStrip');
  if (!container) return;
  const days = getWeekDaysForOffset(currentWeekOffset);
  const todayK = todayKey();
  container.innerHTML = days
    .map(({ dateKey, dayOfMonth, weekday, isToday }) => {
      const isSelected = selectedDateKey === dateKey;
      const record = getDayRecord(dateKey);
      const hasRecord = record.practiced !== '';
      let bg = 'bg-white border-slate-200 text-slate-700';
      if (isSelected) bg = 'border-sky-500 bg-sky-500 text-white';
      else if (isToday) bg = 'border-slate-300 bg-slate-100 text-slate-800';
      if (hasRecord && !isSelected) {
        if (record.practiced === 'yes') bg = 'border-emerald-300 bg-emerald-50 text-emerald-800';
        else bg = 'border-red-200 bg-red-50 text-red-800';
      }
      return `
        <button type="button" class="flex-shrink-0 w-12 h-14 flex flex-col items-center justify-center rounded-xl border-2 ${bg} transition" data-date="${dateKey}" aria-label="${dateKey}を選択">
          <span class="text-xs font-medium opacity-80">${weekday}</span>
          <span class="text-base font-semibold">${dayOfMonth}</span>
        </button>
      `;
    })
    .join('');
  container.querySelectorAll('button[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => setSelectedDate(btn.dataset.date));
  });
}
/** 今週の円グラフ（Yes 割合）SVG */
function renderPieChart() {
  const container = document.getElementById('pieChartContainer');
  const legend = document.getElementById('pieChartLegend');
  if (!container || !legend) return;
  const total = 5;
  const yesCount = getThisWeekYesCount();
  const ratio = total === 0 ? 0 : yesCount / total;
  const size = 120;
  const r = 44;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dashYes = ratio * circumference;
  container.innerHTML = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="transform -rotate-90">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="12"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#0ea5e9" stroke-width="12" stroke-dasharray="${dashYes} ${circumference}" stroke-linecap="round"/>
    </svg>
  `;
  legend.innerHTML = `
    <div class="space-y-1">
      <p class="font-medium text-slate-800">Yes: ${yesCount}日 / ${total}日</p>
      <p class="text-slate-500">${Math.round(ratio * 100)}% 実践</p>
    </div>
  `;
}
/** 月間の週別棒グラフ */
function renderBarChart() {
  const container = document.getElementById('barChartContainer');
  const labelsEl = document.getElementById('barChartLabels');
  if (!container || !labelsEl) return;
  const weeks = getMonthWeeksWithYesCount(0);
  const maxYes = Math.max(5, ...weeks.map((w) => w.yesCount));
  const barMaxHeight = 120;
  container.innerHTML = weeks
    .map((w) => {
      const h = maxYes === 0 ? 0 : (w.yesCount / maxYes) * barMaxHeight;
      const pct = w.total === 0 ? 0 : Math.round((w.yesCount / w.total) * 100);
      return `
        <div class="flex-1 flex flex-col items-center min-w-0" style="max-width: 4rem;">
          <span class="text-xs font-semibold text-slate-600 mb-1">${pct}%</span>
          <div class="w-full flex flex-col justify-end rounded-t bg-slate-100" style="height: ${barMaxHeight}px; min-height: 24px;">
            <div class="w-full bg-sky-500 rounded-t transition-all duration-300" style="height: ${h}px; min-height: ${w.yesCount > 0 ? 4 : 0}px;"></div>
          </div>
        </div>
      `;
    })
    .join('');
  labelsEl.innerHTML = weeks.map((w) => `<span class="flex-1 text-center truncate min-w-0" style="max-width: 4rem;">${w.label}</span>`).join('');
}

// =====================================================
// 月間サマリー機能
// =====================================================

/** 表示月のラベルを取得（例: 2025年6月） */
function getMonthLabelForOffset(offset) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** 表示月の各週のweekIndexリストを取得 */
function getWeekIndexesForMonth(monthOffset) {
  const now = new Date();
  const year = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const month = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();
  const last = new Date(year, month + 1, 0);
  const result = [];
  let mon = new Date(year, month, 1);
  const dayOfWeek = mon.getDay();
  const monOff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  mon.setDate(1 + monOff);
  if (mon.getMonth() !== month) mon.setDate(mon.getDate() + 7);
  while (mon.getMonth() === month && mon <= last) {
    // その月曜日がある週のweekIndexを求める
    const startOfYear = new Date(mon.getFullYear(), 0, 1);
    const weekIdx = Math.floor((mon - startOfYear) / (7 * 24 * 60 * 60 * 1000));
    // 現在週からのオフセットに変換
    const currentWeekIdx = getWeekIndex();
    const weekOffset = weekIdx - currentWeekIdx;
    result.push({ weekOffset, weekIdx });
    mon.setDate(mon.getDate() + 7);
  }
  return result;
}

/** 月間サマリーを描画 */
function renderMonthlySummary() {
  const monthOffset = currentMonthOffset;

  // 月ラベル
  const monthLabelEl = document.getElementById('monthLabel');
  if (monthLabelEl) monthLabelEl.textContent = getMonthLabelForOffset(monthOffset);

  // 次月ボタンの制限（未来の月は見せない）
  const btnNextMonth = document.getElementById('btnNextMonth');
  if (btnNextMonth) btnNextMonth.disabled = monthOffset >= 0;

  // 月間データ集計
  const weeks = getMonthWeeksWithYesCount(monthOffset);
  const totalYes = weeks.reduce((s, w) => s + w.yesCount, 0);
  const totalDays = weeks.reduce((s, w) => s + w.total, 0);
  const totalRecorded = weeks.reduce((s, w) => s + w.yesCount + w.noCount, 0);
  const rate = totalDays === 0 ? 0 : Math.round((totalYes / totalDays) * 100);

  // 統計カード
  const summaryTotalYes = document.getElementById('summaryTotalYes');
  const summaryTotalDays = document.getElementById('summaryTotalDays');
  const summaryRate = document.getElementById('summaryRate');
  const summaryRateLabel = document.getElementById('summaryRateLabel');
  const summaryProgressBar = document.getElementById('summaryProgressBar');
  if (summaryTotalYes) summaryTotalYes.textContent = totalYes;
  if (summaryTotalDays) summaryTotalDays.textContent = totalRecorded;
  if (summaryRate) summaryRate.textContent = rate + '%';
  if (summaryRateLabel) summaryRateLabel.textContent = rate + '%';
  if (summaryProgressBar) summaryProgressBar.style.width = rate + '%';

  // 週ごとの詳細
  const weeksContainer = document.getElementById('monthlySummaryWeeks');
  if (weeksContainer) {
    const weekIndexes = getWeekIndexesForMonth(monthOffset);
    weeksContainer.innerHTML = weeks.map((w, i) => {
      const pct = w.total === 0 ? 0 : Math.round((w.yesCount / w.total) * 100);
      const barWidth = pct;
      const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-sky-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-200';
      return `
        <div class="flex items-center gap-3">
          <span class="text-xs text-slate-500 w-10 shrink-0">${w.label}</span>
          <div class="flex-1 bg-slate-100 rounded-full h-2.5">
            <div class="${barColor} h-2.5 rounded-full transition-all duration-500" style="width: ${barWidth}%"></div>
          </div>
          <span class="text-xs font-medium text-slate-600 w-16 text-right shrink-0">${w.yesCount}/${w.total}日 (${pct}%)</span>
        </div>
      `;
    }).join('') || '<p class="text-sm text-slate-400">データがありません</p>';
  }

  // 週ごとのコミットメント一覧
  renderMonthlyCommitments(monthOffset);

  // 週ごとの振り返り一覧
  renderMonthlyReflections(monthOffset);

  // AIアドバイスカードを非表示にリセット
  const card = document.getElementById('monthlyAiAdviceCard');
  if (card) card.classList.add('hidden');
}

/** 月間コミットメント一覧を描画 */
function renderMonthlyCommitments(monthOffset) {
  const container = document.getElementById('monthlyCommitments');
  if (!container) return;

  const weekIndexes = getWeekIndexesForMonth(monthOffset);
  const weeks = getMonthWeeksWithYesCount(monthOffset);

  const items = weekIndexes.map((wi, i) => {
    const commitment = localStorage.getItem(WEEKLY_KEY_PREFIX + wi.weekIdx) || '';
    return { label: weeks[i] ? weeks[i].label : `第${i+1}週`, commitment };
  });

  if (items.length === 0 || items.every(item => !item.commitment)) {
    container.innerHTML = '<p class="text-sm text-slate-400">コミットメントの記録がありません</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    if (!item.commitment) {
      return `
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-xs font-medium text-slate-400 mb-1">${item.label}</p>
          <p class="text-sm text-slate-400 italic">未入力</p>
        </div>
      `;
    }
    return `
      <div class="rounded-xl border border-sky-100 bg-sky-50 p-3">
        <p class="text-xs font-medium text-sky-600 mb-1">${item.label}</p>
        <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(item.commitment)}</p>
      </div>
    `;
  }).join('');
}

/** 月間振り返り一覧を描画 */
function renderMonthlyReflections(monthOffset) {
  const container = document.getElementById('monthlyReflections');
  if (!container) return;

  const weekIndexes = getWeekIndexesForMonth(monthOffset);
  const weeks = getMonthWeeksWithYesCount(monthOffset);

  const items = weekIndexes.map((wi, i) => {
    const reflection = localStorage.getItem(REFLECTION_KEY_PREFIX + wi.weekIdx) || '';
    return { label: weeks[i] ? weeks[i].label : `第${i+1}週`, reflection };
  });

  if (items.length === 0 || items.every(item => !item.reflection)) {
    container.innerHTML = '<p class="text-sm text-slate-400">振り返りの記録がありません</p>';
    return;
  }

  container.innerHTML = items.map(item => {
    if (!item.reflection) {
      return `
        <div class="rounded-xl border border-slate-100 bg-slate-50 p-3">
          <p class="text-xs font-medium text-slate-400 mb-1">${item.label}</p>
          <p class="text-sm text-slate-400 italic">未入力</p>
        </div>
      `;
    }
    return `
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <p class="text-xs font-medium text-slate-500 mb-1">${item.label}</p>
        <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(item.reflection)}</p>
      </div>
    `;
  }).join('');
}

/** HTMLエスケープ */
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

/** 月間AIアドバイス */
function getMonthlyAiAdvice(monthOffset) {
  const weeks = getMonthWeeksWithYesCount(monthOffset);
  const totalYes = weeks.reduce((s, w) => s + w.yesCount, 0);
  const totalDays = weeks.reduce((s, w) => s + w.total, 0);
  const rate = totalDays === 0 ? 0 : Math.round((totalYes / totalDays) * 100);
  const weekIndexes = getWeekIndexesForMonth(monthOffset);
  const hasReflections = weekIndexes.some(wi => !!localStorage.getItem(REFLECTION_KEY_PREFIX + wi.weekIdx));

  if (rate >= 80) {
    return `今月は${rate}%という高い実践率を達成しました。素晴らしい継続力です。この調子で来月も取り組み、さらに深く・広く実践の質を高めていきましょう。記録をチームで共有してみることも、次のステップとしておすすめです。`;
  } else if (rate >= 50) {
    return `今月の実践率は${rate}%でした。半分以上の日数で実践できたことは着実な前進です。うまくいかなかった日のパターンを振り返り、来月はより安定した実践につなげましょう。小さな仕組み（リマインダーや習慣のトリガー）を整えるとさらに効果的です。`;
  } else if (totalYes > 0) {
    return `今月の実践率は${rate}%でした。記録を続けているだけで大切な一歩です。完璧を目指さず、まずは「週に3日」など現実的な目標を設定して取り組んでみてください。振り返りを毎週書く習慣がつくと、次第に実践の質と量が上がっていきます。`;
  } else {
    return `今月のデータをもとに分析するには、もう少し実践記録を入力してみてください。まず1日、Yes を記録することから始めましょう。小さな成功体験の積み重ねが、継続の力になります。`;
  }
}

/** タブ切り替え */
function initTabs() {
  const tabWeekly = document.getElementById('tabWeekly');
  const tabMonthly = document.getElementById('tabMonthly');
  const viewWeekly = document.getElementById('viewWeekly');
  const viewMonthly = document.getElementById('viewMonthly');

  function showWeekly() {
    tabWeekly.className = tabWeekly.className.replace('tab-inactive', 'tab-active');
    tabMonthly.className = tabMonthly.className.replace('tab-active', 'tab-inactive');
    viewWeekly.classList.remove('hidden');
    viewMonthly.classList.add('hidden');
  }
  function showMonthly() {
    tabMonthly.className = tabMonthly.className.replace('tab-inactive', 'tab-active');
    tabWeekly.className = tabWeekly.className.replace('tab-active', 'tab-inactive');
    viewMonthly.classList.remove('hidden');
    viewWeekly.classList.add('hidden');
    renderMonthlySummary();
  }

  tabWeekly.addEventListener('click', showWeekly);
  tabMonthly.addEventListener('click', showMonthly);
}

/** 月ナビゲーション */
function initMonthNavigation() {
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => {
    currentMonthOffset--;
    renderMonthlySummary();
  });
  document.getElementById('btnNextMonth')?.addEventListener('click', () => {
    if (currentMonthOffset >= 0) return;
    currentMonthOffset++;
    renderMonthlySummary();
  });
}

/** 月間AIアドバイスボタン */
function initMonthlyAiAdvice() {
  const btn = document.getElementById('btnMonthlyAiAdvice');
  const card = document.getElementById('monthlyAiAdviceCard');
  const textEl = document.getElementById('monthlyAiAdviceText');
  if (!btn || !card || !textEl) return;
  btn.addEventListener('click', () => {
    textEl.textContent = getMonthlyAiAdvice(currentMonthOffset);
    card.classList.remove('hidden');
  });
}

// =====================================================
// 既存機能（変更なし）
// =====================================================

function initWeeklyCommitment() {
  const input = document.getElementById('weeklyCommitment');
  const saveBtn = document.getElementById('saveWeeklyCommitment');
  const savedMsg = document.getElementById('weeklyCommitmentSaved');
  if (!input || !saveBtn || !savedMsg) return;
  input.value = getWeeklyCommitment(0);
  saveBtn.addEventListener('click', () => {
    const text = input.value.trim();
    setWeeklyCommitment(text);
    input.value = getWeeklyCommitment(0);
    renderCommitmentBanner();
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
  });
}
function initWeeklyReflection() {
  const textarea = document.getElementById('weeklyReflection');
  const saveBtn = document.getElementById('saveWeeklyReflection');
  const savedMsg = document.getElementById('weeklyReflectionSaved');
  if (!textarea || !saveBtn || !savedMsg) return;
  function loadReflection() {
    textarea.value = getWeeklyReflection(currentWeekOffset);
  }
  loadReflection();
  saveBtn.addEventListener('click', () => {
    setWeeklyReflectionForOffset(currentWeekOffset, textarea.value.trim());
    textarea.value = getWeeklyReflection(currentWeekOffset);
    savedMsg.classList.remove('hidden');
    setTimeout(() => savedMsg.classList.add('hidden'), 2000);
  });
  window.loadWeeklyReflectionForOffset = loadReflection;
}
function initDailyRecord() {
  const btnYes = document.getElementById('btnYes');
  const btnNo = document.getElementById('btnNo');
  const commentEl = document.getElementById('dayComment');
  const saveCommentBtn = document.getElementById('saveDayComment');
  if (btnYes) {
    btnYes.addEventListener('click', () => {
      if (!selectedDateKey) return;
      saveDayRecord({ practiced: 'yes' });
    });
  }
  if (btnNo) {
    btnNo.addEventListener('click', () => {
      if (!selectedDateKey) return;
      saveDayRecord({ practiced: 'no' });
    });
  }
  if (saveCommentBtn && commentEl) {
    saveCommentBtn.addEventListener('click', () => {
      if (!selectedDateKey) return;
      saveDayRecord({ comment: commentEl.value.trim() });
      saveCommentBtn.textContent = '保存済み';
      saveCommentBtn.classList.remove('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
      saveCommentBtn.classList.add('bg-emerald-100', 'text-emerald-800', 'border', 'border-emerald-200');
      setTimeout(() => {
        saveCommentBtn.textContent = 'コメントを保存';
        saveCommentBtn.classList.add('bg-slate-100', 'text-slate-700', 'hover:bg-slate-200');
        saveCommentBtn.classList.remove('bg-emerald-100', 'text-emerald-800', 'border', 'border-emerald-200');
      }, 2500);
    });
  }
}
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
function getDefaultSelectedKey() {
  const keys = getWeekDaysForOffset(currentWeekOffset).map((d) => d.dateKey);
  const today = todayKey();
  return keys.includes(today) ? today : keys[0];
}
function goToPrevWeek() {
  if (currentWeekOffset <= -4) return;
  currentWeekOffset--;
  const keys = getWeekDaysForOffset(currentWeekOffset).map((d) => d.dateKey);
  selectedDateKey = keys[0];
  renderWeekRangeLabel();
  renderCalendarStrip();
  updateSelectedDateLabel();
  loadDayRecordIntoForm();
  updateYesNoButtons();
  renderCommitmentBanner();
  renderPieChart();
  if (window.loadWeeklyReflectionForOffset) window.loadWeeklyReflectionForOffset();
}
function goToNextWeek() {
  if (currentWeekOffset >= 3) return;
  currentWeekOffset++;
  const keys = getWeekDaysForOffset(currentWeekOffset).map((d) => d.dateKey);
  selectedDateKey = keys.includes(todayKey()) ? todayKey() : keys[0];
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
/** 週の振り返り内容に基づくアドバイス（シミュレーション） */
function getAiAdvice() {
  const text = (getWeeklyReflection(currentWeekOffset) || '').trim();
  const adviceList = [
    '今週の振り返り、とても良い視点です。来週は「聴く」時間を意識的に増やすと、チームの心理的安全性がさらに高まります。',
    '実践を続けている姿勢が素晴らしいです。小さな一歩の積み重ねが、確かなリーダーシップにつながっています。',
    '振り返りを言語化することで、自分の強みと改善点が明確になります。来週は「褒める」を1日1回以上、具体的な言葉で試してみてください。',
    'リーダーとしての自覚が伝わってきます。メンバーとの1対1の時間を固定で持つと、信頼関係が深まります。',
    '前向きな気づきが多く見られます。次週は「指示を数値と期限で伝える」を意識すると、チームの動きがさらにスムーズになります。',
    '継続は力です。今週の学びを来週の最初の会議で一言シェアすると、チーム全体の成長につながります。',
  ];
  if (text.length > 0) {
    const i = Math.abs(text.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % adviceList.length;
    return adviceList[i];
  }
  return '週の振り返りを入力して保存したあと、「AIからの一言アドバイス」を押すと、振り返りに基づいたアドバイスが表示されます。まずは今週の気づきを記入してみましょう。';
}
function initAiAdvice() {
  const btn = document.getElementById('btnAiAdvice');
  const card = document.getElementById('aiAdviceCard');
  const textEl = document.getElementById('aiAdviceText');
  if (!btn || !card || !textEl) return;
  btn.addEventListener('click', () => {
    textEl.textContent = getAiAdvice();
    card.classList.remove('hidden');
  });
}
function init() {
  initWeeklyCommitment();
  initWeeklyReflection();
  initWeekNavigation();
  initAiAdvice();
  renderCommitmentBanner();
  renderWeekRangeLabel();
  renderCalendarStrip();
  setSelectedDate(getDefaultSelectedKey());
  updateSelectedDateLabel();
  loadDayRecordIntoForm();
  updateYesNoButtons();
  renderPieChart();
  renderBarChart();
  initDailyRecord();
  initServiceWorker();
  initTabs();
  initMonthNavigation();
  initMonthlyAiAdvice();
}
document.addEventListener('DOMContentLoaded', init);
