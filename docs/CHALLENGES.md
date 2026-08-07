# 課題一覧

GTMでの実現方法はここには書きません（解答は `docs/ANSWERS.md`）。各課題は画面右下の採点パネルで自動判定されます。

## Lv1 — 基礎の再確認
1. **L1-01** 全ページで `page_view` が1回だけ飛ぶ
2. **L1-02** 外部ドメインへのリンククリックで `click`（`link_domain`, `link_url` 付き）
3. **L1-03** `/downloads/` のファイルDLで `file_download`（`file_extension`, `file_name` 付き）。外部リンクとは混同しないこと
4. **L1-04** スクロール90%到達で `scroll`（1ページにつき1回のみ）

## Lv2 — セレクタとDOM特定
5. **L2-01** トップページのヒーローCTAのみ `cta_click`（`cta_position: "hero"`）。フッターCTAでは飛ばさない
6. **L2-02** `/products/` の商品カードCTAで `select_item`（`item_id` をhrefのクエリから抽出、`item_name` を同カード内 `<h3>` から取得）
7. **L2-03** `/products/detail.html` の「カートに追加」で `add_to_cart`（`value` を「¥12,800（税込）」から数値12800に変換、`currency: "JPY"`、`item_id` をURLクエリから）

## Lv3 — 動的生成とAjax
8. **L3-01** `/contact/` の動的生成フォーム送信を捕捉し `generate_lead`（`form_id: "contact_main"`）
9. **L3-02** 上記のうち送信成功時のみ発火させる。`fail@example.com` での失敗時に発火したらFAIL
10. **L3-03** `/modal/` で、押されたトリガーボタンに応じて `form_start` の `form_location` を `"header"` / `"sidebar"` / `"footer"` で出し分ける（自動判定は enum チェックのみ。正しい対応関係はヒットログで手動確認すること）
11. **L3-04** `/embed/` のiframe内フォーム送信を親ページのコンテナで `generate_lead` として計測する

## Lv4 — 二重計上・冪等性
12. **L4-01** `/thanks/?tid=ORDER-123` で `purchase`（`transaction_id`, `value`, `currency`）。F5リロード・ブラウザバック・別タブで同じURLを開く、いずれでも2回目は発火しないこと
13. **L4-02** `tid` パラメータが無い状態での `/thanks/` 直アクセスでは `purchase` を発火させない
14. **L4-03** `/blog/` の `pushState` 遷移で `page_view` を追従させる。初回ロードと合わせて重複させない、かつブラウザバック時も欠落させない

## Lv5 — 応用
15. **L5-01** `/blog/` の記事を60秒以上閲覧したら `engaged_read`（記事切り替え時にタイマーをリセット）
16. **L5-02** 全サイト共通で、`page_view` に `content_group` を付与（URLパスの第1階層から導出）。**採点のため `ep.content_group` というカスタムパラメータとして送信すること**（GA4組み込みのcontent_groupフィールドではなく）。サイト側の実装変更は不要
17. **L5-03** Consent Mode v2 を導入し、同意前は `analytics_storage: denied`、同意ボタン押下後に `update` して、それまでのヒットが正しく抑制されることを確認
18. **L5-04** `/products/` の商品カードがビューポートに入った時に `view_item_list`（1カード1回のみ、無限スクロール追加分も対象）
