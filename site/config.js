// config.js — GTM/GA4設定とdataLayer初期化のみを行う。
// カスタムイベントのdataLayer.pushはここでは絶対に行わない（学習者がGTM側で実装する）。

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

window.LAB_CONFIG = {
  GTM_ID: 'GTM-XXXXXXX',              // 自分のGTMコンテナIDに書き換える
  GA4_MEASUREMENT_ID: 'G-XXXXXXXXXX', // 自分のGA4測定IDに書き換える（表示用。計測経路自体はGTM）
  LAB_GRADER_ENABLED: true            // false で採点パネル・傍受を完全無効化
};

// Consent Mode v2: 同意前はデフォルトで拒否。gtag未ロードでもキューされる。
window.gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
