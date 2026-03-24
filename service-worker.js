/**
 * service-worker.js
 * PWA 用 Service Worker
 *
 * 戦略:
 *   - アプリシェル (HTML / CSS / JS) はインストール時にキャッシュする
 *   - アプリシェルへのリクエスト: Cache First (キャッシュを優先、なければネット)
 *   - Supabase API へのリクエスト: Network Only (キャッシュしない)
 *   - ナビゲーションリクエストでキャッシュになければ login.html を返す
 *
 * キャッシュ更新:
 *   CACHE_VERSION を変更すると古いキャッシュが削除され新しいキャッシュが作られる
 */

'use strict';

const CACHE_VERSION = 'v1';
const CACHE_NAME    = `studyquest-${CACHE_VERSION}`;

/**
 * キャッシュ対象ファイル (アプリシェル)
 * パスはすべて SW ファイルからの相対パス
 */
const APP_SHELL = [
  './login.html',
  './timer.html',
  './monthly.html',
  './total.html',
  './footer.html',
  './style.css',
  './manifest.json',
  './js/supabase-config.js',
  './js/db.js',
  './js/app-common.js',
  './js/auth.js',
  './js/footer.js',
  './js/timer.js',
  './js/monthly.js',
  './js/total.js',
];

/* ============================================================
   インストールイベント: アプリシェルをキャッシュに追加
   ============================================================ */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] アプリシェルをキャッシュ中...');
      // addAll は1つでも失敗すると全部失敗するので、個別に catch する
      return Promise.allSettled(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] キャッシュ失敗: ${url}`, err);
          })
        )
      );
    }).then(() => {
      console.log('[SW] インストール完了');
      // 古い SW を待たずに即座にアクティブ化する
      return self.skipWaiting();
    })
  );
});

/* ============================================================
   アクティベートイベント: 古いキャッシュを削除
   ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] 古いキャッシュを削除:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[SW] アクティベート完了');
      // 既に開いているページをすぐに制御下に置く
      return self.clients.claim();
    })
  );
});

/* ============================================================
   フェッチイベント: リクエストに応じてキャッシュ戦略を適用
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ---- Supabase API: Network Only (絶対にキャッシュしない) ----
  if (url.hostname.endsWith('.supabase.co')) {
    // そのままネットワークへ (SW は介入しない)
    return;
  }

  // ---- GET リクエスト以外はスキップ ----
  if (event.request.method !== 'GET') {
    return;
  }

  // ---- アプリシェル: Cache First ----
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // キャッシュヒット: そのまま返す
        return cached;
      }

      // キャッシュミス: ネットワークから取得してキャッシュに追加
      return fetch(event.request)
        .then((response) => {
          // 正常なレスポンスだけキャッシュする
          if (response && response.status === 200 && response.type === 'basic') {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          // オフライン時にナビゲーションリクエストなら login.html を返す
          if (event.request.mode === 'navigate') {
            return caches.match('./login.html');
          }
          // それ以外は何も返さない (ブラウザのデフォルトエラーになる)
        });
    })
  );
});
