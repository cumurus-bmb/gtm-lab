# 解答編

**先に自力で解くこと。** このドキュメントは詰まった時にだけ開いてください。答えを先に読んでGTMに写経しても、実務でつまずくポイントは身につきません。

各解答は「トリガー」「変数（必要なら Custom JavaScript Variable のコード）」「なぜその方法か」の3点で構成しています。CSSセレクタやJSコードは実際の `site/` 配下のDOM構造に基づいています。

<details><summary>L1-01: 全ページでpage_viewが1回だけ飛ぶ</summary>

**トリガー:** GA4設定タグを「Initialization - All Pages」（組み込みの全ページトリガー）で1つだけ配置する。

**変数:** 特になし。GA4設定タグの「このコンフィグ読み込み時にページビューイベントを送信する」を有効にするだけで良い。

**なぜこの方法か:** `page_view` の重複はほぼ必ず「ページビューを飛ばす仕組みを2つ以上仕込んでしまった」ことが原因（GA4設定タグの自動page_view＋手動のGA4イベントタグ「page_view」を両方入れてしまう、同じトリガーを複製してしまう等）。仕組みを1つに絞ることが最も確実な対策。L4-03（`/blog/`のSPA遷移）で別途History Changeトリガーからpage_viewを追加するが、それは初回ロードの発火とは別トリガーなので、この課題の「1回だけ」とは競合しない。
</details>

<details><summary>L1-02: 外部ドメインへのリンククリックでclickイベント</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click URL が {{Page Hostname}} を含まない」かつ「Click URL が http(s) から始まる」。GTMの組み込みクリック変数（Click URL / Click Text 等）を有効にしておく。

**変数:**
- `link_url`: 組み込み変数 {{Click URL}} をそのまま使う。
- `link_domain`: Custom JavaScript Variable。

```js
function() {
  try {
    return new URL({{Click URL}}).hostname;
  } catch (e) {
    return undefined;
  }
}
```

**なぜこの方法か:** `/downloads/` のヘッダーナビや資料DLリンクは相対パス（`../products/` や `files/資料1.pdf`）なので `{{Page Hostname}}` を含まない条件だけで内部リンクは自然に除外できる。外部リンクは `https://www.example.com/` のような絶対URLなので、この条件に一致するのは3本の外部リンクのみになる。`new URL().hostname` を使うのは、`link_domain` を文字列連結で取り出すより堅牢（クエリやポート番号が付いても壊れない）だから。
</details>

<details><summary>L1-03: ファイルDLでfile_download</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click URL が正規表現 `\.(pdf|xlsx|zip)(\?|$)` に一致する」。

**変数:**
- `file_extension`:

```js
function() {
  var url = ({{Click URL}} || '').split('?')[0];
  var m = url.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : undefined;
}
```

- `file_name`:

```js
function() {
  var url = ({{Click URL}} || '').split('?')[0];
  var seg = url.split('/').pop();
  try {
    return decodeURIComponent(seg);
  } catch (e) {
    return seg;
  }
}
```

**なぜこの方法か:** `/downloads/` のファイルリンク（`files/資料1.pdf` 等）は相対パスで同一オリジンなので、L1-02の「外部ドメイン」トリガーの条件（ホスト名を含まない）には一致しない。拡張子ベースの条件を使えばL1-02のトリガーと相互排他になり、「外部リンクとファイルDLを混同しない」という制約を自然に満たせる。ファイル名は日本語（`資料1.pdf`）がURLエンコードされてhrefに載るため、`decodeURIComponent` で元の表示名に戻す。
</details>

<details><summary>L1-04: スクロール90%到達でscroll</summary>

**トリガー:** 組み込みの「スクロール距離」トリガー。「垂直方向の割合」に `90` を指定。発火条件に Page Path が `/products/` を含む、を追加。

**変数:** 特になし（組み込みトリガーが `{{Scroll Depth Threshold}}` 等を自動で用意する）。

**なぜこの方法か:** GTMのスクロールトリガーは「パーセントしきい値ごとに1ページで1回だけ」発火する仕様なので、`count: exactly 1` をそのまま満たせる。自前でscrollイベントリスナーとIntersectionObserverを組む必要はない。`/products/` は12枚→無限スクロールで最大24枚までカードが追加されるページだが、GTMのスクロール距離トリガーはスクロールのたびにその時点のドキュメント高さを再計算するため、後からカードが増えても90%判定が壊れることはない。
</details>

<details><summary>L2-01: ヒーローCTAのみcta_click</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click Element が CSSセレクタ `section.box > a.btn-primary` に一致する」。

**変数:** `cta_position` はタグ側で固定値 `"hero"` を設定するだけで良い（セレクタ自体でヒーローCTAだけに絞り込めているため）。

**なぜこの方法か:** トップページの実際のDOMでは、ヒーローCTA（`<a class="btn btn-primary" href="/products/">無料で試す</a>`）は `<section class="box">` の直下、フッターCTA（同一class・同一テキスト）は `<footer class="box">` の中にあり、**祖先タグが違う**。この構造差を使えば、CSSセレクタだけで「ヒーローだけ」を確実に区別できる。

祖先タグに差が無いレイアウト（例：モーダル起点の判定＝L3-03）では、Custom JavaScript Variableで `closest()` による祖先判定が必要になる：

```js
function() {
  var el = {{Click Element}};
  if (!el) return undefined;
  return el.closest('footer') ? 'footer' : 'hero';
}
```

この変数を使い、タグの発火条件に「変数の値が `"hero"` と一致」を追加する方法でも同じ結果になる。今回はCSSセレクタだけで完結する分シンプルなので、そちらを優先した。
</details>

<details><summary>L2-02: 商品カードCTAでselect_item</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click Element が CSSセレクタ `.card a.btn-primary` に一致する」かつ Page Path が `/products/` に一致する。

**変数:**
- `item_id`（hrefのクエリ`sku`から抽出）:

```js
function() {
  var url = {{Click URL}};
  if (!url) return undefined;
  try {
    return new URL(url).searchParams.get('sku') || undefined;
  } catch (e) {
    return undefined;
  }
}
```

- `item_name`（同カード内の `<h3>` から取得）:

```js
function() {
  var el = {{Click Element}};
  var card = el && el.closest('.card');
  var h3 = card && card.querySelector('h3');
  return h3 ? h3.textContent.trim() : undefined;
}
```

**なぜこの方法か:** 商品一覧は12〜24枚のカードがJSで動的に生成され、各カードは同じclass（`.card`）・同じ構造を共有する。押されたカード固有の情報（sku・商品名）を取るには「クリックされた要素そのもの」から `closest('.card')` で親カードに遡り、その中だけを見る必要がある。href文字列を正規表現で切り出すのではなく `new URL().searchParams` を使うのは、クエリの並び順やエンコードに影響されず確実に `sku` を取れるため。
</details>

<details><summary>L2-03: カートに追加でadd_to_cart</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click Element が CSSセレクタ `section .btn-primary` に一致する」かつ Page Path が `/products/detail.html` に一致する。

**変数:**
- `value`（「¥12,800（税込）」→数値12800に変換。必ず数値型で返すこと。文字列のまま渡すとGA4側で文字列パラメータとして送られてしまい `value` の型チェックに落ちる）:

```js
function() {
  var el = document.querySelector('.price');
  if (!el) return undefined;
  var digits = el.textContent.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : undefined;
}
```

- `currency`: タグ側で固定値 `"JPY"`。
- `item_id`（URLクエリの`sku`から。ページ内スクリプトが保持する `window.__labSku` はページ内部の受け渡し用でGTM向けではないため使わず、URLから独立して読む）:

```js
function() {
  var params = new URLSearchParams(location.search);
  return params.get('sku') || undefined;
}
```

**なぜこの方法か:** 商品詳細ページの「カートに追加」ボタンは `<section class="box">` 直下にあり、フッターの「無料で試す」（`<footer class="box">`内、`<a>`タグ）とはタグも祖先も異なるため `section .btn-primary` だけで一意に絞れる（L2-01と同じ考え方）。価格は静的テキスト「¥12,800（税込）」としてしかDOMに存在しないので、Custom JavaScript Variableで数値以外の文字（`¥`, `,`, `（税込）`）を除去して`Number()`変換する以外に取得手段がない。
</details>

<details><summary>L3-01: 動的生成フォームの送信でgenerate_lead</summary>

**トリガー:** 組み込みの「要素の表示」（Element Visibility）トリガー。選択方法はCSSセレクタで `[data-role="form-mount"] h2`。「DOMの変更を監視する」を有効化。「要素ごとに1回」で発火。

**変数:** `form_id` はタグ側で固定値 `"contact_main"`。

**なぜこの方法か:** `/contact/` のフォームはDOMContentLoadedの800ms後にJSで生成されるdiv/input/buttonの組み合わせで、実際の `<form>` 要素が存在しないため `gtm.formSubmit`（フォーム送信の自動イベント）は発火しない。送信ボタンのクリックも「送信完了」の合図にはならない——成功か失敗かはボタン押下から300ms後の非同期処理（モックのfetch相当）で決まるため、クリックの瞬間には結果がわからない。成功時にだけDOMへ挿入される見出し `<h2>送信ありがとうございました</h2>` の**出現**を検知するのが最も確実。「要素の表示」トリガーの「DOMの変更を監視する」オプションは、ページ読み込み時点でまだ存在しない要素が後から挿入されても検知できる仕組みなので、動的挿入と相性がよい。
</details>

<details><summary>L3-02: Ajax送信フォームの成功時のみ計測する</summary>

**トリガー・変数:** L3-01と同じ「要素の表示」トリガー（`[data-role="form-mount"] h2` の出現）をそのまま使う。追加のパラメータとしてタグに以下を設定する：
- `form_destination`: 固定値（例: `https://api.example.com/contact`）。このモックフォームには実際の送信先URLが存在しないため、実運用ならフォームのaction属性やAPIエンドポイントを動的に取得する箇所を、ここでは代表値で埋める。
- `value`（数値型で必須。固定テキストを直接入力すると文字列として送られてしまうため、必ずCustom JavaScript Variable経由で数値を返す）:

```js
function() {
  return 1; // リード獲得の暫定価値（実案件では商談化率などから設計する）
}
```

**なぜこの方法か:** L3-01の「成功時にだけ挿入される`<h2>`の出現を検知する」というトリガー設計自体が、失敗時（`fail@example.com`入力時）にはこの要素が一切DOMに現れないため、追加の分岐なしで「送信失敗時は発火しない」を満たす。失敗時はエラーメッセージ（`[data-role="error"]`）が表示されるだけで見出しは出ないので、トリガーが誤発火する余地がない。
</details>

<details><summary>L3-03: モーダル起点に応じてform_locationを出し分ける</summary>

**トリガー:** 「クリック - すべての要素」。発火条件は「Click Element が CSSセレクタ `header .btn, aside .btn, footer .btn:not(.btn-primary)` に一致する」かつ Page Path が `/modal/` に一致する。

**変数:** `form_location`（起点判定）:

```js
function() {
  var el = {{Click Element}};
  if (!el) return undefined;
  if (el.closest('header')) return 'header';
  if (el.closest('aside')) return 'sidebar';
  if (el.closest('footer')) return 'footer';
  return undefined;
}
```

**なぜこの方法か:** ヘッダー・サイドバー・フッターの3つの起点ボタンは、いずれも同じ class（`btn`）・同じテキスト（「資料請求」）で構造も同一——ボタン単体のセレクタでは区別できない。一方、3つのボタンはそれぞれ実際に `<header>` / `<aside>` / `<footer>` タグの内側にあるため、`closest()` で祖先を辿れば起点を一意に判定できる（footer には「無料で試す」という別の`.btn.btn-primary`リンクもあるため、トリガー条件の `:not(.btn-primary)` でこれを除外する必要がある）。挿入されるモーダル本体（`[data-role="modal-root"]`）はheader/aside/footerの外側に置かれるため、モーダル内の要素を起点に判定はできない——起点ボタンのクリックそのものを判定材料にする必要がある。「押された起点に応じてform_startを出し分ける」という要件を、起点ボタンのクリックをそのままform_startのトリガーとして扱うことで最小構成にした。
</details>

<details><summary>L3-04: iframe内フォーム送信をgenerate_leadとして計測</summary>

**トリガー:** カスタムイベントトリガー、イベント名 `embed_form_relay`。加えて、このカスタムイベントをdataLayerに送り込むための「カスタムHTML」タグを1つ、`/embed/` のDOM Readyで発火させる：

```html
<script>
(function () {
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== 'gtm-lab-embed-form') return;
    window.dataLayer.push({
      event: 'embed_form_relay',
      embedFormId: event.data.formId
    });
  });
})();
</script>
```

**変数:** `form_id` はData Layer Variable（変数名 `embedFormId`）。

**なぜこの方法か:** `/embed/` のiframe（`form.html`）は同一オリジンだが、GTMコンテナ自体を読み込んでいない別ドキュメントなので、iframe内でのフォーム送信は親ページのGTMからは一切見えない。iframe側のスクリプトは送信時に `window.parent.postMessage({source:'gtm-lab-embed-form', formId:'embed_contact'}, ...)` を送っているので、親ページ側で `message` イベントを受け取り、そこから初めてGTMの世界（dataLayer）に橋渡しする必要がある。親ページの `site.js` は届いたメッセージを `window.__lastEmbedFormMessage` に保持するだけであり、この変数をポーリングするより、GTM自身が `message` リスナーを持って直接 `dataLayer.push` する方がイベント欠落や競合が起きにくく確実。
</details>

<details><summary>L4-01: tid付き直アクセスでpurchase・二重計上禁止</summary>

**トリガー:** 「DOM Ready」（または「ページビュー」）、発火条件は Page Path が `/thanks/` に一致し、かつURLクエリ変数 `tid`（組み込み変数「URL」→コンポーネントタイプ「クエリ」→クエリキー `tid`）が空でなく、かつ以下の「未計上判定」変数が `true` であること。

**変数:**
- `transaction_id`: 上記のURLクエリ変数 `tid` をそのまま使う。
- `value`: L2-03と同じ価格テキスト解析（`/thanks/` にも `<span class="price">¥12,800（税込）</span>` がある）。
- `currency`: タグ側で固定値 `"JPY"`。
- 発火条件用の「未計上判定」Custom JavaScript Variable:

```js
function() {
  var tid = new URLSearchParams(location.search).get('tid');
  if (!tid) return false;
  try {
    return localStorage.getItem('lab_purchase_' + tid) !== '1';
  } catch (e) {
    return true;
  }
}
```

このタグの「タグシーケンス」設定で、purchaseタグの発火**後**に、以下を実行するカスタムHTMLタグを続けて発火させる：

```html
<script>
(function () {
  var tid = new URLSearchParams(location.search).get('tid');
  if (tid) {
    try { localStorage.setItem('lab_purchase_' + tid, '1'); } catch (e) {}
  }
})();
</script>
```

**なぜこの方法か:** F5リロード・ブラウザバック・別タブでの同一URLアクセスはすべて「ページを最初から読み込み直す」動作であり、GTMのタグ発火回数カウンタ（「1ページにつき1回」等）はページ読み込みごとにリセットされてしまうため無力。同一トランザクションの二重計上を防ぐには、ページをまたいで残る記憶装置が要る。`sessionStorage`はタブ単位なので「別タブで同じURLを開く」ケースを防げない。`localStorage`は同一オリジンのタブ間で共有されるため、`tid`をキーに「送信済みフラグ」を書き込めば、リロード・戻る・別タブのいずれでも次回は発火条件（未計上判定）でブロックできる。フラグの書き込みをタグ本体ではなく「発火後に続けて動くタグ」に分離するのは、発火条件の判定（読み取り）とフラグの書き込みが同じタイミングで競合しないようにするため。
</details>

<details><summary>L4-02: tid無しではpurchaseを発火させない</summary>

**トリガー・変数:** L4-01と同じ設定をそのまま使う（追加設定は不要）。

**なぜこの方法か:** L4-01のトリガー条件に「URLクエリ変数 `tid` が空でない」を含めているため、`tid` が存在しないアクセス（`/thanks/` への直アクセス）では、この条件が満たされずタグそのものが発火しない。L4-01とL4-02は同じトリガーの同じ条件で表裏一体の要件になっているので、片方を満たせばもう片方も自動的に満たされる。
</details>

<details><summary>L4-03: pushState遷移でpage_viewを追従</summary>

**トリガー:** 組み込みの「履歴の変更」（History Change）トリガー。発火条件は Page Path が `/blog/` を含む。

**変数:** 特になし。page_locationには組み込み変数 {{Page URL}}（履歴変更後の現在のURLを反映）を使う。

**なぜこの方法か:** `/blog/` の記事クリックは `e.preventDefault()` で通常のリンク遷移を止めた上で `history.pushState()` を呼ぶだけの疑似遷移で、実際のページロードは発生しないため、L1-01の「Initialization - All Pages」トリガー（ページの初回ロード時にしか発火しない）では追従できない。GTMの「履歴の変更」トリガーは `pushState`・`replaceState`・`popstate`・`hashchange` をすべて内部的にフックしており、記事クリック（pushState）でもブラウザバック（popstate、`window.addEventListener('popstate', render)` で一覧/記事を再描画している）でも同じトリガーで一貫して検知できる。初回ロードの`page_view`（L1-01のタグ）とはトリガーが完全に分離しているため、初回ロード分と二重計上する心配もない。
</details>

<details><summary>L5-01: 60秒以上閲覧でengaged_read</summary>

**トリガー:** 組み込みの「タイマー」トリガー（イベント名は任意、間隔5000ms、上限0＝無制限）を、Page Path `/blog/` に限定して以下のGA4イベントタグに割り当てる。追加の発火条件として、下記「閲覧準備完了」変数が `true` であることを設定する。

このタイマー用の記事切り替え検知は、以下のカスタムHTMLタグで行う（トリガーはL4-03と同じ「履歴の変更」トリガー＋Page Path `/blog/` のDOM Ready、いずれもこのタグに割り当てる）：

```html
<script>
(function () {
  var post = new URLSearchParams(location.search).get('post');
  if (post !== window.__blogCurrentPost) {
    window.__blogCurrentPost = post;
    window.__blogArticleOpenedAt = post ? Date.now() : null;
    window.__blogEngagedFired = false;
  }
})();
</script>
```

**変数:** 「閲覧準備完了」Custom JavaScript Variable:

```js
function() {
  var post = window.__blogCurrentPost;
  var opened = window.__blogArticleOpenedAt;
  if (!post || !opened || window.__blogEngagedFired) return false;
  return (Date.now() - opened) >= 60000;
}
```

GA4イベントタグの発火**後**に続けて動くカスタムHTMLタグ（タグシーケンス）で `window.__blogEngagedFired = true;` を実行し、同じ記事に対して5秒間隔のタイマーが繰り返し `engaged_read` を再送しないようにする。

**なぜこの方法か:** サイト側は `renderArticle()` 内で60秒後に `view.classList.add('is-engaged')` という汎用マーカーを用意しているが、実際のコードを読むと、記事を切り替えても（`renderList()`/`renderArticle()` のどちらでも）この `is-engaged` クラス自体は一度付いたら**除去されない**。つまりこのクラスだけを見ていると、1本目の記事を60秒読んだ後に2本目の記事へすぐ切り替えても「（1本目由来の）is-engagedが付いたまま」になり、「記事切り替え時にタイマーをリセットする」という要件を満たせない。そのため、記事が切り替わるたびに `window.__blogArticleOpenedAt` を打ち直す独自のタイマー基点をGTM側（カスタムHTMLタグ）で持ち、組み込みの「タイマー」トリガーで定期的に「今開いている記事を60秒以上見ているか」をチェックする構成にした。
</details>

<details><summary>L5-02: page_viewにcontent_groupを付与</summary>

**トリガー:** 追加のトリガーは不要。L1-01のGA4設定タグとL4-03のpage_viewイベントタグの両方に、同じ変数を使ったイベントパラメータ `content_group` を追加する（あるいはGA4設定タグの「フィールドを設定」に1箇所だけ設定すれば、同一コンフィグを参照する全イベントタグに自動的に引き継がれる）。

**変数:** URLパス第1階層を抽出するCustom JavaScript Variable:

```js
function() {
  var path = {{Page Path}} || location.pathname;
  var seg = path.split('/').filter(function (s) { return s.length > 0; })[0];
  return seg || 'top';
}
```

**なぜこの方法か:** 課題文の通り、GA4組み込みの「コンテンツグループ」フィールド（GA4設定タグの専用入力欄）を使うと、送信されるパラメータ名が `content_group` というイベントパラメータとしてではなく別経路で扱われ、採点対象の `ep.content_group` として届かない。必ず「イベントパラメータ」のテーブルに、キー名を文字通り `content_group` として追加する必要がある。値をGA4設定タグ側（フィールドを設定）に1箇所書けば、初回ロードのpage_view・SPA遷移のpage_view・他の全イベントタグに共通して乗る——ページごと・タグごとに同じ変数をコピーしなくて済む。
</details>

<details><summary>L5-03: Consent Mode v2の導入</summary>

**トリガー:** 既存の全タグ（GA4設定タグ・各イベントタグ）に対する追加設定のみで、新規トリガーは不要。

**設定:** 各GA4タグの「詳細設定」→「同意設定」で「タグの発火に追加の同意が必要」を有効にし、`analytics_storage` を選択する。あわせてGTMのコンテナ設定で「同意の概要」（Consent Overview）を有効化しておく。

**なぜこの方法か:** サイト側はすでに `config.js` で `gtag('consent', 'default', { analytics_storage: 'denied', ... })` をGTMコンテナ読み込みより前に実行しており、同意バナー（`site.js` の `initConsentBanner()`）で同意ボタンが押されたときにだけ `gtag('consent', 'update', { analytics_storage: 'granted', ... })` を呼んでいる。GTMはこの `consent` コマンド列を自動的に認識するが、既定では多くのGoogleタグ（GA4含む）は同意が無くても「Cookieレスの簡易送信」を行う場合があり、それでは「同意前は一切ヒットが飛ばない」状態にはならない。タグ個別に「追加の同意が必要（`analytics_storage`）」を明示すると、その同意タイプが `granted` になるまでタグ自体が完全にブロックされ、送信そのものが発生しなくなる。同意ボタン押下後に `update` が呼ばれた瞬間、ブロックされていたタグが解放されて以降のヒットが正常に送信される。
</details>

<details><summary>L5-04: ビューポート進入でview_item_list</summary>

**トリガー:** 組み込みの「要素の表示」（Element Visibility）トリガー。選択方法はCSSセレクタで `.card.is-viewed`。「要素ごとに1回」、「DOMの変更を監視する」を有効化。発火条件に Page Path が `/products/` を追加。

**変数:** `item_id`（表示されたカード内のリンクからsku抽出。L2-02と同じ考え方）:

```js
function() {
  var card = {{Click Element}};
  var link = card && card.querySelector('a.btn-primary');
  if (!link || !link.href) return undefined;
  try {
    return new URL(link.href).searchParams.get('sku') || undefined;
  } catch (e) {
    return undefined;
  }
}
```

**なぜこの方法か:** `/products/` のスクリプトは自前のIntersectionObserver（`threshold: 0.5`）で各カードが50%以上見えた瞬間に `card.classList.add('is-viewed')` を実行し、しかも `MutationObserver` で無限スクロールにより後から追加されたカードも同じ仕組みで監視対象に加えている——コード中のコメント通り、これは「学習者がGTMのElement Visibilityトリガーで使う汎用マーカー」として用意されたものなので素直に利用する。GTM側の「要素の表示」トリガーを `.card` 単体ではなく `.card.is-viewed` に向けることで、サイト側がすでに検証済みの「50%以上見えた」判定に相乗りでき、GTM独自のIntersectionObserver実装との閾値のズレを気にする必要がなくなる。「DOMの変更を監視する」を有効にしておけば、無限スクロールで後から追加され、後から`is-viewed`クラスが付くカードも取りこぼさない。「要素ごとに1回」により、1カードにつき最大1回しか発火しない。
</details>
