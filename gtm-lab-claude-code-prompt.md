# GTM実践学習ラボ 構築依頼（Claude Code向け指示文）

## 0. あなたへの依頼概要

Google Tag Manager（クライアントサイド）を実務レベルで訓練するための、
**自己採点機能つき練習用Webサイト**を新規リポジトリとして構築してください。

学習者（私）はフルスタックエンジニアです。GTMの基礎は知っていますが、
「意地の悪いDOM」「動的生成要素」「二重計上」といった実務でハマる部分を
手を動かして再訓練したい、というのが目的です。

**最重要方針: サイト側は「わざと計測しにくく」作ること。**
親切なdata属性やユニークIDを用意してはいけません。

---

## 1. 技術要件

- 依存を増やさない。**Vanilla JS + 静的HTML/CSS**のみ。ビルド工程なし。
- 配信は `nginx:alpine` を Docker Compose で。`http://localhost:8080` で起動。
- 同じ `site/` ディレクトリをそのまま ConoHa Wing にアップロードすれば動くこと
  （相対パス厳守。絶対パスやルート基準の `/assets/...` は使わない）。
- Node.js 実行環境やパッケージマネージャは使わない。
- 対応ブラウザは最新Chromeのみでよい。

### ディレクトリ構成

```
gtm-lab/
├── docker-compose.yml
├── nginx/default.conf
├── deploy.sh                 # ConoHa Wingへのlftp同期スクリプト
├── README.md
├── docs/
│   ├── CHALLENGES.md         # 課題一覧（問題文）
│   ├── VERIFICATION.md       # GTM Preview / GA4 DebugView での検証手順
│   └── ANSWERS.md            # 解答編（GTMの設定手順・JSスニペット）
└── site/
    ├── index.html
    ├── config.js             # GTM_ID等の設定をここに集約
    ├── assets/
    │   ├── style.css
    │   ├── lab-grader.js     # 採点エンジン（GTMスニペットより前に読み込む）
    │   ├── challenges.js     # 課題定義（アサーション仕様）
    │   └── site.js           # サイト本体の挙動（動的DOM生成など）
    ├── products/
    │   ├── index.html
    │   └── detail.html
    ├── contact/index.html
    ├── thanks/index.html
    ├── blog/index.html
    ├── modal/index.html
    ├── embed/index.html      # 同一オリジンiframeフォーム
    ├── embed/form.html
    ├── downloads/index.html
    ├── robots.txt            # Disallow: /
    └── 404.html
```

---

## 2. 採点エンジン `lab-grader.js` の仕様（最重要・最初に実装）

### 2.1 基本方針

GTMの設定内容は一切参照しない。
**実際にネットワークへ送出されたGA4ヒットを傍受して仕様と突き合わせる。**
学習者がGTMをどう組もうが自由で、「結果として正しいヒットが飛んだか」だけを見る。

### 2.2 傍受の実装

`config.js` と `lab-grader.js` は **必ずGTMスニペットより前** に `<head>` 内で
同期読み込みする。理由: GTMがロードされる前にネットワークAPIへパッチを当てる必要があるため。

パッチ対象（すべて。GA4はブラウザ状況によって送出方式を切り替えるため）:

1. `navigator.sendBeacon`
2. `window.fetch`
3. `XMLHttpRequest.prototype.open` / `.send`
4. `Image` の `src` setter（`new Image().src = ...` 経由のヒット）

捕捉対象URL:

- `https://*.google-analytics.com/g/collect`
- `https://*.analytics.google.com/g/collect`
- `https://www.googletagmanager.com/gtm.js`（ロード検知用。採点には使わない）

**必ず元の関数を呼び出して処理を継続すること。**傍受はあくまで観測であり、
GA4 DebugViewやGTM Previewが並行して正常動作しなければならない。

### 2.3 ヒットのパース

GA4のMeasurement Protocol互換パラメータをクエリ文字列（およびPOSTボディ、
バッチ送出時は改行区切りの複数行）からパースして、以下の正規化オブジェクトを作る。

```js
{
  ts: 1730000000000,
  tid: 'G-XXXXXXX',      // 測定ID
  cid: '123.456',        // クライアントID
  sid: '1730000000',     // セッションID
  event: 'generate_lead',// en=
  params: {              // ep.* (文字列) と epn.* (数値) をマージ
    form_id: 'contact_main',
    value: 12800
  },
  page: { dl: '...', dt: '...' },  // dl=location, dt=title
  raw: '...'             // 元クエリ文字列
}
```

**バッチ送出（`/g/collect?...` にPOSTで複数イベントがまとまる）に必ず対応すること。**
ここを取りこぼすと採点が不正確になる。

### 2.4 課題定義のスキーマ（`challenges.js`）

```js
{
  id: 'L3-02',
  level: 3,
  page: '/contact/',           // この課題の対象ページ
  title: 'Ajax送信フォームの成功時のみ計測する',
  brief: '問題文（学習者に表示）',
  constraints: [
    'フォームはJSで動的生成されるため gtm.formSubmit トリガーは発火しない',
    '送信失敗時（メールアドレス欄に fail@example.com を入力）は計測してはならない'
  ],
  expect: {
    event: 'generate_lead',
    params: {
      form_id: { equals: 'contact_main' },
      form_destination: { matches: '^https?://' },
      value: { type: 'number', gte: 1 }
    },
    count: { exactly: 1 },       // 判定ウィンドウ内での発火回数
    window_ms: 5000
  },
  forbid: [
    { event: 'generate_lead', when: 'submit_failed' }  // 失敗シナリオで飛んだらNG
  ],
  scenario: {                    // 採点パネルから実行できる自動シナリオ（任意）
    steps: ['fill_form', 'click_submit']
  }
}
```

判定オペレータは最低限 `equals` / `matches`(正規表現) / `type` / `gte` / `lte` /
`one_of` / `exists` を実装すること。

### 2.5 二重計上の検出（Lv4で必須）

以下を独立した検査項目として実装する。

- 同一 `params.transaction_id` を持つ `purchase` / `generate_lead` が
  **ブラウザセッションをまたいで**2回以上飛んだら FAIL
  （`localStorage` に送出済みIDを記録し、リロード後も保持して検査する）
- 同一 `event` + 同一パラメータ一式が 500ms 以内に複数回飛んだら
  「重複疑い」として WARN 表示

### 2.6 採点パネルUI

画面右下に折りたたみ式のフローティングパネル。

- **現在ページの課題リスト**: PASS(緑) / FAIL(赤) / 未着手(灰)
- **失敗理由の明示**: 「`en=generate_lead` は受信したが `ep.form_id` が
  `undefined`（期待: `contact_main`）」のように、期待値と実測値を並べて表示
- **ヒットログ**: 傍受した全GA4ヒットを時系列表示。クリックで全パラメータ展開
- **リセットボタン**: そのページの判定状態をクリア
- **全体進捗**: 何問中何問クリアか。`localStorage` に永続化
- **エクスポート**: 判定結果とヒットログをJSONでクリップボードにコピー

`config.js` の `LAB_GRADER_ENABLED = false` で完全に無効化できること
（採点補助なしで実力チェックするモード）。

---

## 3. 練習用サイトの構造（わざと計測しにくく作る）

以下は**すべて意図的な設計**です。「親切にする」リファクタリングは絶対にしないでください。

### 3.1 全ページ共通

- ヘッダー/フッターは各HTMLに直書き（JSでの共通化はしない）
- `id` 属性は**一切使わない**
- クラス名は汎用的かつ重複させる: `.btn`, `.card`, `.link`, `.item`, `.box`
- `data-*` 属性による計測用ヒントは**用意しない**
- `dataLayer` の初期化のみ `config.js` で行うが、
  **カスタムイベントのpushはサイト側では一切しない**（学習者がGTM側で頑張る）

### 3.2 各ページの意地悪ポイント

| ページ | 実装内容 |
|---|---|
| `/` | ヒーローCTAとフッターCTAが**同一の `class="btn btn-primary"`、同一テキスト「無料で試す」**。片方だけ計測させる |
| `/products/` | 商品カード12枚。すべて `class="card"`。カード内CTAも全部同じclass。商品名は `<h3>` のテキストのみ、SKUは詳細ページへの `href` のクエリにのみ存在 |
| `/products/detail.html` | 価格は `<span class="price">¥12,800（税込）</span>` のテキストのみ。数値化してGA4の `value` に送る訓練。SKUは `?sku=` から取得。**「カートに追加」は`<button>`でhref無し、押すとJSでヘッダーのバッジ数字だけが変わる**（DOM変化を捉える必要あり） |
| `/contact/` | フォームは `DOMContentLoaded` から **800ms後にJSで動的生成**（`gtm.formSubmit`トリガーが効かない）。送信は `fetch` でモック。成功時はURLを変えずにフォーム部分をサンクスDOMに差し替え。**`fail@example.com` を入れると失敗レスポンスを返し、エラーメッセージを表示する**（この時は計測してはいけない） |
| `/thanks/` | 直接URLアクセス可能。クエリ `?tid=` があってもなくても表示される。**リロードで素直に組むと二重計上する**。`tid` が無い場合の扱いも学習者に判断させる |
| `/blog/` | 記事一覧を無限スクロールで追加読み込み。記事クリックで `history.pushState` により URLだけ `/blog/?post=xx` に変化し、コンテンツをJS差し替え（**SPA的page_view制御の訓練**）。ブラウザバックにも対応させる |
| `/modal/` | 「資料請求」ボタンが3箇所。押すとモーダルが開くが、**3つのモーダル内フォームはすべて同一のDOM構造・同一class**。どのボタン起点かはDOM上に痕跡を残さない（開いた瞬間のグローバル状態にも残さない）。→ クリック側とフォーム側の関連付けを工夫する必要がある |
| `/embed/` | 同一オリジンの `<iframe src="form.html">` 内にフォーム。**iframe内では別コンテナ扱いになる問題**を体験させる（`postMessage` 連携やiframe内へのGTM配置を検討させる） |
| `/downloads/` | PDF/XLSX/ZIPへのリンクが20本。すべて `class="link"`。ファイル名は日本語URLエンコード込み。`href` からのみ拡張子が判別可能。**うち3本は外部ドメインへのリンク**（外部リンク計測と混ざる） |

### 3.3 ダミーファイル

`/downloads/files/` 配下に、1KB程度のダミーPDF/XLSX/ZIPを実際に配置すること
（リンク切れだとダウンロード計測の検証にならない）。

---

## 4. 課題セット（`docs/CHALLENGES.md` と `challenges.js` に落とし込む）

各課題は「目標イベント名」「必須パラメータ」「制約」「禁止事項」を明記する。
**GTMでの実現方法は書かない**（それは `ANSWERS.md` 側）。

### Lv1 — 基礎の再確認
1. 全ページで `page_view` が1回だけ飛ぶ
2. 外部ドメインへのリンククリックで `click`（`link_domain`, `link_url` 付き）
3. `/downloads/` のファイルDLで `file_download`（`file_extension`, `file_name` 付き）。外部リンクとは混同しないこと
4. スクロール90%到達で `scroll`（1ページにつき1回のみ）

### Lv2 — セレクタとDOM特定
5. トップページの**ヒーローCTAのみ** `cta_click`（`cta_position: "hero"`）。フッターCTAでは飛ばさない
6. `/products/` の商品カードCTAで `select_item`（`item_id` をhrefのクエリから抽出、`item_name` を同カード内 `<h3>` から取得）。**カードは12枚あるが、押されたカードの情報だけを送る**
7. `/products/detail.html` の「カートに追加」で `add_to_cart`（`value` を `¥12,800（税込）` から数値 `12800` に変換、`currency: "JPY"`、`item_id` をURLクエリから）

### Lv3 — 動的生成とAjax
8. `/contact/` の動的生成フォーム送信を捕捉し `generate_lead`（`form_id: "contact_main"`）
9. 上記のうち**送信成功時のみ**発火させる。`fail@example.com` での失敗時に発火したらFAIL
10. `/modal/` で、押されたトリガーボタンに応じて `form_start` の `form_location` を
    `"header"` / `"sidebar"` / `"footer"` で出し分ける
11. `/embed/` のiframe内フォーム送信を親ページのコンテナで `generate_lead` として計測する

### Lv4 — 二重計上・冪等性
12. `/thanks/?tid=ORDER-123` で `purchase`（`transaction_id`, `value`, `currency`）。
    **F5リロード・ブラウザバック・別タブで同じURLを開く、いずれでも2回目は発火しないこと**
13. `tid` パラメータが無い状態での `/thanks/` 直アクセスでは `purchase` を発火させない
14. `/blog/` の `pushState` 遷移で `page_view` を追従させる。ただし
    **初回ロードと合わせて重複させない**、かつブラウザバック時も欠落させない

### Lv5 — 応用
15. `/blog/` の記事を60秒以上閲覧したら `engaged_read`（記事切り替え時にタイマーをリセット）
16. 全サイト共通で、`page_view` に `content_group` を付与（URLパスの第1階層から導出）
17. Consent Mode v2 を導入し、同意前は `analytics_storage: denied`、
    同意ボタン押下後に `update` して、それまでのヒットが正しく再送/抑制されることを確認
18. `/products/` の商品カードが**ビューポートに入った時**に `view_item_list`
    （1カード1回のみ、無限スクロール追加分も対象）

---

## 5. ドキュメント

### `README.md`
- 前提（Docker、GTMコンテナ、GA4プロパティ）
- 起動手順（`docker compose up -d` → `http://localhost:8080`）
- `site/config.js` にGTMコンテナIDとGA4測定IDを設定する手順
- ConoHa Wingへのデプロイ手順（サブドメイン作成 → `deploy.sh` 実行）
- **公開時の注意**: `robots.txt` で `Disallow: /`、全ページに `<meta name="robots" content="noindex,nofollow">`、
  可能ならBasic認証も設定すること（練習用のダミーサイトを検索インデックスさせない）
- 採点パネルの使い方

### `docs/VERIFICATION.md`
GTM Preview（Tag Assistant）、GA4 DebugView、採点パネルの3点セットで
どう検証を進めるかのワークフロー。`localhost` 環境でGA4 DebugViewを使うための
`debug_mode` パラメータの扱いも記載。

### `docs/ANSWERS.md`
各課題の解答。**GTMの具体的な設定手順**（トリガータイプ、変数の種類、
カスタムJS変数のコード、CSSセレクタ）と、なぜその方法を選ぶのかの理由を記載。
冒頭に「先に自力で解くこと」の注意書きと、目次からの折りたたみを入れる。

---

## 6. `deploy.sh`

ConoHa Wing へ FTPS で同期するスクリプト。

- `lftp` の `mirror -R --delete --verbose` を使用
- 接続情報は `.env`（`.gitignore` 済み）から読み込む: `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_REMOTE_DIR`
- `--dry-run` オプションを付けたら実際には転送せず差分だけ表示する
- 転送前に `site/config.js` が本番用のGTM IDになっているか確認プロンプトを出す

---

## 7. 実装の進め方

以下の順で進め、各ステップ完了時に一度動作確認できる状態にしてください。

1. Docker + nginx + 最小のHTML1枚 → `localhost:8080` で表示確認
2. `lab-grader.js` の傍受・パース・パネルUI（この時点でGA4ヒットが読めること）
3. `challenges.js` のアサーションエンジン
4. 各ページのHTML/JS（Lv1〜Lv2相当のページから）
5. 残りのページ（動的フォーム、SPA、モーダル、iframe）
6. 全課題定義の投入
7. ドキュメント3点 + `deploy.sh`

**ステップ2が完成した時点で一度止めて、私に動作確認させてください。**
採点エンジンが正しくヒットを拾えるかがこのプロジェクトの成否を決めるためです。
