/**
 * db.js - IndexedDB によるログイン状態管理
 *
 * 役割: ユーザー名の保存・取得・削除のみを担当する。
 *       学習実績データは保存しない (それは Supabase が担当)。
 *
 * 保存先: IndexedDB "studyquest_db" > objectStore "auth" > key "current_user"
 */

const DB_NAME    = 'studyquest_db';
const DB_VERSION = 1;
const STORE_NAME = 'auth';
const USER_KEY   = 'current_user';

/**
 * IndexedDB を開いて接続オブジェクトを返す
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      // objectStore が未作成なら作成する
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    req.onsuccess = (event) => resolve(event.target.result);
    req.onerror   = (event) => reject(event.target.error);
  });
}

/**
 * ユーザー名を IndexedDB に保存する
 * @param {string} username - 保存するユーザー名
 * @returns {Promise<void>}
 */
async function saveUsername(username) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.put(username, USER_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * IndexedDB からユーザー名を取得する
 * 未ログインの場合は null を返す
 * @returns {Promise<string|null>}
 */
async function getUsername() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.get(USER_KEY);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * IndexedDB からユーザー名を削除する (ログアウト / 利用者変更)
 * @returns {Promise<void>}
 */
async function clearUsername() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(USER_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}
