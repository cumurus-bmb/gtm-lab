// site.js — 計測とは無関係な、サイトとして正当な共通処理のみを置く。
// dataLayer.pushはここでも一切行わない。
window.LabSite = (function () {
  function parsePriceToNumber(text) {
    var digits = String(text).replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  function updateCartBadge(delta) {
    var key = 'lab_cart_count';
    var count = parseInt(localStorage.getItem(key) || '0', 10) + delta;
    localStorage.setItem(key, String(count));
    var badgeEl = document.querySelector('header .badge');
    if (badgeEl) badgeEl.textContent = String(count);
  }

  function initConsentBanner() {
    var CONSENT_KEY = 'lab_consent_v1';
    if (localStorage.getItem(CONSENT_KEY) === 'granted') {
      window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
      if (window.LabGrader) window.LabGrader.setScenarioContext(null);
      return;
    }
    if (window.LabGrader) window.LabGrader.setScenarioContext('pre_consent');

    var bar = document.createElement('div');
    bar.className = 'box';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;background:#222;color:#fff;' +
      'padding:12px 16px;display:flex;justify-content:space-between;align-items:center;z-index:999998;font-size:13px;';
    bar.innerHTML = '<span class="item">このサイトは学習用にCookieを使用します。</span>';
    var btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = '同意する';
    btn.addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'granted');
      window.gtag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
      if (window.LabGrader) window.LabGrader.setScenarioContext(null);
      bar.remove();
    });
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initConsentBanner();
    var badgeEl = document.querySelector('header .badge');
    if (badgeEl) badgeEl.textContent = localStorage.getItem('lab_cart_count') || '0';
  });

  return {
    parsePriceToNumber: parsePriceToNumber,
    updateCartBadge: updateCartBadge,
    initConsentBanner: initConsentBanner
  };
})();
