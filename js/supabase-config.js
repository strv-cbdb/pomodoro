/**
 * js/supabase-config.js
 * Supabase 接続設定
 *
 * このファイルだけ書き換えれば接続先を変更できます。
 * anon key はクライアント公開鍵です。service_role key は絶対に書かないでください。
 */

const SUPABASE_URL      = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';

/** テーブル名 */
const TABLE_STUDY_SESSIONS = 'study_sessions';
