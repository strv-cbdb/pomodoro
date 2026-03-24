/**
 * supabase-config.js
 * Supabase 接続設定ファイル
 *
 * 使い方:
 *   1. Supabase プロジェクトの Settings > API から URL と anon key をコピー
 *   2. 下の SUPABASE_URL と SUPABASE_ANON_KEY を書き換える
 *   3. GitHub Pages にデプロイする (anon key は公開鍵なので公開リポジトリでも可)
 *
 * 注意:
 *   anon key はクライアント用の公開鍵です。
 *   secret key (service_role key) はここには絶対に書かないでください。
 */

const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
