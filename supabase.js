/**
 * supabase.js - Supabase REST API 操作
 *
 * 役割: 学習セッションの保存・取得を担当する。
 *       Supabase JS SDK は使わず、fetch で直接 REST API を呼び出す。
 *       (外部 CDN 依存ゼロ)
 *
 * 前提: supabase-config.js が先に読み込まれていること
 *       (SUPABASE_URL, SUPABASE_ANON_KEY が定義済み)
 */

/** テーブル名 */
const TABLE = 'study_sessions';

/**
 * Supabase REST API 用の共通リクエストヘッダーを返す
 * @returns {Object}
 */
function getHeaders() {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
}

/**
 * Supabase の設定がプレースホルダーのままか確認する
 * 設定前の場合はコンソールに警告を出す
 * @returns {boolean} true なら設定済み
 */
function isConfigured() {
  if (
    SUPABASE_URL === 'https://YOUR_PROJECT_ID.supabase.co' ||
    SUPABASE_ANON_KEY === 'YOUR_ANON_KEY_HERE'
  ) {
    console.warn(
      '[supabase.js] Supabase の URL または anon key が未設定です。' +
      'supabase-config.js を編集してください。'
    );
    return false;
  }
  return true;
}

/**
 * 学習セッション (25分完了) を Supabase に保存する
 *
 * @param {string} username        - ユーザー名
 * @param {number} durationSeconds - セッション時間 (秒)。通常 1500 (25分)
 * @returns {Promise<boolean>} 保存成功なら true
 */
async function saveStudySession(username, durationSeconds = 1500) {
  if (!isConfigured()) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        ...getHeaders(),
        'Prefer': 'return=minimal', // レスポンスボディ不要
      },
      body: JSON.stringify({
        username:         username,
        duration_seconds: durationSeconds,
        ended_at:         new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('[supabase.js] saveStudySession error:', res.status, text);
      return false;
    }
    return true;

  } catch (err) {
    console.error('[supabase.js] saveStudySession network error:', err);
    return false;
  }
}

/**
 * 過去 31 日分の学習セッションを取得する
 * 日ごとの棒グラフ表示に使用する
 *
 * @param {string} username
 * @returns {Promise<Array<{ended_at: string, duration_seconds: number}>>}
 */
async function fetchLastMonthSessions(username) {
  if (!isConfigured()) return [];

  try {
    // 31 日前の 00:00:00 (ローカル時刻 → UTC)
    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const params = new URLSearchParams({
      username:  `eq.${username}`,
      ended_at:  `gte.${since.toISOString()}`,
      order:     'ended_at.asc',
      select:    'ended_at,duration_seconds',
    });

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${params}`,
      { method: 'GET', headers: getHeaders() }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('[supabase.js] fetchLastMonthSessions error:', res.status, text);
      return [];
    }
    return await res.json();

  } catch (err) {
    console.error('[supabase.js] fetchLastMonthSessions network error:', err);
    return [];
  }
}

/**
 * 全期間の学習セッションを取得する
 * 合計勉強時間の集計に使用する
 *
 * 注意: Supabase のデフォルト上限は 1000 件です。
 *       膨大な記録がある場合はページネーションが必要ですが、
 *       ポモドーロアプリの用途では通常問題ありません。
 *
 * @param {string} username
 * @returns {Promise<Array<{duration_seconds: number}>>}
 */
async function fetchAllTimeSessions(username) {
  if (!isConfigured()) return [];

  try {
    const params = new URLSearchParams({
      username: `eq.${username}`,
      select:   'duration_seconds',
    });

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?${params}`,
      { method: 'GET', headers: getHeaders() }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('[supabase.js] fetchAllTimeSessions error:', res.status, text);
      return [];
    }
    return await res.json();

  } catch (err) {
    console.error('[supabase.js] fetchAllTimeSessions network error:', err);
    return [];
  }
}
