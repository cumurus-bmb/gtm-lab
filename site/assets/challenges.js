window.LAB_CHALLENGES = [
  { id: 'L1-01', level: 1, page: '*', title: '全ページでpage_viewが1回だけ飛ぶ',
    brief: 'どのページを開いても page_view イベントが重複なく1回だけ送信されること。',
    constraints: ['ページ読み込み直後に判定する'],
    expect: { event: 'page_view', count: { exactly: 1 }, window_ms: 3000 } },

  { id: 'L1-02', level: 1, page: '/downloads/', title: '外部ドメインへのリンククリックでclickイベント',
    brief: '外部ドメインへのリンクをクリックすると click イベントが link_domain・link_url付きで送信されること。',
    constraints: ['/downloads/ には外部ドメインへのリンクが3本ある'],
    expect: { event: 'click', params: { link_domain: { exists: true }, link_url: { matches: '^https?://' } }, count: { gte: 1 }, window_ms: 5000 } },

  { id: 'L1-03', level: 1, page: '/downloads/', title: 'ファイルDLでfile_download',
    brief: '資料ファイルをクリックすると file_download が file_extension・file_name付きで送信されること。外部リンクと混同しないこと。',
    constraints: [],
    expect: { event: 'file_download', params: { file_extension: { one_of: ['pdf', 'xlsx', 'zip'] }, file_name: { exists: true } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L1-04', level: 1, page: '/products/', title: 'スクロール90%到達でscroll',
    brief: 'ページを90%までスクロールすると scroll イベントが1ページにつき1回だけ送信されること。',
    constraints: [],
    expect: { event: 'scroll', count: { exactly: 1 }, window_ms: 10000 } },

  { id: 'L2-01', level: 2, page: '/', title: 'ヒーローCTAのみcta_click',
    brief: 'トップページのヒーローCTAをクリックした時のみ cta_click（cta_position: "hero"）が送信されること。フッターCTA（同一class・同一テキスト）では発火しないこと。',
    constraints: ['ヒーローCTAとフッターCTAはclassもテキストも同一'],
    expect: { event: 'cta_click', params: { cta_position: { equals: 'hero' } }, count: { exactly: 1 }, window_ms: 5000 },
    forbid: [{ event: 'cta_click', when: 'footer_cta_clicked' }] },

  { id: 'L2-02', level: 2, page: '/products/', title: '商品カードCTAでselect_item',
    brief: '12枚の商品カードのうち押されたカードの情報だけで select_item（item_id, item_name）が送信されること。',
    constraints: ['item_idはhrefのクエリから、item_nameはカード内h3から取得する必要がある'],
    expect: { event: 'select_item', params: { item_id: { exists: true }, item_name: { exists: true } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L2-03', level: 2, page: '/products/detail.html', title: 'カートに追加でadd_to_cart',
    brief: '「カートに追加」ボタンで add_to_cart（value, currency: "JPY", item_id）が送信されること。',
    constraints: ['価格はテキスト「¥12,800（税込）」から数値12800に変換する必要がある'],
    expect: { event: 'add_to_cart', params: { value: { type: 'number', gte: 1 }, currency: { equals: 'JPY' }, item_id: { exists: true } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L3-01', level: 3, page: '/contact/', title: '動的生成フォームの送信でgenerate_lead',
    brief: 'フォームはJSで動的生成されるため gtm.formSubmit トリガーは発火しない。送信成功時に generate_lead（form_id: "contact_main"）が送信されること。',
    constraints: ['フォームはDOMContentLoadedから800ms後に生成される'],
    expect: { event: 'generate_lead', params: { form_id: { equals: 'contact_main' } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L3-02', level: 3, page: '/contact/', title: 'Ajax送信フォームの成功時のみ計測する',
    brief: '送信失敗時（メールアドレス欄に fail@example.com を入力）は計測してはならない。',
    constraints: ['フォームはJSで動的生成されるため gtm.formSubmit トリガーは発火しない', '送信失敗時（メールアドレス欄に fail@example.com を入力）は計測してはならない'],
    expect: { event: 'generate_lead', params: { form_id: { equals: 'contact_main' }, form_destination: { matches: '^https?://' }, value: { type: 'number', gte: 1 } }, count: { exactly: 1 }, window_ms: 5000 },
    forbid: [{ event: 'generate_lead', when: 'submit_failed' }],
    scenario: { steps: ['fill_form_fail', 'click_submit'] } },

  { id: 'L3-03', level: 3, page: '/modal/', title: 'モーダル起点に応じてform_locationを出し分ける',
    brief: '3箇所のトリガーボタンいずれで開いても、押された起点に応じて form_start の form_location を "header"/"sidebar"/"footer" で出し分けること。',
    constraints: ['3つのモーダルはDOM構造・classとも同一', 'どのトリガーで開いたかの正誤はヒットログを見て手動確認する'],
    expect: { event: 'form_start', params: { form_location: { one_of: ['header', 'sidebar', 'footer'] } }, count: { gte: 1 }, window_ms: 5000 } },

  { id: 'L3-04', level: 3, page: '/embed/', title: 'iframe内フォーム送信をgenerate_leadとして計測',
    brief: '同一オリジンiframe内のフォーム送信を親ページのコンテナで generate_lead として計測すること。',
    constraints: ['iframe内は別コンテナ扱いになる', 'postMessageで親子連携する必要がある'],
    expect: { event: 'generate_lead', params: { form_id: { exists: true } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L4-01', level: 4, page: '/thanks/', title: 'tid付き直アクセスでpurchase・二重計上禁止',
    brief: '?tid=ORDER-123 でアクセスすると purchase（transaction_id, value, currency）が送信されること。F5リロード・ブラウザバック・別タブで同じURLを開いても2回目は発火しないこと。',
    constraints: [],
    expect: { event: 'purchase', params: { transaction_id: { exists: true }, value: { type: 'number', gte: 1 }, currency: { equals: 'JPY' } }, count: { exactly: 1 }, window_ms: 5000 } },

  { id: 'L4-02', level: 4, page: '/thanks/', title: 'tid無しではpurchaseを発火させない',
    brief: 'tid パラメータが無い状態で /thanks/ に直アクセスしても purchase を発火させないこと。',
    constraints: [],
    forbid: [{ event: 'purchase' }],
    observe_ms: 5000 },

  { id: 'L4-03', level: 4, page: '/blog/', title: 'pushState遷移でpage_viewを追従',
    brief: '記事クリックによる pushState 遷移で page_view を追従させること。初回ロードと重複させず、ブラウザバック時も欠落させないこと。',
    constraints: ['ヒットログの時系列を見て重複・欠落がないか手動確認する'],
    expect: { event: 'page_view', count: { gte: 1 }, window_ms: 20000 } },

  { id: 'L5-01', level: 5, page: '/blog/', title: '60秒以上閲覧でengaged_read',
    brief: '記事を60秒以上閲覧したら engaged_read が送信されること。記事切り替え時にタイマーがリセットされること。',
    constraints: [],
    expect: { event: 'engaged_read', count: { gte: 1 }, window_ms: 70000 } },

  { id: 'L5-02', level: 5, page: '*', title: 'page_viewにcontent_groupを付与',
    brief: '全サイト共通で page_view に content_group（URLパス第1階層から導出）を付与すること。採点のため ep.content_group としてカスタムパラメータ送信すること。',
    constraints: ['サイト側の実装変更は不要。GTM側のみで完結する課題'],
    expect: { event: 'page_view', params: { content_group: { exists: true } }, count: { gte: 1 }, window_ms: 5000 } },

  { id: 'L5-03', level: 5, page: '*', title: 'Consent Mode v2の導入',
    brief: '同意前は analytics_storage: denied、同意ボタン押下後に update すること。同意前のヒットが正しく抑制されること。',
    constraints: ['サイト側は同意バナーを提供する（config.jsでdefault denied、site.jsのバナーでupdateを呼ぶ）'],
    expect: { event: 'page_view', count: { gte: 1 }, window_ms: 20000 },
    forbid: [{ event: '*', when: 'pre_consent' }] },

  { id: 'L5-04', level: 5, page: '/products/', title: 'ビューポート進入でview_item_list',
    brief: '商品カードがビューポートに入った時に view_item_list（1カード1回のみ）が送信されること。無限スクロールで追加されたカードも対象。',
    constraints: [],
    expect: { event: 'view_item_list', params: { item_id: { exists: true } }, count: { gte: 1 }, window_ms: 15000 } }
];
