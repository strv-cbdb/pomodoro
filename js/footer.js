/**
 * js/footer.js
 * footer.html を fetch して #footer-container に挿入する
 *
 * 使い方:
 *   各ページで loadFooter('timer') などページ名を渡して呼ぶ。
 *   ページ名は footer.html 内の [data-page] 属性と一致させる。
 */

'use strict';

/**
 * footer.html を読み込んで挿入し、現在ページのボタンをアクティブにする
 *
 * @param {'timer'|'monthly'|'total'} activePage - 現在のページ名
 */
async function loadFooter(activePage) {
  const container = document.getElementById('footer-container');
  if (!container) return;

  try {
    const res = await fetch('./footer.html');
    if (!res.ok) throw new Error(`footer fetch failed: ${res.status}`);

    const html = await res.text();
    container.innerHTML = html;

    // 現在ページのフッターボタンをアクティブ表示にする
    const activeBtn = container.querySelector(`.footer-nav-btn[data-page="${activePage}"]`);
    if (activeBtn) {
      activeBtn.classList.add('is-active');
      activeBtn.setAttribute('aria-current', 'page');
    }

  } catch (err) {
    console.error('[footer] loadFooter error:', err);
    // フッターが読み込めなくてもページ本体は動く
  }
}
