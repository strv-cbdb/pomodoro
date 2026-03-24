/**
 * js/timer.js
 * ポモドーロタイマーのロジック
 *
 * 依存:
 *   js/supabase-config.js  (TABLE_STUDY_SESSIONS 等)
 *   js/db.js               (getUsername)
 *   js/app-common.js       (saveStudySession, formatMMSS)
 *   js/auth.js             (requireAuth, bindChangeUserButton)
 *   js/footer.js           (loadFooter)
 */

'use strict';

/* ============================================================
   定数
   ============================================================ */

const WORK_SEC        = 25 * 60; // 1500
const SHORT_BREAK_SEC =  5 * 60; //  300
const LONG_BREAK_SEC  = 15 * 60; //  900
const SESSIONS_PER_CYCLE = 4;

const MODE_LABEL = {
  work:        'さぎょう中',
  short_break: '小休憩',
  long_break:  '大休憩',
};

/* ============================================================
   タイマー状態
   ============================================================ */

/** @type {'work'|'short_break'|'long_break'} */
let currentMode       = 'work';
let secondsLeft       = WORK_SEC;
let isRunning         = false;
let cycleCount        = 0;     // 現在サイクルで完了した作業セッション数 (0-3)
let hasStarted        = false; // 今のモードでタイマーを一度でも開始したか
let intervalId        = null;
let currentUsername   = null;

/* ============================================================
   DOM 要素参照
   ============================================================ */

let elDigits, elModeLabel, elSessionInfo, elDots, elMessage;
let btnStart, btnPause, btnReset, btnSkip;

/* ============================================================
   初期化
   ============================================================ */

async function initTimerPage() {
  // 認証チェック
  currentUsername = await requireAuth();
  if (!currentUsername) return;

  // DOM 要素を取得
  elDigits      = document.getElementById('timer-digits');
  elModeLabel   = document.getElementById('timer-mode-label');
  elSessionInfo = document.getElementById('info-session');
  elDots        = document.getElementById('session-dots');
  elMessage     = document.getElementById('timer-message');
  btnStart      = document.getElementById('cmd-start');
  btnPause      = document.getElementById('cmd-pause');
  btnReset      = document.getElementById('cmd-reset');
  btnSkip       = document.getElementById('cmd-skip');

  // ユーザー名表示
  const elUser = document.getElementById('status-username');
  if (elUser) elUser.textContent = currentUsername;

  // 利用者変更ボタン
  bindChangeUserButton('#change-user-btn');

  // コマンドボタンのイベント
  btnStart?.addEventListener('click', startTimer);
  btnPause?.addEventListener('click', pauseTimer);
  btnReset?.addEventListener('click', resetTimer);
  btnSkip?.addEventListener('click',  skipTimer);

  // 初期描画
  renderDisplay();
  renderDots();

  // フッター読み込み
  await loadFooter('timer');

  // Service Worker 登録
  registerServiceWorker();
}

/* ============================================================
   表示更新
   ============================================================ */

function renderDisplay() {
  if (elDigits)    elDigits.textContent    = formatMMSS(secondsLeft);
  if (elModeLabel) elModeLabel.textContent = `[ ${MODE_LABEL[currentMode]} ]`;
  document.title = `${formatMMSS(secondsLeft)} - STUDY QUEST`;
}

function renderDots() {
  if (!elDots) return;
  const dots = elDots.querySelectorAll('.session-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('session-dot--filled', i < cycleCount);
  });
  if (elSessionInfo) {
    elSessionInfo.textContent = `${cycleCount} / ${SESSIONS_PER_CYCLE}`;
  }
}

/**
 * 開始ボタンのラベルを切り替える (開始 / 再開)
 */
function renderStartBtn() {
  if (!btnStart) return;
  btnStart.textContent = hasStarted ? '再開' : '開始';
}

/**
 * メッセージを表示する
 * @param {string} text
 * @param {'ok'|'warn'|'info'} type
 */
function showMessage(text, type = 'info') {
  if (!elMessage) return;
  elMessage.textContent = text;
  elMessage.className   = `timer-message timer-message--${type}`;
  elMessage.classList.remove('hidden');
}

function hideMessage() {
  elMessage?.classList.add('hidden');
}

/* ============================================================
   タイマー操作
   ============================================================ */

function startTimer() {
  if (isRunning) return;
  isRunning  = true;
  hasStarted = true;

  btnStart?.classList.add('hidden');
  btnPause?.classList.remove('hidden');

  intervalId = setInterval(() => {
    if (secondsLeft <= 0) {
      onTimerComplete();
      return;
    }
    secondsLeft--;
    renderDisplay();
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(intervalId);
  intervalId = null;

  btnPause?.classList.add('hidden');
  btnStart?.classList.remove('hidden');
  renderStartBtn();
}

function resetTimer() {
  pauseTimer();
  secondsLeft = getDuration(currentMode);
  hasStarted  = false;
  renderDisplay();
  renderStartBtn();
  hideMessage();
}

function skipTimer() {
  pauseTimer();
  // 作業中スキップ: 休憩へ進む (セッション数は変えない = 未完了)
  // 休憩中スキップ: 作業へ戻る
  const next = currentMode === 'work' ? 'short_break' : 'work';
  if (currentMode === 'long_break') cycleCount = 0;
  switchMode(next);
}

/** @returns {number} モードに対応する秒数 */
function getDuration(mode) {
  switch (mode) {
    case 'work':        return WORK_SEC;
    case 'short_break': return SHORT_BREAK_SEC;
    case 'long_break':  return LONG_BREAK_SEC;
    default:            return WORK_SEC;
  }
}

/**
 * モードを切り替えてタイマーをリセット状態にする
 * @param {'work'|'short_break'|'long_break'} newMode
 */
function switchMode(newMode) {
  currentMode = newMode;
  secondsLeft = getDuration(newMode);
  hasStarted  = false;

  btnPause?.classList.add('hidden');
  btnStart?.classList.remove('hidden');
  renderDisplay();
  renderStartBtn();
}

/* ============================================================
   タイマー完了処理
   ============================================================ */

async function onTimerComplete() {
  clearInterval(intervalId);
  intervalId = null;
  isRunning   = false;
  secondsLeft = 0;
  hasStarted  = false;

  btnPause?.classList.add('hidden');
  btnStart?.classList.remove('hidden');
  renderDisplay();
  renderStartBtn();

  if (currentMode === 'work') {
    // ---- 作業完了 ----
    showMessage('さぎょう完了! 記録を保存しています...', 'info');

    const ok = await saveStudySession(currentUsername, WORK_SEC);

    if (ok) {
      showMessage('さぎょう完了! 記録を保存しました。', 'ok');
    } else {
      showMessage('さぎょう完了! (保存に失敗しました)', 'warn');
    }

    // サイクル進捗を更新
    cycleCount++;
    renderDots();

    const nextMode = cycleCount >= SESSIONS_PER_CYCLE ? 'long_break' : 'short_break';
    if (cycleCount >= SESSIONS_PER_CYCLE) cycleCount = 0;

    // 2 秒後に次のモードへ自動切り替え
    setTimeout(() => {
      hideMessage();
      switchMode(nextMode);
      renderDots();
    }, 2000);

  } else {
    // ---- 休憩完了 ----
    showMessage('休憩終了! さぎょうを開始してください。', 'info');
    setTimeout(() => {
      hideMessage();
      switchMode('work');
    }, 2000);
  }
}

/* ============================================================
   エントリーポイント
   ============================================================ */

document.addEventListener('DOMContentLoaded', initTimerPage);
