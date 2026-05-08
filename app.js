/**
 * app.js - メインアプリケーションロジック
 *
 * 担当:
 *   - ページナビゲーション (SPA 的な表示切り替え)
 *   - ログイン / ログアウト処理
 *   - ポモドーロタイマーロジック
 *   - 棒グラフ描画 (過去1か月ページ)
 *   - 全期間集計表示 (モンスターページ)
 *   - イベントリスナー設定
 *   - アプリ起動 (boot)
 *
 * 前提:
 *   supabase-config.js, db.js, supabase.js が先に読み込まれていること
 */

'use strict';

/* ============================================================
   定数
   ============================================================ */

/** タイマー秒数定義 */
const TIMER_DURATION = {
  work:        25 * 60, // 1500 秒
  short_break:  5 * 60, //  300 秒
  long_break:  15 * 60, //  900 秒
};

/** 1回の作業完了で記録する秒数 (30分) */
const WORK_RECORD_SECONDS = 30 * 60;

/** 長い休憩に入るまでの作業セッション数 */
const SESSIONS_PER_CYCLE = 4;

/** モード表示ラベル */
const MODE_LABEL = {
  work:        '作業中',
  short_break: '小休憩',
  long_break:  '長休憩',
};

/* ============================================================
   アプリ状態
   ============================================================ */

/** アプリ全体の共有状態 */
const appState = {
  username:    null,
  monsterName: null,
};

/** 記録ページの選択タブ */
let reportTab = 'week';

/**
 * タイマー状態
 * mode:         現在のモード
 * secondsLeft:  残り秒数
 * isRunning:    タイマー動作中か
 * cycleCount:   現在サイクル内で完了した作業セッション数 (0-4)
 * hasStarted:   現在モードでタイマーを一度でも開始したか (START/RESUME 切り替え用)
 * intervalId:   setInterval の戻り値
 */
const timerState = {
  mode:        'work',
  secondsLeft: TIMER_DURATION.work,
  isRunning:   false,
  cycleCount:  0,
  hasStarted:  false,
  intervalId:  null,
};

/* ============================================================
   ページナビゲーション
   ============================================================ */

/**
 * 指定ページへ遷移する (他ページを非表示にして対象ページを表示)
 * @param {'login'|'timer'|'report'|'monster'} pageId
 */
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach((p) => p.classList.add('hidden'));

  const target = document.getElementById(`page-${pageId}`);
  if (!target) {
    console.error(`navigateTo: page "${pageId}" not found`);
    return;
  }
  target.classList.remove('hidden');

  // ページ別初期化
  switch (pageId) {
    case 'naming':  initNamingPage();  break;
    case 'timer':   initTimerPage();   break;
    case 'report':  initReportPage();  break;
    case 'monster': initMonsterPage(); break;
  }
}

/* ============================================================
   ログイン / ログアウト処理
   ============================================================ */

/**
 * ログインボタン押下 (またはEnterキー) の処理
 */
async function handleLogin() {
  const input    = document.getElementById('username-input');
  const username = (input.value || '').trim();

  if (!username) {
    showLoginError('NAME を入力してください');
    return;
  }
  if (username.length > 20) {
    showLoginError('NAME は 20 文字以内にしてください');
    return;
  }

  // Unicode 文字・数字・一部記号を許可 (日本語も含む)
  if (!/^[\p{L}\p{N}\-_. ]+$/u.test(username)) {
    showLoginError('使用できない文字が含まれています');
    return;
  }

  try {
    await saveUsername(username);
    appState.username = username;
    await navigateAfterLogin();
  } catch (err) {
    console.error('handleLogin error:', err);
    showLoginError('エラーが発生しました。もう一度お試しください。');
  }
}

/**
 * ログインエラーメッセージを表示する
 * @param {string} msg
 */
function showLoginError(msg) {
  let el = document.getElementById('login-error');
  if (!el) {
    el = document.createElement('p');
    el.id        = 'login-error';
    el.className = 'login-error';
    document.querySelector('.login-panel').appendChild(el);
  }
  el.textContent = msg;
}

/**
 * 利用者変更 (全ページ共通)
 * タイマーを止め、IndexedDB を消去してログインページへ戻る
 */
async function handleLogout() {
  stopTimer();
  try {
    await clearUsername();
  } catch (err) {
    console.error('handleLogout error:', err);
  }
  appState.username    = null;
  appState.monsterName = null;
  navigateTo('login');
}

/* ============================================================
   ログイン後ナビゲーション
   ============================================================ */

async function navigateAfterLogin() {
  const name = await getMonsterName(appState.username);
  if (name) {
    appState.monsterName = name;
    navigateTo('timer');
  } else {
    navigateTo('naming');
  }
}

/* ============================================================
   命名ページ
   ============================================================ */

function initNamingPage() {
  const input = document.getElementById('monster-name-input');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 100);
  }
}

async function handleNamingSubmit() {
  const input = document.getElementById('monster-name-input');
  const name  = (input.value || '').trim();

  if (!name) {
    showNamingError('名前を入力してください');
    return;
  }
  if (!/^[\p{L}\p{N}\-_. ]+$/u.test(name)) {
    showNamingError('使用できない文字が含まれています');
    return;
  }

  const btn = document.getElementById('naming-btn');
  btn.textContent = '保存中...';
  btn.disabled    = true;

  const ok = await saveMonsterName(appState.username, name);

  if (ok) {
    appState.monsterName = name;
    navigateTo('timer');
  } else {
    btn.textContent = '決定';
    btn.disabled    = false;
    showNamingError('保存に失敗しました。もう一度お試しください。');
  }
}

function showNamingError(msg) {
  let el = document.getElementById('naming-error');
  if (!el) {
    el            = document.createElement('p');
    el.id         = 'naming-error';
    el.className  = 'login-error';
    document.querySelector('#page-naming .login-panel').appendChild(el);
  }
  el.textContent = msg;
}

/* ============================================================
   タイマーページ
   ============================================================ */

/**
 * タイマーページ表示時の初期化
 */
function initTimerPage() {
  const el = document.getElementById('timer-username');
  if (el) el.textContent = `プレイヤー: ${appState.username}`;
  renderTimerDisplay();
  renderPomodoroDots();
}

/**
 * タイマー表示 (残り時間・モードラベル) を更新する
 */
function renderTimerDisplay() {
  const mins = Math.floor(timerState.secondsLeft / 60);
  const secs = timerState.secondsLeft % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  document.getElementById('timer-time').textContent = timeStr;
  document.getElementById('timer-mode-label').textContent = MODE_LABEL[timerState.mode];

  // モードに応じた CSS クラスを切り替え
  const digits = document.getElementById('timer-time');
  digits.className = 'timer-digits';
  digits.classList.add(`timer-digits--${timerState.mode.replace('_', '-')}`);

  // ページタイトルにも残り時間を反映
  document.title = `${timeStr} - STUDY QUEST`;
}

/**
 * ポモドーロ進捗ドットを更新する
 */
function renderPomodoroDots() {
  document.querySelectorAll('#pomodoro-dots .dot').forEach((dot, i) => {
    dot.classList.toggle('dot--filled', i < timerState.cycleCount);
  });
}

/**
 * START / RESUME ボタンのラベルを更新する
 */
function renderStartButton() {
  const btn = document.getElementById('btn-start');
  btn.textContent = timerState.hasStarted ? '再開' : 'スタート';
}

/**
 * タイマー開始
 */
function startTimer() {
  if (timerState.isRunning) return;

  timerState.isRunning  = true;
  timerState.hasStarted = true;

  document.getElementById('btn-start').classList.add('hidden');
  document.getElementById('btn-pause').classList.remove('hidden');

  timerState.intervalId = setInterval(() => {
    if (timerState.secondsLeft <= 0) {
      onTimerComplete();
      return;
    }
    timerState.secondsLeft--;
    renderTimerDisplay();
  }, 1000);
}

/**
 * タイマー一時停止
 */
function pauseTimer() {
  if (!timerState.isRunning) return;
  timerState.isRunning = false;

  clearInterval(timerState.intervalId);
  timerState.intervalId = null;

  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('btn-start').classList.remove('hidden');
  renderStartButton();
}

/**
 * タイマー停止 (ページ離脱時など内部用)
 */
function stopTimer() {
  if (timerState.isRunning) {
    pauseTimer();
  }
}

/**
 * タイマーリセット (現在モードの先頭に戻る)
 */
function resetTimer() {
  stopTimer();
  timerState.secondsLeft = TIMER_DURATION[timerState.mode];
  timerState.hasStarted  = false;

  document.getElementById('btn-start').classList.remove('hidden');
  document.getElementById('btn-pause').classList.add('hidden');
  renderStartButton();
  renderTimerDisplay();
  hideTimerMessage();
}

/**
 * スキップ (現在モードを完了扱いにせず次へ進む)
 */
function skipTimer() {
  stopTimer();
  // 作業中スキップ: cycleCount は変えない (未完了扱い)
  // 休憩中スキップ: 長い休憩なら cycleCount をリセット
  if (timerState.mode === 'long_break') {
    timerState.cycleCount = 0;
  }
  switchMode(timerState.mode === 'work' ? 'short_break' : 'work');
}

/**
 * タイマーが 0 に達したときの処理
 */
async function onTimerComplete() {
  clearInterval(timerState.intervalId);
  timerState.intervalId = null;
  timerState.isRunning  = false;
  timerState.secondsLeft = 0;
  renderTimerDisplay();

  // ボタンを START 状態に戻す
  document.getElementById('btn-pause').classList.add('hidden');
  document.getElementById('btn-start').classList.remove('hidden');
  timerState.hasStarted = false;
  renderStartButton();

  if (timerState.mode === 'work') {
    // -- 作業完了 --
    showTimerMessage('作業完了！保存中...', 'info');

    const ok = await saveStudySession(appState.username, WORK_RECORD_SECONDS);

    if (ok) {
      showTimerMessage('作業完了！+25分 保存しました。', 'success');
    } else {
      showTimerMessage('作業完了！(保存失敗 - 設定を確認してください)', 'warning');
    }

    // サイクル進捗を更新
    timerState.cycleCount++;
    renderPomodoroDots();

    // 次のモードを決定
    const nextMode = timerState.cycleCount >= SESSIONS_PER_CYCLE
      ? 'long_break'
      : 'short_break';

    // cycleCount が SESSIONS_PER_CYCLE に達したらリセット
    if (timerState.cycleCount >= SESSIONS_PER_CYCLE) {
      timerState.cycleCount = 0;
    }

    // 2 秒後に次のモードへ自動切り替え
    setTimeout(() => {
      hideTimerMessage();
      switchMode(nextMode);
      renderPomodoroDots();
    }, 2000);

  } else {
    // -- 休憩完了 --
    showTimerMessage('休憩終了！作業を始めよう。', 'info');
    setTimeout(() => {
      hideTimerMessage();
      switchMode('work');
    }, 2000);
  }
}

/**
 * タイマーモードを切り替える
 * @param {'work'|'short_break'|'long_break'} newMode
 */
function switchMode(newMode) {
  timerState.mode        = newMode;
  timerState.secondsLeft = TIMER_DURATION[newMode];
  timerState.hasStarted  = false;
  renderTimerDisplay();
  renderStartButton();
}

/**
 * タイマーメッセージを表示する
 * @param {string} msg
 * @param {'info'|'success'|'warning'} type
 */
function showTimerMessage(msg, type) {
  const el = document.getElementById('timer-message');
  el.textContent = msg;
  el.className   = `timer-message timer-message--${type}`;
  el.classList.remove('hidden');
}

/** タイマーメッセージを非表示にする */
function hideTimerMessage() {
  document.getElementById('timer-message').classList.add('hidden');
}

/* ============================================================
   レポートページ (過去1か月の棒グラフ)
   ============================================================ */

/**
 * レポートページ表示時の初期化
 */
async function initReportPage() {
  const el = document.getElementById('report-username');
  if (el) el.textContent = `プレイヤー: ${appState.username}`;

  document.querySelectorAll('#page-report .tab-btn').forEach(btn => {
    btn.onclick = async () => {
      reportTab = btn.dataset.tab;
      document.querySelectorAll('#page-report .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      await loadReportData();
    };
  });

  document.querySelectorAll('#page-report .tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === reportTab);
  });

  await loadReportData();
}

async function loadReportData() {
  const container = document.getElementById('chart-container');
  const loading   = document.getElementById('chart-loading');

  loading.textContent = '読み込み中...';
  loading.classList.remove('hidden');

  const existing = container.querySelector('.bar-chart');
  if (existing) existing.remove();

  try {
    let sessions, chartData;

    if (reportTab === 'week') {
      sessions  = await fetchSessionsSince(appState.username, 7);
      chartData = aggregateByDay(sessions, 7);
    } else if (reportTab === 'month') {
      sessions  = await fetchSessionsSince(appState.username, 28);
      chartData = aggregateByWeek(sessions, 4);
    } else {
      sessions  = await fetchSessionsSince(appState.username, 365);
      chartData = aggregateByCalendarMonth(sessions, 12);
    }

    const totalSecs = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
    loading.classList.add('hidden');
    document.getElementById('report-total').textContent = formatDuration(totalSecs);
    renderBarChart(container, chartData);

  } catch (err) {
    loading.textContent = 'エラー: データを取得できませんでした';
    console.error('loadReportData error:', err);
  }
}

/**
 * セッション配列を日ごとに集計する
 * 過去 N 日分の日付キーを 0 で初期化してから積算する
 *
 * @param {Array<{ended_at: string, duration_seconds: number}>} sessions
 * @param {number} days - 集計対象日数
 * @returns {Array<{date: string, seconds: number}>} 日付昇順
 */
function aggregateByDay(sessions, days) {
  const map = {};

  // 過去 N 日分のキーを 0 で初期化 (ローカル日付)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map[toLocalDateKey(d)] = 0;
  }

  // セッションを日付キーで集計
  sessions.forEach((s) => {
    const key = toLocalDateKey(new Date(s.ended_at));
    if (key in map) {
      map[key] += s.duration_seconds;
    }
  });

  return Object.entries(map).map(([isoDate, seconds]) => {
    const [, mm, dd] = isoDate.split('-');
    return { date: `${mm}/${dd}`, seconds };
  });
}

function aggregateByWeek(sessions, weeks) {
  const result = [];
  const now = new Date();

  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const mm = String(weekStart.getMonth() + 1).padStart(2, '0');
    const dd = String(weekStart.getDate()).padStart(2, '0');
    const seconds = sessions
      .filter(s => { const d = new Date(s.ended_at); return d >= weekStart && d <= weekEnd; })
      .reduce((sum, s) => sum + s.duration_seconds, 0);

    result.push({ date: `${mm}/${dd}〜`, seconds });
  }
  return result;
}

function aggregateByCalendarMonth(sessions, months) {
  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const seconds = sessions
      .filter(s => { const d = new Date(s.ended_at); return d >= monthStart && d <= monthEnd; })
      .reduce((sum, s) => sum + s.duration_seconds, 0);

    result.push({ date: `${monthStart.getMonth() + 1}月`, seconds });
  }
  return result;
}

/**
 * Date オブジェクトをローカルタイムゾーンで "YYYY-MM-DD" 文字列に変換する
 * @param {Date} date
 * @returns {string}
 */
function toLocalDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 秒数を "Xh Ym" 形式にフォーマットする
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/**
 * 棒グラフを描画する (HTML/CSS のみ、ライブラリ不使用)
 *
 * @param {HTMLElement} container    - グラフを挿入する親要素
 * @param {Array<{date: string, seconds: number}>} data - 日付昇順データ
 */
function renderBarChart(container, data) {
  const CHART_MAX = 10 * 3600; // 固定スケール: 10h

  const chart = document.createElement('div');
  chart.className = 'bar-chart';

  // ---- Y 軸エリア (0h〜10h, 1h刻み) ----
  const yAxis = document.createElement('div');
  yAxis.className = 'chart-y-axis';

  for (let i = 10; i >= 0; i--) {
    const lbl = document.createElement('div');
    lbl.className   = 'y-label';
    lbl.textContent = i > 0 ? `${i}h` : '';
    yAxis.appendChild(lbl);
  }

  // ---- グラフ本体 ----
  const chartInner = document.createElement('div');
  chartInner.className = 'chart-inner';

  // グリッドライン (1h刻み 10本)
  const gridLayer = document.createElement('div');
  gridLayer.className = 'grid-layer';
  for (let i = 1; i <= 10; i++) {
    const line = document.createElement('div');
    line.className = 'grid-line';
    line.style.bottom = `${(i / 10) * 100}%`;
    gridLayer.appendChild(line);
  }

  // バーエリア
  const barsArea = document.createElement('div');
  barsArea.className = data.length <= 14 ? 'bars-area bars-area--wide' : 'bars-area';

  data.forEach(({ date, seconds }, index) => {
    const col = document.createElement('div');
    col.className = 'bar-col';

    const barWrap = document.createElement('div');
    barWrap.className = 'bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'bar';
    const pct = Math.min((seconds / CHART_MAX) * 100, 100);
    bar.style.height = `${pct}%`;
    if (seconds === 0) bar.classList.add('bar--empty');

    // 値ラベル (0 分は非表示)
    if (seconds > 0) {
      const valEl = document.createElement('div');
      valEl.className   = 'bar-val';
      valEl.textContent = formatDuration(seconds);
      barWrap.appendChild(valEl);
    }

    barWrap.appendChild(bar);

    const dateLbl = document.createElement('div');
    dateLbl.className = 'bar-date';
    dateLbl.textContent = (data.length <= 14 || index % 7 === 0) ? date : '';

    col.appendChild(barWrap);
    col.appendChild(dateLbl);
    barsArea.appendChild(col);
  });

  chartInner.appendChild(gridLayer);
  chartInner.appendChild(barsArea);

  chart.appendChild(yAxis);
  chart.appendChild(chartInner);
  container.appendChild(chart);
}

/* ============================================================
   全期間ページ (モンスター)
   ============================================================ */

/**
 * モンスターページ表示時の初期化
 */
async function initMonsterPage() {
  const el = document.getElementById('monster-username');
  if (el) el.textContent = `プレイヤー: ${appState.username}`;

  const nameEl = document.getElementById('monster-name');
  if (nameEl) nameEl.textContent = appState.monsterName || '???';

  const valueEl = document.getElementById('alltime-value');
  valueEl.textContent = '読み込み中...';

  try {
    const sessions   = await fetchAllTimeSessions(appState.username);
    const totalSecs  = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);

    valueEl.textContent = totalSecs > 0 ? formatDuration(totalSecs) : '0M';

    // 将来のモンスター機能用ステータス更新
    updateMonsterStatus(totalSecs);

  } catch (err) {
    valueEl.textContent = 'エラー';
    console.error('initMonsterPage error:', err);
  }
}

/**
 * モンスターのレベル/EXP ステータスバーを更新する
 * (将来のモンスター機能拡張のための準備実装)
 *
 * 計算ルール (仮):
 *   - 25 分 = 1 EXP
 *   - 10 EXP = 1 レベルアップ
 *
 * @param {number} totalSeconds - 全期間の合計秒数
 */
function updateMonsterStatus(totalSeconds) {
  const totalPomodoros = Math.floor(totalSeconds / WORK_RECORD_SECONDS);
  const level          = Math.floor(totalPomodoros / 10) + 1;
  const expInLevel     = totalPomodoros % 10;
  const expPct         = expInLevel * 10; // 0-100%

  const lvEl     = document.getElementById('monster-lv');
  const expEl    = document.getElementById('monster-exp');
  const expBarEl = document.getElementById('monster-exp-bar');

  if (lvEl)     lvEl.textContent       = level;
  if (expEl)    expEl.textContent      = `${expInLevel}/10`;
  if (expBarEl) expBarEl.style.width   = `${expPct}%`;
}

/* ============================================================
   フッターナビゲーション
   ============================================================ */

/**
 * フッターの各ナビボタンにクリックイベントを設定する
 * ページ間のアクティブクラス切り替えも行う
 */
function initFooterNav() {
  document.querySelectorAll('.footer-btn[data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
    });
  });
}

/* ============================================================
   全イベントリスナー設定
   ============================================================ */

function initEventListeners() {
  // ---- ログインページ ----
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('username-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  // ---- 命名ページ ----
  document.getElementById('naming-btn').addEventListener('click', handleNamingSubmit);
  document.getElementById('monster-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleNamingSubmit();
  });

  // ---- タイマー操作ボタン ----
  document.getElementById('btn-start').addEventListener('click', startTimer);
  document.getElementById('btn-pause').addEventListener('click', pauseTimer);
  document.getElementById('btn-reset').addEventListener('click', resetTimer);
  document.getElementById('btn-skip').addEventListener('click', skipTimer);

  // ---- 利用者変更ボタン (全ページ) ----
  // id="logout-btn" はタイマーページ
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  // class="logout-btn-ref" はレポート・モンスターページ
  document.querySelectorAll('.logout-btn-ref').forEach((btn) => {
    btn.addEventListener('click', handleLogout);
  });

  // ---- フッターナビ ----
  initFooterNav();
}

/* ============================================================
   アプリ起動
   ============================================================ */

/**
 * アプリ起動処理
 * IndexedDB のログイン状態を確認し、適切なページへ遷移する
 */
async function boot() {
  initEventListeners();

  try {
    const username = await getUsername();
    if (username) {
      appState.username = username;
      await navigateAfterLogin();
    } else {
      navigateTo('login');
    }
  } catch (err) {
    console.error('boot error:', err);
    navigateTo('login');
  }
}

// DOM 構築完了後に起動
document.addEventListener('DOMContentLoaded', boot);
