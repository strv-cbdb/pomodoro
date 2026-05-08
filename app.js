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

/**
 * モンスター進化テーブル: レベル閾値 → 画像キー
 *
 * レベル計算式: level = floor(sqrt(累計セッション数 × 2.5))
 *   Lv50 = 1000セッション = 500時間
 */
const MONSTER_STAGES = [
  { minLevel:  0, image: 'lv00' }, // 卵
  { minLevel:  3, image: 'lv03' }, // 卵（ひび小）
  { minLevel:  6, image: 'lv06' }, // 卵（ひび大）
  { minLevel: 10, image: 'lv10' }, // 赤ちゃん
  { minLevel: 20, image: 'lv20' }, // 第1形態
  { minLevel: 30, image: 'lv30' }, // 第2形態
  { minLevel: 40, image: 'lv40' }, // 第3形態
  { minLevel: 50, image: 'lv50' }, // 第4形態（最終）
];

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
  username:        null,
  monsterName:     null,
  monsterImageKey: 'lv00',
};

/** 記録ページの選択タブ */
let reportTab = 'week';

/** Chart.js インスタンス (再描画時に destroy するため保持) */
let chartInstance = null;

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

  const miniEl = document.getElementById('timer-monster-mini-img');
  if (miniEl) miniEl.src = `images/monster-${appState.monsterImageKey}.png`;
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
    renderBarChart(container, chartData, reportTab);

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
  const JST_OFFSET = 9 * 60 * 60 * 1000;

  for (let i = days - 1; i >= 0; i--) {
    const jst = new Date(Date.now() + JST_OFFSET);
    jst.setUTCDate(jst.getUTCDate() - i);
    map[jst.toISOString().slice(0, 10)] = 0;
  }

  sessions.forEach((s) => {
    const key = s.ended_at.slice(0, 10);
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
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const result = [];
  const jstNow = new Date(Date.now() + JST_OFFSET);
  const todayMs = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate());

  for (let i = weeks - 1; i >= 0; i--) {
    const endMs   = todayMs - i * 7 * 86400000;
    const startMs = endMs   - 6 * 86400000;

    const endStr   = new Date(endMs).toISOString().slice(0, 10);
    const startStr = new Date(startMs).toISOString().slice(0, 10);

    const [, mm, dd] = startStr.split('-');
    const seconds = sessions
      .filter(s => { const d = s.ended_at.slice(0, 10); return d >= startStr && d <= endStr; })
      .reduce((sum, s) => sum + s.duration_seconds, 0);

    result.push({ date: `${mm}/${dd}〜`, seconds });
  }
  return result;
}

function aggregateByCalendarMonth(sessions, months) {
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const result = [];
  const jstNow = new Date(Date.now() + JST_OFFSET);
  const nowYear  = jstNow.getUTCFullYear();
  const nowMonth = jstNow.getUTCMonth();

  for (let i = months - 1; i >= 0; i--) {
    const d  = new Date(Date.UTC(nowYear, nowMonth - i, 1));
    const y  = d.getUTCFullYear();
    const mo = d.getUTCMonth();
    const monthStr = `${y}-${String(mo + 1).padStart(2, '0')}`;

    const seconds = sessions
      .filter(s => s.ended_at.slice(0, 7) === monthStr)
      .reduce((sum, s) => sum + s.duration_seconds, 0);

    result.push({ date: `${mo + 1}月`, seconds });
  }
  return result;
}

/** DB の plain JST 文字列から "YYYY-MM-DD" を返す */
function toJSTDateKey(isoStr) {
  return isoStr.slice(0, 10);
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
function renderBarChart(container, data, tab) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const oldWrap = container.querySelector('.chart-canvas-wrap');
  if (oldWrap) oldWrap.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'chart-canvas-wrap';
  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  const CHART_MAX  = tab === 'year' ? 100 * 3600 : tab === 'month' ? 50 * 3600 : 10 * 3600;
  const STEP_SIZE  = tab === 'year' ? 10 * 3600  : tab === 'month' ?  5 * 3600 :      3600;
  const gridColor  = 'rgba(187, 102, 255, 0.3)';
  const labelColor = '#f0f0ff';

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(d => d.date),
      datasets: [{
        data: data.map(d => d.seconds),
        backgroundColor: '#00dd66',
        borderWidth: 0,
        borderRadius: 2,
        barPercentage: 0.6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: CHART_MAX,
          grid:   { color: gridColor },
          border: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { size: 10 },
            stepSize: STEP_SIZE,
            callback: (val) => val > 0 ? (val / 3600) + 'h' : '',
          },
        },
        x: {
          grid:   { display: false },
          border: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { size: 9 },
            maxRotation: 0,
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0e0e2a',
          borderColor: '#00dd66',
          borderWidth: 1,
          titleColor: '#f0f0ff',
          bodyColor:  '#00dd66',
          callbacks: {
            label: (ctx) => ' ' + formatDuration(ctx.raw),
          },
        },
      },
    },
  });
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
 * モンスターのレベル/EXP/画像を累計セッション数から更新する
 * @param {number} totalSeconds - 全期間の合計秒数
 */
function updateMonsterStatus(totalSeconds) {
  const totalSessions = Math.floor(totalSeconds / WORK_RECORD_SECONDS);
  // level = floor(sqrt(sessions × 2.5))  → Lv50 = 1000sessions = 500h
  const level = Math.floor(Math.sqrt(totalSessions * 2.5));

  let stageIdx = 0;
  for (let i = MONSTER_STAGES.length - 1; i >= 0; i--) {
    if (level >= MONSTER_STAGES[i].minLevel) {
      stageIdx = i;
      break;
    }
  }

  const current = MONSTER_STAGES[stageIdx];
  appState.monsterImageKey = current.image;

  const lvEl     = document.getElementById('monster-lv');
  const expEl    = document.getElementById('monster-exp');
  const expBarEl = document.getElementById('monster-exp-bar');
  const imgEl    = document.getElementById('monster-img');
  const miniEl   = document.getElementById('timer-monster-mini-img');

  if (lvEl) lvEl.textContent = level;

  const imgSrc = `images/monster-${current.image}.png`;
  if (imgEl)  imgEl.src  = imgSrc;
  if (miniEl) miniEl.src = imgSrc;

  // sessions_for_level(L) = ceil(L² / 2.5) でEXPバーを計算
  const sessionsForCurrent = Math.ceil(level * level / 2.5);
  const sessionsForNext    = Math.ceil((level + 1) * (level + 1) / 2.5);
  const expInLevel = totalSessions - sessionsForCurrent;
  const expNeeded  = sessionsForNext - sessionsForCurrent;
  const expPct     = Math.floor(expInLevel / expNeeded * 100);
  if (expEl)    expEl.textContent    = `${expInLevel}/${expNeeded}`;
  if (expBarEl) expBarEl.style.width = `${expPct}%`;
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
