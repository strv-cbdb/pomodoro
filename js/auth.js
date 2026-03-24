/**
 * js/auth.js
 * ログイン / 利用者変更 / 認証ガード処理
 *
 * 依存: js/db.js (saveUsername, getUsername, clearUsername)
 */

'use strict';

/**
 * 現在ページでログイン必須チェックを行う
 * IndexedDB にユーザー名がなければ login.html へリダイレクトする
 *
 * @returns {Promise<string|null>} ユーザー名 (未ログインなら null でリダイレクト済み)
 */
async function requireAuth() {
  try {
    const username = await getUsername();
    if (!username) {
      window.location.href = './login.html';
      return null;
    }
    return username;
  } catch (err) {
    console.error('[auth] requireAuth error:', err);
    window.location.href = './login.html';
    return null;
  }
}

/**
 * ログインページ初期化
 * IndexedDB にユーザー名があれば timer.html へスキップする
 * なければログインフォームを表示する
 *
 * @param {string} formWrapperId  - フォームを含む要素の ID
 * @param {string} inputId        - ユーザー名 input の ID
 * @param {string} btnId          - 開始ボタンの ID
 * @param {string} errorId        - エラー表示要素の ID
 */
async function initLoginPage(formWrapperId, inputId, btnId, errorId) {
  // すでにログイン済みなら即タイマーへ
  try {
    const username = await getUsername();
    if (username) {
      window.location.href = './timer.html';
      return;
    }
  } catch (_) {
    // DB エラーは無視してフォームを表示
  }

  // フォームを表示する
  const wrapper = document.getElementById(formWrapperId);
  if (wrapper) wrapper.classList.remove('hidden');

  // ボタンクリック / Enter で送信
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  const errEl = document.getElementById(errorId);

  async function doLogin() {
    const username = (input?.value ?? '').trim();

    if (!username) {
      if (errEl) errEl.textContent = '名前を入力してください';
      return;
    }
    if (username.length > 20) {
      if (errEl) errEl.textContent = '名前は 20 文字以内にしてください';
      return;
    }
    // 基本的な文字チェック (XSS 対策の最低限)
    if (!/^[\w\u3040-\u9FFF\u30A0-\u30FF\-. ]+$/.test(username)) {
      if (errEl) errEl.textContent = '使用できない文字が含まれています';
      return;
    }

    try {
      await saveUsername(username);
      window.location.href = './timer.html';
    } catch (err) {
      console.error('[auth] login error:', err);
      if (errEl) errEl.textContent = 'エラーが発生しました。もう一度試してください。';
    }
  }

  btn?.addEventListener('click', doLogin);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin();
  });
}

/**
 * 利用者変更ボタンに共通ハンドラーをバインドする
 * IndexedDB を消去して login.html へ遷移する
 *
 * @param {string|NodeList} selector - ボタンのセレクタ文字列 または NodeList
 */
function bindChangeUserButton(selector) {
  const els = typeof selector === 'string'
    ? document.querySelectorAll(selector)
    : selector;

  els.forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await clearUsername();
      } catch (err) {
        console.error('[auth] clearUsername error:', err);
      }
      window.location.href = './login.html';
    });
  });
}
