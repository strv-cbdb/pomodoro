/**
 * js/monthly.js
 * 過去1か月ページ: Supabase から学習データを取得し横棒グラフを描画する
 *
 * 依存:
 *   js/supabase-config.js
 *   js/db.js
 *   js/app-common.js (fetchRecentSessions, formatDuration, toLocalDateKey, formatShortDate)
 *   js/auth.js       (requireAuth, bindChangeUserButton)
 *   js/footer.js     (loadFooter)
 */

'use strict';

/* ============================================================
   初期化
   ============================================================ */

async function initMonthlyPage() {
  // 認証チェック
  const username = await requireAuth();
  if (!username) return;

  // ユーザー名表示
  const elUser = document.getElementById('status-username');
  if (elUser) elUser.textContent = username;

  // 利用者変更
  bindChangeUserButton('#change-user-btn');

  // フッター読み込み
  await loadFooter('monthly');

  // データ取得と描画
  await loadChartData(username);

  // Service Worker 登録
  registerServiceWorker();
}

/* ============================================================
   データ取得・集計
   ============================================================ */

async function loadChartData(username) {
  const elTotal   = document.getElementById('monthly-total');
  const elStatus  = document.getElementById('chart-status');
  const chartArea = document.getElementById('chart-area');

  if (elStatus) elStatus.textContent = 'データを取得中...';

  try {
    const sessions = await fetchRecentSessions(username, 31);

    // 日ごとに集計 (過去31日分、データのない日は 0)
    const daily = aggregateByDay(sessions, 31);

    // 合計
    const totalSecs = sessions.reduce((s, r) => s + r.duration_seconds, 0);
    if (elTotal) elTotal.textContent = formatDuration(totalSecs);

    if (elStatus) elStatus.textContent = '';

    // グラフ描画
    renderHorizontalChart(chartArea, daily);

  } catch (err) {
    console.error('[monthly] loadChartData error:', err);
    if (elStatus) elStatus.textContent = 'データの取得に失敗しました';
  }
}

/**
 * セッションを日ごとに集計する
 * 過去 N 日分のキーを 0 で初期化してから積算する
 *
 * @param {Array<{ended_at: string, duration_seconds: number}>} sessions
 * @param {number} days
 * @returns {Array<{date: string, seconds: number}>} 日付昇順
 */
function aggregateByDay(sessions, days) {
  const map = {};

  // 過去 N 日分のキーを 0 で初期化
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    map[toLocalDateKey(d)] = 0;
  }

  // セッションを日付ごとに加算
  sessions.forEach((s) => {
    const key = toLocalDateKey(new Date(s.ended_at));
    if (key in map) {
      map[key] += s.duration_seconds;
    }
  });

  return Object.entries(map).map(([date, seconds]) => ({ date, seconds }));
}

/* ============================================================
   横棒グラフ描画 (RPGステータス画面風)
   外部ライブラリ不使用、HTML/CSS/JS のみ
   ============================================================ */

/**
 * 横棒グラフを描画する
 * 各行: [日付] [====バー====] [時間]
 *
 * @param {HTMLElement} container
 * @param {Array<{date: string, seconds: number}>} data
 */
function renderHorizontalChart(container, data) {
  if (!container) return;
  container.innerHTML = '';

  const maxSeconds = Math.max(...data.map((d) => d.seconds), 1);

  data.forEach(({ date, seconds }) => {
    const pct    = (seconds / maxSeconds) * 100;
    const label  = formatShortDate(date);
    const durStr = seconds > 0 ? formatDuration(seconds) : '-';

    // 行要素
    const row = document.createElement('div');
    row.className = 'chart-row';

    // 日付ラベル
    const dateEl = document.createElement('span');
    dateEl.className   = 'chart-date';
    dateEl.textContent = label;

    // バートラック
    const track = document.createElement('div');
    track.className = 'chart-track';

    // バー本体
    const fill = document.createElement('div');
    fill.className = seconds > 0 ? 'chart-fill' : 'chart-fill chart-fill--zero';
    fill.style.width = `${pct}%`;

    track.appendChild(fill);

    // 時間ラベル
    const durEl = document.createElement('span');
    durEl.className   = 'chart-dur';
    durEl.textContent = durStr;

    row.appendChild(dateEl);
    row.appendChild(track);
    row.appendChild(durEl);
    container.appendChild(row);
  });
}

/* ============================================================
   エントリーポイント
   ============================================================ */

document.addEventListener('DOMContentLoaded', initMonthlyPage);
