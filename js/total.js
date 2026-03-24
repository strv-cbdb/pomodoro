/**
 * js/total.js
 * 全期間ページ: 全学習時間の集計表示とモンスターエリアの管理
 *
 * 依存:
 *   js/supabase-config.js
 *   js/db.js
 *   js/app-common.js (fetchAllSessions, formatDuration)
 *   js/auth.js       (requireAuth, bindChangeUserButton)
 *   js/footer.js     (loadFooter)
 */

'use strict';

/* ============================================================
   初期化
   ============================================================ */

async function initTotalPage() {
  // 認証チェック
  const username = await requireAuth();
  if (!username) return;

  // ユーザー名表示
  const elUser = document.getElementById('status-username');
  if (elUser) elUser.textContent = username;

  // 利用者変更
  bindChangeUserButton('#change-user-btn');

  // フッター読み込み
  await loadFooter('total');

  // データ取得
  await loadTotalData(username);

  // Service Worker 登録
  registerServiceWorker();
}

/* ============================================================
   データ取得・表示
   ============================================================ */

async function loadTotalData(username) {
  const elTotal  = document.getElementById('total-duration');
  const elStatus = document.getElementById('total-status');

  if (elTotal) elTotal.textContent = '読込中...';

  try {
    const sessions   = await fetchAllSessions(username);
    const totalSecs  = sessions.reduce((s, r) => s + r.duration_seconds, 0);
    const totalPomodoros = Math.floor(totalSecs / (25 * 60));

    if (elTotal) elTotal.textContent = totalSecs > 0 ? formatDuration(totalSecs) : '0m';
    if (elStatus) elStatus.textContent = '';

    // モンスターステータスの仮計算
    updateMonsterStatus(totalPomodoros);

  } catch (err) {
    console.error('[total] loadTotalData error:', err);
    if (elTotal)  elTotal.textContent  = 'エラー';
    if (elStatus) elStatus.textContent = 'データの取得に失敗しました';
  }
}

/* ============================================================
   モンスターステータス (将来拡張用)

   ルール (仮):
     25分 = 1 ポモドーロ = 1 EXP
     10 EXP = 1 レベルアップ

   将来の拡張:
     - updateMonsterStatus() 内のレベル計算式を変更する
     - #monster-display-zone に SVG / 画像 / CSS アニメーションを挿入する
     - モンスターの成長段階に応じて CSS クラスを切り替える
   ============================================================ */

/**
 * ポモドーロ数からモンスターのステータスを計算して表示する
 * @param {number} totalPomodoros - 累計ポモドーロ数
 */
function updateMonsterStatus(totalPomodoros) {
  const level      = Math.floor(totalPomodoros / 10) + 1;
  const expInLevel = totalPomodoros % 10;
  const expPct     = expInLevel * 10; // 0-100%
  const lvPct      = Math.min(level * 10, 100); // 仮: Lv.10 で MAX

  // LV バー
  const elLv    = document.getElementById('monster-lv');
  const elLvBar = document.getElementById('monster-lv-bar');
  if (elLv)    elLv.textContent     = level;
  if (elLvBar) elLvBar.style.width  = `${lvPct}%`;

  // EXP バー
  const elExp    = document.getElementById('monster-exp');
  const elExpBar = document.getElementById('monster-exp-bar');
  if (elExp)    elExp.textContent    = `${expInLevel} / 10`;
  if (elExpBar) elExpBar.style.width = `${expPct}%`;

  // ポモドーロ合計
  const elPomodoros = document.getElementById('monster-pomodoros');
  if (elPomodoros) elPomodoros.textContent = `${totalPomodoros} 回`;

  /*
   * 将来: level に応じてモンスター画像を切り替える例
   *
   * const zone = document.getElementById('monster-display-zone');
   * if (zone) {
   *   zone.dataset.level = level;
   *   // CSS クラスや innerHTML を変更してモンスターを表示する
   * }
   */
}

/* ============================================================
   エントリーポイント
   ============================================================ */

document.addEventListener('DOMContentLoaded', initTotalPage);
