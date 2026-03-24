/**
 * js/app-common.js
 * 全ページ共通ユーティリティ
 *
 * 依存: js/supabase-config.js (SUPABASE_URL, SUPABASE_ANON_KEY)
 */

'use strict';

/* ============================================================
   フォーマット ユーティリティ
   ============================================================ */

/**
 * 秒数を "Xh Ym" 形式の文字列に変換する
 * @param {number} totalSeconds
 * @returns {string} e.g. "2h 30m" / "45m" / "0m"
 */
function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * 秒数を mm:ss 形式に変換する
 * @param {number} totalSeconds
 * @returns {string} e.g. "25:00"
 */
function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Date を "YYYY-MM-DD" (ローカル日付) に変換する
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
 * "YYYY-MM-DD" を "M/D" 形式に変換する
 * @param {string} dateKey
 * @returns {string} e.g. "5/1"
 */
function formatShortDate(dateKey) {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

/* ============================================================
   Supabase REST API 共通
   ============================================================ */

/**
 * Supabase の設定がプレースホルダーのままか確認する
 * @returns {boolean} 設定済みなら true
 */
function isSupabaseConfigured() {
  if (
    SUPABASE_URL      === 'https://YOUR_PROJECT_ID.supabase.co' ||
    SUPABASE_ANON_KEY === 'YOUR_ANON_KEY_HERE'
  ) {
    console.warn('[app-common] Supabase が未設定です。js/supabase-config.js を編集してください。');
    return false;
  }
  return true;
}

/**
 * Supabase REST API 用ヘッダーを返す
 * @returns {Object}
 */
function supabaseHeaders() {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type':  'application/json',
  };
}

/**
 * 学習セッションを Supabase に保存する
 * @param {string} username
 * @param {number} durationSeconds
 * @returns {Promise<boolean>} 成功なら true
 */
async function saveStudySession(username, durationSeconds) {
  if (!isSupabaseConfigured()) return false;

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_STUDY_SESSIONS}`, {
      method:  'POST',
      headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        username,
        duration_seconds: durationSeconds,
        ended_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      console.error('[app-common] saveStudySession:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[app-common] saveStudySession network error:', err);
    return false;
  }
}

/**
 * 過去 N 日分の学習セッションを取得する
 * @param {string} username
 * @param {number} days
 * @returns {Promise<Array<{ended_at: string, duration_seconds: number}>>}
 */
async function fetchRecentSessions(username, days = 31) {
  if (!isSupabaseConfigured()) return [];

  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const params = new URLSearchParams({
    username: `eq.${username}`,
    ended_at: `gte.${since.toISOString()}`,
    order:    'ended_at.asc',
    select:   'ended_at,duration_seconds',
  });

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_STUDY_SESSIONS}?${params}`,
      { method: 'GET', headers: supabaseHeaders() }
    );
    if (!res.ok) {
      console.error('[app-common] fetchRecentSessions:', res.status, await res.text());
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error('[app-common] fetchRecentSessions network error:', err);
    return [];
  }
}

/**
 * 全期間の学習セッションを取得する
 * @param {string} username
 * @returns {Promise<Array<{duration_seconds: number}>>}
 */
async function fetchAllSessions(username) {
  if (!isSupabaseConfigured()) return [];

  const params = new URLSearchParams({
    username: `eq.${username}`,
    select:   'duration_seconds',
  });

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE_STUDY_SESSIONS}?${params}`,
      { method: 'GET', headers: supabaseHeaders() }
    );
    if (!res.ok) {
      console.error('[app-common] fetchAllSessions:', res.status, await res.text());
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error('[app-common] fetchAllSessions network error:', err);
    return [];
  }
}

/* ============================================================
   PWA: Service Worker 登録
   ============================================================ */

/**
 * Service Worker を登録する
 * 各ページの末尾で呼び出す
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./service-worker.js')
        .then((reg) => console.log('[SW] 登録完了:', reg.scope))
        .catch((err) => console.error('[SW] 登録失敗:', err));
    });
  }
}
