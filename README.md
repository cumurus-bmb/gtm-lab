# GTM/GA4 計測ラボ

Google Tag Manager（GTM）と GA4 の計測実装を練習するための、自己完結型のダミーECサイトです。動的フォーム、iframe、SPA風ページ遷移、二重送信の罠、Consent Mode v2 など、実務でつまずきやすいシナリオを18の課題として用意しています。

サイトにはブラウザが実際に送信する GA4 ヒット（`/g/collect`）を横取りして各課題の合否をその場で判定する**採点パネル**が組み込まれています。GTM側の管理画面での作業とタグの再公開だけで、ページのHTML/JSは一切変更せずに進められます（ビルドステップもNode.jsも不要です）。

## 前提条件

- Docker / Docker Compose
- 自分の GTM コンテナ（Web用）
- 自分の GA4 プロパティと測定ID

## 起動方法

```bash
docker compose up -d
```

`site/` ディレクトリを nginx（`nginx:alpine`）でそのまま配信します。ビルドは行われず、`site/` の中身が読み取り専用でマウントされるだけなので、ファイルを編集してブラウザをリロードすればすぐ反映されます。

起動後、ブラウザで [http://localhost:8080](http://localhost:8080) を開いてください。

停止する場合:

```bash
docker compose down
```

## `site/config.js` の設定

自分のGTMコンテナ・GA4プロパティに対して計測を試すには、`site/config.js` を編集して自分のIDに書き換えます。

```js
window.LAB_CONFIG = {
  GTM_ID: 'GTM-XXXXXXX',              // 自分のGTMコンテナID
  GA4_MEASUREMENT_ID: 'G-XXXXXXXXXX', // 自分のGA4測定ID（表示用。計測経路自体はGTM経由）
  LAB_GRADER_ENABLED: true            // false にすると採点パネル・ヒット傍受を完全無効化
};
```

リポジトリにコミットされている `site/config.js` は上記のようなプレースホルダー値のままです。**自分の実IDへの書き換えは、あくまでローカル専用の変更として扱ってください。**コミットしてリモートに共有してはいけません。なお `site/config.js` は `.gitignore` の対象にはなっていない（テンプレートとしてプレースホルダー入りの状態をコミットする方針の）ファイルなので、実IDに書き換えた後に誤って `git add`/`git commit` しないよう注意してください。

## ConoHa Wing への公開

1. ConoHa Wing の管理画面で、このラボ用のサブドメインを作成します。
2. `.env.example` を `.env` にコピーし、FTP接続情報（`FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_REMOTE_DIR`）を実際の値で埋めます（`.env` は `.gitignore` 済みでコミットされません）。
3. 以下を実行して `site/` をそのまま同期します。

```bash
./deploy.sh
```

`deploy.sh` は `lftp` の `mirror -R --delete --verbose` でFTPS同期を行います。実際に転送する前に、意図せぬ差分がないか `--dry-run` オプションで確認できます。

```bash
./deploy.sh --dry-run
```

`site/` 内はすべて相対パスで構成されています（絶対パス `/assets/...` は使われていません）。そのため多くの場合サブディレクトリ配下への配置でも動作しますが、実際の到達可否はnginx等のホスティング側の設定にも依存するため、公開後は主要なリンク・アセット読み込みを一通りブラウザで確認してください。

### 公開時の注意

このサイトは**検索エンジンにインデックスさせてはいけない練習用のダミーサイト**です。次の対策が入っていることを確認し、可能であればホスティング側でさらに強化してください。

- `robots.txt` はすでにサイト全体を `Disallow: /` にしています。
- 全ページの `<head>` に `<meta name="robots" content="noindex,nofollow">` が入っています。
- 上記はクローラーの自主的な協力に依存する対策なので、**ConoHa Wingのホスティング側でBasic認証を追加設定することを強く推奨します。** 検索インデックスからの隔離だけでなく、第三者が偶然アクセスしてダミーの決済/フォームページを操作してしまうことも防げます。

## 採点パネルの使い方

各ページの右下に採点パネルが表示されます（`LAB_GRADER_ENABLED: true` の場合のみ）。

- **ヘッダー部分（`採点パネル (n/合計)`）をクリック** — パネルの折りたたみ/展開を切り替えます。
- **課題一覧** — そのページに紐づく課題ごとに `PASS` / `FAIL` / `…`（判定待ち）が表示されます。行にマウスを乗せると判定理由（ツールチップ）が見られます。
- **ヒットログ** — 実際に送信されたGA4ヒットが新しい順に並びます。各行をクリックすると、そのヒットの正規化済みJSON（イベント名・パラメータ・コンテキストなど）が展開表示されます。
- **「このページをリセット」ボタン** — 現在のページに紐づく課題の進捗（`localStorage` に保存されている合否）だけを消去し、再判定できる状態に戻します。
- **「エクスポート」ボタン** — 現在の進捗とヒットログをJSONとしてクリップボードにコピーします。

採点パネルを完全に無効化したい場合は、`site/config.js` の `LAB_GRADER_ENABLED` を `false` にしてください。ヒットの傍受・パネル描画の両方が止まり、コンソールエラーも出ません。

## もっと詳しく

- 課題の一覧と合否条件: [`docs/CHALLENGES.md`](docs/CHALLENGES.md)
- 解答例（先に自力で解いてから読むこと）: [`docs/ANSWERS.md`](docs/ANSWERS.md)
- GTM Preview / GA4 DebugView / 採点パネルを使った検証手順: [`docs/VERIFICATION.md`](docs/VERIFICATION.md)

AIエージェント（Claude Codeなど）でこのリポジトリを操作する場合の制約やアーキテクチャ詳細は [`CLAUDE.md`](CLAUDE.md) を参照してください。
