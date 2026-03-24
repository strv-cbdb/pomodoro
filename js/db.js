/**
 * js/db.js
 * IndexedDB によるログイン状態の管理
 *
 * 役割: ユーザー名の保存・取得・削除のみを行う。
 *       学習実績データは保存しない (それは Supabase の役割)。
 */

'use strict';

const _DB_NAME    = 'studyquest_auth';
const _DB_VERSION = 1;
const _STORE      = 'auth';
const _KEY        = 'username';

/**
 * IndexedDB を開く
 * @returns {Promise<IDBDatabase>}
 */
function _openAuthDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_DB_NAME, _DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_STORE)) {
        db.createObjectStore(_STORE);
      }
    };

    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * ユーザー名を IndexedDB に保存する
 * @param {string} username
 * @returns {Promise<void>}
 */
async function saveUsername(username) {
  const db = await _openAuthDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_STORE, 'readwrite');
    const req = tx.objectStore(_STORE).put(username, _KEY);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * IndexedDB からユーザー名を取得する
 * 未保存の場合は null を返す
 * @returns {Promise<string|null>}
 */
async function getUsername() {
  const db = await _openAuthDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_STORE, 'readonly');
    const req = tx.objectStore(_STORE).get(_KEY);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

/**
 * IndexedDB からユーザー名を削除する (利用者変更・ログアウト)
 * @returns {Promise<void>}
 */
async function clearUsername() {
  const db = await _openAuthDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_STORE, 'readwrite');
    const req = tx.objectStore(_STORE).delete(_KEY);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  });
}
