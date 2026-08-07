# GTM実践学習ラボ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-grading Google Tag Manager practice site — a Vanilla-JS/static-HTML site (`site/`) served by nginx via Docker Compose, deliberately hostile to easy measurement, plus a client-side grading engine (`lab-grader.js`) that intercepts real GA4 network hits and checks them against 18 challenge definitions.

**Architecture:** Two independent halves that only communicate through the network layer. (1) `site/` is the practice surface: 9 pages full of intentional measurement traps (duplicate classes, no ids, dynamically-generated DOM, SPA navigation, iframes) that push nothing to `dataLayer` themselves. (2) `lab-grader.js` + `challenges.js` form a self-contained grading engine that monkey-patches `sendBeacon`/`fetch`/`XHR`/`Image.src` before GTM loads, parses every GA4 `/g/collect` hit (including batched POST bodies), and evaluates each against a declarative challenge spec — entirely independent of how the learner wires up GTM.

**Tech Stack:** Vanilla JS (ES5-safe, no build step), static HTML/CSS, `nginx:alpine` via Docker Compose, `lftp` for deploy. No Node.js runtime, no package manager, no bundler. Playwright (already available in this environment) is used only as an external dev-time verification tool — it is never shipped as part of `site/`.

## Global Constraints

These apply to every task below; do not violate them even where a task's code samples don't repeat them.

- No build step. Every file in `site/` must run as-is in a browser with no transpilation, no npm install, no bundler.
- No Node.js runtime or package manager anywhere in the shipped site.
- `site/` must be uploadable byte-for-byte to ConoHa Wing and work identically. **Only relative paths** inside `site/` — never a leading `/assets/...`. A page at depth 1 (e.g. `site/products/index.html`) must reference `../assets/...`.
- Latest Chrome only — no cross-browser polyfills needed.
- Serve locally via `docker compose up -d`, reachable at `http://localhost:8080`.
- No `id` attribute anywhere in `site/` HTML.
- No `data-*` measurement-hint attributes anywhere in `site/` HTML.
- Reuse generic, duplicated class names across unrelated elements: `.btn`, `.card`, `.link`, `.item`, `.box`. Never invent a uniquely-named class whose sole purpose is to make an element easy to target for tracking.
- Header and footer markup is hand-duplicated verbatim in every page's HTML — never generated or included via JS.
- `site/` JavaScript never calls `dataLayer.push()` for a custom/measurement event. `dataLayer` is initialized once in `config.js` and otherwise left entirely to the learner's own GTM work. (The grading engine's internal `setScenarioContext()` calls are not `dataLayer` pushes and are invisible to GTM — see Grading Engine Design Notes below.)
- `config.js` and `lab-grader.js` must be the first two `<script>` tags in every page's `<head>`, loaded synchronously (no `async`/`defer`), before the GTM container snippet — the network patch must be live before `gtm.js` starts firing.
- `robots.txt` contains `Disallow: /`, and every page's `<head>` includes `<meta name="robots" content="noindex,nofollow">`.
- Setting `LAB_GRADER_ENABLED = false` in `config.js` must fully disable interception and hide the panel, with zero console errors.

## Grading Engine Design Notes

A few schema decisions needed to turn the spec's challenge schema into a working engine. These are documented here once so every task and both docs (`CHALLENGES.md`, `ANSWERS.md`) stay consistent:

- **`page: '*'`** — a challenge whose `page` is `'*'` applies to every page; the panel shows it regardless of the current path, evaluated only against hits captured since the current page load.
- **Scenario context tagging** — `LabGrader.setScenarioContext(name)` lets `site/` code (not GTM) tell the grader "the next hit(s) happen during scenario X" (e.g. `'submit_failed'`, `'pre_consent'`, `'modal_header'`). Every captured hit gets a `context` property set to whatever context is currently active. This is purely for the grader's own bookkeeping — it is never pushed to `dataLayer` and is invisible to the learner's GTM container. `forbid` entries match on `{event, when}` where `when` compares against `hit.context`; `when` may be omitted (matches any context) and `event` may be `'*'` (matches any event).
- **"Must never fire" challenges** (e.g. challenge 13 — no `purchase` on `/thanks/` without `?tid=`) omit `expect` entirely and set `observe_ms` (default 5000): the challenge is PASS if the observation window elapses with no `forbid` violation, PENDING while still observing.
- **`content_group`** must be sent as a custom event parameter (`ep.content_group=...`) rather than GA4's built-in content-group mechanism, so it lands in `hit.params.content_group` like every other parameter the parser understands. This is called out explicitly in `CHALLENGES.md`.
- **Modal `form_location` (challenge 10)** is only spot-checked automatically (`form_start` fires with `form_location` one of `header`/`sidebar`/`footer`). Verifying the *correct* location was sent for the *correct* trigger is left to the learner reading the Hit Log panel, which shows every hit's full parameters — documented in `CHALLENGES.md` as a manual-verification step.
- **Cross-session duplicate detection** (Lv4) is a separate check layered on top of `evaluate()`: if `LabGrader`'s dedup engine has flagged a duplicate for a challenge's `expect.event`, that challenge is forced to FAIL regardless of what `evaluate()` returns.

---

### Task 1: Repo scaffolding — Docker, nginx, minimal page

**Files:**
- Create: `docker-compose.yml`
- Create: `nginx/default.conf`
- Create: `site/index.html`
- Create: `site/robots.txt`
- Create: `site/404.html`
- Create: `.gitignore`

**Interfaces:**
- Produces: a working `http://localhost:8080` serving `site/index.html`, which every later task builds on.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./site:/usr/share/nginx/html:ro
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    restart: unless-stopped
```

- [ ] **Step 2: Write `nginx/default.conf`**

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    error_page 404 /404.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
.env
.DS_Store
```

- [ ] **Step 4: Write `site/robots.txt`**

```
User-agent: *
Disallow: /
```

- [ ] **Step 5: Write minimal `site/index.html`**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GTM実践学習ラボ</title>
</head>
<body>
<h1>GTM実践学習ラボ</h1>
<p>準備中。</p>
</body>
</html>
```

- [ ] **Step 6: Write minimal `site/404.html`**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow">
<title>404 Not Found</title>
</head>
<body>
<h1>404 — ページが見つかりません</h1>
<p><a href="/">トップへ戻る</a></p>
</body>
</html>
```

- [ ] **Step 7: Start the stack and verify**

Run: `docker compose up -d && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/ && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/nope`
Expected: first line `200`, second line `404`.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml nginx/ site/index.html site/robots.txt site/404.html .gitignore
git commit -m "chore: scaffold docker/nginx and minimal site"
```

---

### Task 2: `config.js`

**Files:**
- Create: `site/config.js`

**Interfaces:**
- Produces: `window.LAB_CONFIG = { GTM_ID, GA4_MEASUREMENT_ID, LAB_GRADER_ENABLED }`, `window.dataLayer` (array), `window.gtag` (queueing stub) — consumed by `lab-grader.js` (Task 3) and every page's GTM snippet.

- [ ] **Step 1: Write `site/config.js`**

```js
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
```

- [ ] **Step 2: Verify it loads without error**

Run: `docker compose exec web sh -c "cat /usr/share/nginx/html/config.js"` and confirm the file is served; then add a temporary `<script src="config.js"></script>` to `site/index.html`, reload `http://localhost:8080/`, and check the browser console (via Playwright, see below) for zero errors.

Playwright check (run once, then remove any temporary script tag you added for this step — Task 5 wires it in for real):
```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_console_messages → expect no "error" level entries
mcp__playwright__browser_evaluate → () => window.LAB_CONFIG.GTM_ID
Expected: "GTM-XXXXXXX"
```

- [ ] **Step 3: Commit**

```bash
git add site/config.js
git commit -m "feat: add config.js with GTM/GA4 settings and consent defaults"
```

---

### Task 3: `lab-grader.js` — network interception and hit parsing

This is the most important task in the project — it must be correct before anything else is built on top of it.

**Files:**
- Create: `site/assets/lab-grader.js`

**Interfaces:**
- Consumes: `window.LAB_CONFIG` (Task 2).
- Produces: `window.LabGrader.getHits(): NormalizedHit[]`, `window.LabGrader.onHit(fn: (hit: NormalizedHit) => void): void`, `window.LabGrader.enabled: boolean`, `window.LabGrader.setScenarioContext(name: string|null): void`. `NormalizedHit = { ts, tid, cid, sid, event, params: {}, page: {dl, dt}, raw, context }`. All consumed by Task 4 (evaluator), Task 5 (panel), and every page task's scenario hooks.

- [ ] **Step 1: Write the interception + parsing core of `lab-grader.js`**

```js
// lab-grader.js — GA4ヒットの傍受・正規化。GTMスニペットより前に同期読み込みすること。
(function () {
  'use strict';

  var CONFIG = window.LAB_CONFIG || {};
  var hits = [];
  var listeners = [];
  var currentContext = null;

  if (CONFIG.LAB_GRADER_ENABLED === false) {
    window.LabGrader = {
      enabled: false,
      getHits: function () { return []; },
      onHit: function () {},
      setScenarioContext: function () {},
      registerScenarioSteps: function () {},
      runScenario: function () {}
    };
    return;
  }

  var COLLECT_URL_RE = /^https:\/\/(www\.)?(google-analytics\.com|analytics\.google\.com)\/g\/collect/;

  function parseParamString(qs) {
    var params = {};
    if (!qs) return params;
    var pairs = qs.replace(/^\?/, '').split('&');
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) continue;
      var idx = pairs[i].indexOf('=');
      var key = idx === -1 ? pairs[i] : pairs[i].slice(0, idx);
      var val = idx === -1 ? '' : pairs[i].slice(idx + 1);
      try { key = decodeURIComponent(key); } catch (e) { /* leave as-is */ }
      try { val = decodeURIComponent(val.replace(/\+/g, ' ')); } catch (e) { /* leave as-is */ }
      params[key] = val;
    }
    return params;
  }

  function buildNormalizedHit(paramStr) {
    var flat = parseParamString(paramStr);
    var epParams = {};
    Object.keys(flat).forEach(function (k) {
      if (k.indexOf('ep.') === 0) {
        epParams[k.slice(3)] = flat[k];
      } else if (k.indexOf('epn.') === 0) {
        epParams[k.slice(4)] = Number(flat[k]);
      }
    });
    return {
      ts: Date.now(),
      tid: flat.tid,
      cid: flat.cid,
      sid: flat.sid,
      event: flat.en,
      params: epParams,
      page: { dl: flat.dl, dt: flat.dt },
      raw: paramStr,
      context: currentContext
    };
  }

  function notify(hit) {
    hits.push(hit);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](hit); } catch (e) { /* one bad listener must not break others */ }
    }
  }

  function parseAndEmit(url, bodyStr) {
    var path = String(url).split('?')[0];
    if (!COLLECT_URL_RE.test(String(url))) return;
    var query = String(url).indexOf('?') !== -1 ? String(url).slice(String(url).indexOf('?') + 1) : '';
    // バッチ送出時はPOSTボディが改行区切りで複数イベント分並ぶ。各行を個別ヒットとして扱う。
    var lines = bodyStr ? bodyStr.split('\n').filter(function (l) { return l.trim().length > 0; }) : [];
    if (lines.length === 0) {
      notify(buildNormalizedHit(query));
    } else {
      lines.forEach(function (line) {
        var merged = query ? query + '&' + line : line;
        notify(buildNormalizedHit(merged));
      });
    }
  }

  // 1. navigator.sendBeacon
  var origSendBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  if (origSendBeacon) {
    navigator.sendBeacon = function (url, data) {
      try {
        var bodyStr = typeof data === 'string' ? data : null;
        parseAndEmit(url, bodyStr);
      } catch (e) { /* observation must never break the real send */ }
      return origSendBeacon(url, data);
    };
  }

  // 2. window.fetch
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url);
        var bodyStr = init && typeof init.body === 'string' ? init.body : null;
        parseAndEmit(url, bodyStr);
      } catch (e) { /* observation must never break the real fetch */ }
      return origFetch(input, init);
    };
  }

  // 3. XMLHttpRequest
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__labUrl = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      parseAndEmit(this.__labUrl, typeof body === 'string' ? body : null);
    } catch (e) { /* observation must never break the real send */ }
    return origSend.apply(this, arguments);
  };

  // 4. new Image().src = ...
  var imgDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (imgDescriptor && imgDescriptor.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: imgDescriptor.enumerable,
      get: imgDescriptor.get,
      set: function (value) {
        try { parseAndEmit(value, null); } catch (e) { /* observation must never break the real load */ }
        return imgDescriptor.set.call(this, value);
      }
    });
  }

  window.LabGrader = {
    enabled: true,
    getHits: function () { return hits.slice(); },
    onHit: function (fn) { listeners.push(fn); },
    setScenarioContext: function (name) { currentContext = name || null; },
    _internal: { buildNormalizedHit: buildNormalizedHit, parseParamString: parseParamString }
  };
})();
```

- [ ] **Step 2: Wire it onto the page for testing**

Add to `site/index.html`'s `<head>`, immediately after the existing minimal content, in this exact order:

```html
<script src="config.js"></script>
<script src="assets/lab-grader.js"></script>
```

- [ ] **Step 3: Verify interception with Playwright (stubbed network, no real calls to Google)**

```
mcp__playwright__browser_navigate → http://localhost:8080/
```
Then use `mcp__playwright__browser_evaluate` to route-stub is not available via evaluate alone — instead register a Playwright network route before navigating:
```
mcp__playwright__browser_network_request or browser_evaluate with:
() => fetch('https://www.google-analytics.com/g/collect?v=2&tid=G-TEST123&cid=1.1&en=test_event&ep.foo=bar&epn.value=42', {method:'POST', body:'en=batched_event&ep.zzz=1'}).catch(()=>{})
```
Since this performs a real outbound request, first confirm `site/config.js`'s `GA4_MEASUREMENT_ID` is a placeholder (harmless fake ID) and that this is a one-time manual dev check — or prefer intercepting via `mcp__playwright__browser_evaluate` calling `window.fetch` directly (the patch fires synchronously before the real network call resolves, so even if the outbound call errors/is blocked, `LabGrader` has already recorded it). After the call:
```
mcp__playwright__browser_evaluate → () => JSON.stringify(window.LabGrader.getHits())
```
Expected: an array with two hit objects — one with `event: "test_event"`, `params: {foo: "bar", value: 42}`, `tid: "G-TEST123"`; one with `event: "batched_event"`, `params: {zzz: "1"}` (batched body line parsed as its own hit).

- [ ] **Step 4: Remove the temporary script tags from `site/index.html`** (Task 5 re-adds them as part of the real page wiring) — skip this step if Task 5 will run immediately next; otherwise leave them, Task 5's Step 1 will simply confirm/replace them.

- [ ] **Step 5: Commit**

```bash
git add site/assets/lab-grader.js site/index.html
git commit -m "feat: intercept and normalize GA4 hits in lab-grader.js"
```

---

### Task 4: `lab-grader.js` — assertion evaluator and duplicate detection

**Files:**
- Modify: `site/assets/lab-grader.js`

**Interfaces:**
- Consumes: `NormalizedHit` (Task 3).
- Produces: `window.LabGrader.evaluate(challenge, hits): {status: 'pass'|'fail'|'pending', reason: string}`, `window.LabGrader.getDuplicateFlags(): {event: string, key: string}[]` — consumed by Task 5 (panel) and Task 6 (challenge data must match these semantics).

- [ ] **Step 1: Add the operator evaluator and `evaluate()` inside the closure, before `window.LabGrader = {...}`**

```js
  function evalParamSpec(actual, spec) {
    return Object.keys(spec).every(function (op) {
      switch (op) {
        case 'equals': return actual === spec.equals;
        case 'matches': return typeof actual === 'string' && new RegExp(spec.matches).test(actual);
        case 'type': return spec.type === 'number'
          ? (typeof actual === 'number' && !isNaN(actual))
          : typeof actual === spec.type;
        case 'gte': return typeof actual === 'number' && actual >= spec.gte;
        case 'lte': return typeof actual === 'number' && actual <= spec.lte;
        case 'one_of': return spec.one_of.indexOf(actual) !== -1;
        case 'exists': return spec.exists ? actual !== undefined : actual === undefined;
        default: return true;
      }
    });
  }

  function findForbidHit(challenge, hitList) {
    var found = null;
    (challenge.forbid || []).forEach(function (f) {
      if (found) return;
      hitList.forEach(function (h) {
        if (found) return;
        var eventMatches = f.event === '*' || h.event === f.event;
        var contextMatches = !f.when || h.context === f.when;
        if (eventMatches && contextMatches) found = h;
      });
    });
    return found;
  }

  function evaluateChallenge(challenge, hitList) {
    var forbidHit = findForbidHit(challenge, hitList);
    if (forbidHit) {
      return {
        status: 'fail',
        reason: '禁止イベント "' + forbidHit.event + '" がシナリオ "' + forbidHit.context + '" で発火しました'
      };
    }

    if (!challenge.expect) {
      // 「絶対に発火してはいけない」型の課題（例: tid無しの/thanks/）
      var observeMs = challenge.observe_ms || 5000;
      var loadTs = challenge._loadTs || (challenge._loadTs = Date.now());
      if (Date.now() - loadTs < observeMs) {
        return { status: 'pending', reason: '観測中（' + observeMs + 'ms）' };
      }
      return { status: 'pass', reason: 'PASS（禁止イベントは発火しませんでした）' };
    }

    var exp = challenge.expect;
    var eventHits = hitList.filter(function (h) { return h.event === exp.event; });
    if (eventHits.length === 0) {
      return { status: 'pending', reason: 'en=' + exp.event + ' 未受信' };
    }

    var paramSpecs = exp.params || {};
    var mismatch = null;
    var paramOk = eventHits.filter(function (h) {
      return Object.keys(paramSpecs).every(function (p) {
        var ok = evalParamSpec(h.params[p], paramSpecs[p]);
        if (!ok && !mismatch) mismatch = { param: p, actual: h.params[p], expect: paramSpecs[p] };
        return ok;
      });
    });

    if (paramOk.length === 0) {
      return {
        status: 'fail',
        reason: 'en=' + exp.event + ' は受信したが ep.' + mismatch.param + ' が ' +
          JSON.stringify(mismatch.actual) + '（期待: ' + JSON.stringify(mismatch.expect) + '）'
      };
    }

    var windowMs = exp.window_ms || 5000;
    var first = paramOk[0].ts;
    var inWindow = paramOk.filter(function (h) { return h.ts - first <= windowMs; });
    var count = exp.count || { exactly: 1 };
    var countOk = count.exactly !== undefined ? inWindow.length === count.exactly
      : count.gte !== undefined ? inWindow.length >= count.gte
      : count.lte !== undefined ? inWindow.length <= count.lte
      : true;

    if (!countOk) {
      return {
        status: 'fail',
        reason: '発火回数が期待と異なる（実測: ' + inWindow.length + '回、期待: ' + JSON.stringify(count) + '）'
      };
    }

    return { status: 'pass', reason: 'PASS' };
  }
```

- [ ] **Step 2: Add duplicate detection, called from within `notify()`**

Add above `notify()`:

```js
  var SENT_IDS_KEY = 'labgrader_sent_ids_v1';
  var dupFlags = [];
  var recentSignatures = [];

  function checkSessionDedup(hit) {
    if (hit.event !== 'purchase' && hit.event !== 'generate_lead') return;
    var tid = hit.params && hit.params.transaction_id;
    if (!tid) return;
    var key = hit.event + ':' + tid;
    var sent;
    try { sent = JSON.parse(localStorage.getItem(SENT_IDS_KEY) || '{}'); } catch (e) { sent = {}; }
    if (sent[key]) {
      dupFlags.push({ event: hit.event, key: key, ts: hit.ts });
    } else {
      sent[key] = hit.ts;
      try { localStorage.setItem(SENT_IDS_KEY, JSON.stringify(sent)); } catch (e) { /* storage full/unavailable */ }
    }
  }

  function checkRapidDuplicate(hit) {
    var sig = hit.event + '|' + JSON.stringify(hit.params);
    recentSignatures = recentSignatures.filter(function (s) { return hit.ts - s.ts < 500; });
    var isDup = recentSignatures.some(function (s) { return s.sig === sig; });
    recentSignatures.push({ sig: sig, ts: hit.ts });
    return isDup; // WARN only, not surfaced as FAIL — panel (Task 5) shows it in the hit log
  }
```

Then update `notify()` to call both:

```js
  function notify(hit) {
    checkSessionDedup(hit);
    hit.rapidDuplicate = checkRapidDuplicate(hit);
    hits.push(hit);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](hit); } catch (e) { /* one bad listener must not break others */ }
    }
  }
```

- [ ] **Step 3: Expose `evaluate` and dedup flags on the public API**

Update the `window.LabGrader = {...}` object (both branches — enabled and disabled):

```js
  window.LabGrader = {
    enabled: true,
    getHits: function () { return hits.slice(); },
    onHit: function (fn) { listeners.push(fn); },
    setScenarioContext: function (name) { currentContext = name || null; },
    evaluate: evaluateChallenge,
    getDuplicateFlags: function () { return dupFlags.slice(); },
    _internal: { buildNormalizedHit: buildNormalizedHit, parseParamString: parseParamString }
  };
```

(And for the disabled branch at the top, add matching no-op stubs: `evaluate: function () { return { status: 'pending', reason: 'grader disabled' }; }, getDuplicateFlags: function () { return []; }`.)

- [ ] **Step 4: Verify with Playwright — pure logic, no DOM/network needed**

```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_evaluate →
() => {
  var results = [];
  var c1 = { expect: { event: 'generate_lead', params: { value: { type: 'number', gte: 1 } }, count: { exactly: 1 }, window_ms: 5000 } };
  results.push(window.LabGrader.evaluate(c1, [{ ts: 1000, event: 'generate_lead', params: { value: 100 }, context: null }]).status); // expect "pass"
  results.push(window.LabGrader.evaluate(c1, [{ ts: 1000, event: 'generate_lead', params: { value: 'bad' }, context: null }]).status); // expect "fail"
  results.push(window.LabGrader.evaluate(c1, []).status); // expect "pending"
  var c2 = { forbid: [{ event: 'purchase', when: 'submit_failed' }] };
  results.push(window.LabGrader.evaluate(c2, [{ ts: 1000, event: 'purchase', params: {}, context: 'submit_failed' }]).status); // expect "fail"
  return results.join(',');
}
```
Expected: `"pass,fail,pending,fail"`.

- [ ] **Step 5: Commit**

```bash
git add site/assets/lab-grader.js
git commit -m "feat: add challenge evaluator and duplicate detection to lab-grader.js"
```

---

### Task 5: `lab-grader.js` — floating panel UI, scenario runner, wiring, toggle

**Files:**
- Modify: `site/assets/lab-grader.js`
- Modify: `site/index.html`

**Interfaces:**
- Consumes: `window.LAB_CHALLENGES` (Task 6 — until then, an empty array is fine; the panel must render an empty state gracefully), `evaluate()`/`getHits()`/`onHit()`/`getDuplicateFlags()` (Task 4).
- Produces: `window.LabGrader.registerScenarioSteps(pageId, steps: {[name: string]: () => void|Promise})`, `window.LabGrader.runScenario(pageId, stepNames: string[])`. Rendered panel DOM. `localStorage` key `labgrader_progress_v1` for cross-page progress.

- [ ] **Step 1: Add scenario registry inside the closure**

```js
  var scenarioRegistry = {};

  function registerScenarioSteps(pageId, steps) {
    scenarioRegistry[pageId] = steps;
  }

  function runScenario(pageId, stepNames) {
    var steps = scenarioRegistry[pageId] || {};
    var i = 0;
    function next() {
      if (i >= stepNames.length) return;
      var fn = steps[stepNames[i]];
      i++;
      if (typeof fn === 'function') {
        Promise.resolve(fn()).then(function () { setTimeout(next, 300); });
      } else {
        setTimeout(next, 300);
      }
    }
    next();
  }
```

- [ ] **Step 2: Add the panel UI, injected on `DOMContentLoaded`**

```js
  var PROGRESS_KEY = 'labgrader_progress_v1';

  function currentPath() {
    var p = location.pathname;
    if (p.length > 1 && p.slice(-1) === '/') p = p; // keep trailing slash form used by challenges.js
    return p;
  }

  function pageChallenges() {
    var list = window.LAB_CHALLENGES || [];
    var path = currentPath();
    return list.filter(function (c) { return c.page === '*' || c.page === path; });
  }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (e) { return {}; }
  }

  function saveProgress(progress) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (e) { /* storage unavailable */ }
  }

  function injectStyle() {
    var style = document.createElement('style');
    style.textContent =
      '.lg-panel{position:fixed;right:12px;bottom:12px;width:360px;max-height:70vh;' +
      'background:#1e1e2e;color:#e6e6e6;font:12px/1.5 -apple-system,sans-serif;' +
      'border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:999999;' +
      'display:flex;flex-direction:column;overflow:hidden}' +
      '.lg-panel.lg-collapsed .lg-body{display:none}' +
      '.lg-head{display:flex;justify-content:space-between;align-items:center;' +
      'padding:8px 10px;background:#11111b;cursor:pointer}' +
      '.lg-body{overflow-y:auto;padding:8px 10px}' +
      '.lg-row{display:flex;justify-content:space-between;gap:6px;padding:4px 0;' +
      'border-bottom:1px solid #333}' +
      '.lg-pass{color:#8bd450}.lg-fail{color:#ff6b6b}.lg-pending{color:#999}' +
      '.lg-btn{background:#333;color:#eee;border:none;border-radius:4px;' +
      'padding:3px 8px;cursor:pointer;font-size:11px}' +
      '.lg-hit{padding:4px 0;border-bottom:1px solid #333;cursor:pointer}' +
      '.lg-hit pre{white-space:pre-wrap;word-break:break-all;margin:4px 0 0}';
    document.head.appendChild(style);
  }

  function renderPanel() {
    var panel = document.createElement('div');
    panel.className = 'lg-panel';

    var head = document.createElement('div');
    head.className = 'lg-head';
    var progress = loadProgress();
    var total = (window.LAB_CHALLENGES || []).length;
    var passed = Object.keys(progress).filter(function (k) { return progress[k] === 'pass'; }).length;
    head.innerHTML = '<strong>採点パネル (' + passed + '/' + total + ')</strong>';
    head.addEventListener('click', function () { panel.classList.toggle('lg-collapsed'); });
    panel.appendChild(head);

    var body = document.createElement('div');
    body.className = 'lg-body';

    var challengeList = document.createElement('div');
    challengeList.className = 'lg-challenges';
    body.appendChild(challengeList);

    var hitLog = document.createElement('div');
    hitLog.className = 'lg-hitlog';
    body.appendChild(hitLog);

    var controls = document.createElement('div');
    var resetBtn = document.createElement('button');
    resetBtn.className = 'lg-btn';
    resetBtn.textContent = 'このページをリセット';
    resetBtn.addEventListener('click', function () {
      var prog = loadProgress();
      pageChallenges().forEach(function (c) { delete prog[c.id]; });
      saveProgress(prog);
      renderChallenges();
    });
    var exportBtn = document.createElement('button');
    exportBtn.className = 'lg-btn';
    exportBtn.textContent = 'エクスポート';
    exportBtn.addEventListener('click', function () {
      var payload = JSON.stringify({ progress: loadProgress(), hits: window.LabGrader.getHits() }, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload).catch(function () {});
      }
    });
    controls.appendChild(resetBtn);
    controls.appendChild(exportBtn);
    body.appendChild(controls);

    panel.appendChild(body);
    document.body.appendChild(panel);

    function renderChallenges() {
      var prog = loadProgress();
      var hits = window.LabGrader.getHits();
      var dupFlags = window.LabGrader.getDuplicateFlags();
      challengeList.innerHTML = '';
      pageChallenges().forEach(function (c) {
        var result = window.LabGrader.evaluate(c, hits);
        var dupHit = dupFlags.some(function (d) { return c.expect && d.event === c.expect.event; });
        if (dupHit) result = { status: 'fail', reason: '二重計上を検出しました（同一IDが再送されました）' };
        prog[c.id] = result.status;
        var row = document.createElement('div');
        row.className = 'lg-row';
        var label = result.status === 'pass' ? 'lg-pass' : result.status === 'fail' ? 'lg-fail' : 'lg-pending';
        row.innerHTML = '<span>' + c.title + '</span><span class="' + label + '">' +
          (result.status === 'pass' ? 'PASS' : result.status === 'fail' ? 'FAIL' : '…') + '</span>';
        row.title = result.reason;
        challengeList.appendChild(row);
      });
      saveProgress(prog);
      var newPassed = Object.keys(prog).filter(function (k) { return prog[k] === 'pass'; }).length;
      head.innerHTML = '<strong>採点パネル (' + newPassed + '/' + total + ')</strong>';
    }

    function renderHitLog(hit) {
      var row = document.createElement('div');
      row.className = 'lg-hit';
      row.textContent = new Date(hit.ts).toLocaleTimeString() + ' en=' + hit.event;
      var pre = document.createElement('pre');
      pre.style.display = 'none';
      pre.textContent = JSON.stringify(hit, null, 2);
      row.addEventListener('click', function () {
        pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
      });
      row.appendChild(pre);
      hitLog.insertBefore(row, hitLog.firstChild);
    }

    window.LabGrader.onHit(function (hit) {
      renderHitLog(hit);
      renderChallenges();
    });

    renderChallenges();
  }

  document.addEventListener('DOMContentLoaded', function () {
    injectStyle();
    renderPanel();
  });
```

- [ ] **Step 3: Expose the scenario API on `window.LabGrader`**

Add `registerScenarioSteps: registerScenarioSteps, runScenario: runScenario` to the enabled branch's `window.LabGrader = {...}` object, and no-op equivalents (`function () {}`) to the disabled branch (already present from Task 3/4 — just confirm they're there).

- [ ] **Step 4: Wire the full script order into `site/index.html`'s `<head>`**

```html
<script src="config.js"></script>
<script src="assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="assets/challenges.js"></script>
<script src="assets/site.js"></script>
```

Create an empty placeholder `site/assets/challenges.js` (`window.LAB_CHALLENGES = [];`) and an empty placeholder `site/assets/site.js` (`// populated in a later task`) so the page doesn't 404 — Tasks 6 and 7 fill these in for real.

- [ ] **Step 5: Verify panel renders and the disable switch works, via Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_snapshot
```
Expected: a `採点パネル (0/0)` panel visible bottom-right.

```
mcp__playwright__browser_evaluate → () => { document.querySelector('.lg-head').click(); return document.querySelector('.lg-panel').className; }
```
Expected: contains `lg-collapsed`.

For the disable check, use `browser_navigate` with an init script override — add via `mcp__playwright__browser_evaluate` before reload is not persistent, so instead temporarily edit `site/config.js`'s `LAB_GRADER_ENABLED` to `false`, reload, confirm `document.querySelector('.lg-panel')` is `null` and `window.LabGrader.enabled === false`, then revert the edit back to `true`.

- [ ] **Step 6: Commit**

```bash
git add site/assets/lab-grader.js site/assets/challenges.js site/assets/site.js site/index.html
git commit -m "feat: add grading panel UI, scenario runner, and full page wiring"
```

---

## STOP — Checkpoint

**Do not proceed to Task 6 until the user has manually verified Tasks 1–5.** This is the explicit instruction in the source spec (§7): the grading engine's ability to correctly capture and parse GA4 hits determines whether the rest of the project is worth building. Hand control back with:

> "Steps 1–5 done: Docker/nginx serving `localhost:8080`, and `lab-grader.js` intercepting `sendBeacon`/`fetch`/`XHR`/`Image.src`, parsing single and batched GA4 hits, evaluating challenges, detecting duplicates, and rendering a working panel. Please verify manually (e.g. point a real GTM container + GA4 tag at `localhost:8080` and confirm the panel's Hit Log shows real hits) before I continue to the challenge data and the 9 practice pages."

---

### Task 6: `challenges.js` data + `docs/CHALLENGES.md`

**Files:**
- Modify: `site/assets/challenges.js`
- Create: `docs/CHALLENGES.md`

**Interfaces:**
- Produces: `window.LAB_CHALLENGES` — the full 18-entry array every later page task must match exactly (same `id`, `page`, `expect.params` keys) so the grader actually passes when the learner wires up GTM correctly.

- [ ] **Step 1: Write the full `site/assets/challenges.js`**

```js
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
```

(18 entries — verify count with `grep -c "id: 'L" site/assets/challenges.js` = 18.)

- [ ] **Step 2: Write `docs/CHALLENGES.md`**

```markdown
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
```

- [ ] **Step 3: Verify via Playwright that the panel now shows real challenge counts**

```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_evaluate → () => document.querySelector('.lg-head').textContent
```
Expected: contains `(0/1)` (only `L1-01`, page `*`, applies to `/`).

- [ ] **Step 4: Commit**

```bash
git add site/assets/challenges.js docs/CHALLENGES.md
git commit -m "feat: define all 18 challenges and write CHALLENGES.md"
```

---

### Task 7: `site/assets/site.js` — shared legitimate helpers

**Files:**
- Modify: `site/assets/site.js`

**Interfaces:**
- Produces: `window.LabSite.parsePriceToNumber(text: string): number`, `window.LabSite.updateCartBadge(delta: number): void`, `window.LabSite.initConsentBanner(): void` — consumed by Tasks 8–16.

- [ ] **Step 1: Write `site/assets/site.js`**

```js
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
    var badge = document.querySelector('header .item span.item, header .badge, header span.badge');
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
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_evaluate → () => window.LabSite.parsePriceToNumber('¥12,800（税込）')
```
Expected: `12800`.

```
mcp__playwright__browser_snapshot
```
Expected: consent bar visible at the bottom with a "同意する" button; clicking it (via `browser_click`) removes it and `localStorage.lab_consent_v1 === 'granted'`.

- [ ] **Step 3: Commit**

```bash
git add site/assets/site.js
git commit -m "feat: add shared site.js helpers (price parsing, cart badge, consent banner)"
```

---

### Task 8: `/` homepage

**Files:**
- Modify: `site/index.html`

**Interfaces:**
- Consumes: `LabGrader.setScenarioContext` (Task 3), `LAB_CONFIG`, common header/footer markup (defined here, duplicated verbatim by every later page task).

- [ ] **Step 1: Write the canonical header/footer block (reused verbatim in every page task below)**

```html
<header class="box">
  <a class="link" href="/">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="/products/">商品一覧</a>
    <a class="link" href="/contact/">お問い合わせ</a>
    <a class="link" href="/blog/">ブログ</a>
    <a class="link" href="/modal/">資料請求</a>
    <a class="link" href="/embed/">埋め込みフォーム</a>
    <a class="link" href="/downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>
```

```html
<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="/">無料で試す</a>
</footer>
```

- [ ] **Step 2: Replace `site/index.html` body with the full homepage**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>GTM実践学習ラボ</title>
<link rel="stylesheet" href="assets/style.css">
<script src="config.js"></script>
<script src="assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="/">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="/products/">商品一覧</a>
    <a class="link" href="/contact/">お問い合わせ</a>
    <a class="link" href="/blog/">ブログ</a>
    <a class="link" href="/modal/">資料請求</a>
    <a class="link" href="/embed/">埋め込みフォーム</a>
    <a class="link" href="/downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1>GTM実践学習ラボ</h1>
  <p class="item">実務で詰まりがちなGTM設定を、意地悪なサイトで練習しましょう。</p>
  <a class="btn btn-primary" href="/products/">無料で試す</a>
</section>

<section class="box">
  <div class="card"><h3>Lv1〜5の18課題</h3><p class="item">基礎から二重計上対策まで。</p></div>
  <div class="card"><h3>自動採点</h3><p class="item">実際のGA4ヒットを見て判定します。</p></div>
  <div class="card"><h3>解答付き</h3><p class="item">詰まったら docs/ANSWERS.md へ。</p></div>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="/">無料で試す</a>
</footer>

<script src="assets/site.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    var footerCta = document.querySelector('footer .btn-primary');
    if (footerCta) {
      footerCta.addEventListener('click', function () {
        if (window.LabGrader) window.LabGrader.setScenarioContext('footer_cta_clicked');
        setTimeout(function () { if (window.LabGrader) window.LabGrader.setScenarioContext(null); }, 200);
      });
    }
  });
</script>
</body>
</html>
```

- [ ] **Step 3: Create `site/assets/style.css`** (minimal, shared across all pages)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Hiragino Sans", sans-serif; color: #222; line-height: 1.6; }
.box { padding: 16px; }
header.box { display: flex; justify-content: space-between; align-items: center; background: #fafafa; border-bottom: 1px solid #ddd; }
header nav.box { display: flex; gap: 12px; padding: 0; }
.link { color: #06c; text-decoration: none; }
.link:hover { text-decoration: underline; }
.btn { display: inline-block; padding: 10px 20px; border-radius: 4px; text-decoration: none; cursor: pointer; border: none; font-size: 14px; }
.btn-primary { background: #06c; color: #fff; }
.card { display: inline-block; width: 260px; margin: 8px; padding: 16px; border: 1px solid #ddd; border-radius: 6px; vertical-align: top; }
.item { margin: 4px 0; }
footer.box { background: #222; color: #ccc; text-align: center; padding: 24px; }
footer .item { color: #ccc; }
.badge { background: #06c; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 12px; }
```

- [ ] **Step 4: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/
mcp__playwright__browser_evaluate →
() => Array.from(document.querySelectorAll('.btn.btn-primary')).map(function(el){return el.textContent.trim();})
```
Expected: `["無料で試す", "無料で試す"]` — two elements, identical class and text (the intended trap).

- [ ] **Step 5: Commit**

```bash
git add site/index.html site/assets/style.css
git commit -m "feat: build homepage with hero/footer CTA trap"
```

---

### Task 9: `/products/` listing

**Files:**
- Create: `site/products/index.html`

**Interfaces:**
- Consumes: header/footer markup (Task 8), `style.css`, `LabGrader`/`LabSite`.

- [ ] **Step 1: Write `site/products/index.html`**

12 static cards (`sku=SKU-001` … `SKU-012`) plus JS-driven infinite scroll that appends more (`SKU-013`…) up to a cap, all sharing `class="card"`, so challenge L5-04 (view_item_list on scroll-loaded cards too) is meaningful.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>商品一覧 | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="./">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1>商品一覧</h1>
  <div class="box" data-role="grid">
  </div>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
(function () {
  var NAMES = ['ノートPC', 'ワイヤレスマウス', 'メカニカルキーボード', '4Kモニター', 'USBハブ', 'ヘッドセット',
    'Webカメラ', 'モバイルバッテリー', 'デスクライト', 'ケーブルオーガナイザー', 'ラップトップスタンド', 'マウスパッド'];
  var grid = document.querySelector('.box[data-role="grid"]') || document.querySelector('section .box');
  var loaded = 0;
  var MAX = 24;

  function makeCard(n) {
    var sku = 'SKU-' + String(n).padStart(3, '0');
    var name = NAMES[(n - 1) % NAMES.length] + '（' + n + '）';
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<h3>' + name + '</h3><p class="item">¥' + (1000 * (n % 20 + 1)).toLocaleString() + '（税込）</p>' +
      '<a class="btn btn-primary" href="detail.html?sku=' + sku + '">詳細を見る</a>';
    return card;
  }

  function loadMore(count) {
    for (var i = 0; i < count && loaded < MAX; i++) {
      loaded++;
      grid.appendChild(makeCard(loaded));
    }
  }

  loadMore(12);

  window.addEventListener('scroll', function () {
    if (loaded >= MAX) return;
    var nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
    if (nearBottom) loadMore(6);
  });

  // ビューポート進入検知（view_item_list用のフック。挙動確認のみ、dataLayer pushはしない）
  if ('IntersectionObserver' in window) {
    var seen = new WeakSet();
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !seen.has(entry.target)) {
          seen.add(entry.target);
          entry.target.classList.add('is-viewed'); // 学習者がGTMのElement Visibilityトリガーで使う汎用マーカー
        }
      });
    }, { threshold: 0.5 });
    var mo = new MutationObserver(function () {
      grid.querySelectorAll('.card:not(.is-observed)').forEach(function (card) {
        card.classList.add('is-observed');
        observer.observe(card);
      });
    });
    mo.observe(grid, { childList: true });
    grid.querySelectorAll('.card').forEach(function (card) { card.classList.add('is-observed'); observer.observe(card); });
  }
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/products/
mcp__playwright__browser_evaluate → () => document.querySelectorAll('.card').length
```
Expected: `12`.

```
mcp__playwright__browser_evaluate → () => { window.scrollTo(0, document.body.scrollHeight); return true; }
```
Wait ~500ms, then:
```
mcp__playwright__browser_evaluate → () => document.querySelectorAll('.card').length
```
Expected: `18` (12 + 6 more loaded).

```
mcp__playwright__browser_evaluate → () => new URL(document.querySelector('.card a').href).searchParams.get('sku')
```
Expected: `"SKU-001"`.

- [ ] **Step 3: Commit**

```bash
git add site/products/index.html
git commit -m "feat: build /products/ listing with infinite scroll and identical card markup"
```

---

### Task 10: `/products/detail.html`

**Files:**
- Create: `site/products/detail.html`

**Interfaces:**
- Consumes: `LabSite.parsePriceToNumber`, `LabSite.updateCartBadge` (Task 7), `sku` from `location.search`.

- [ ] **Step 1: Write `site/products/detail.html`**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>商品詳細 | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="./">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1 class="item">商品詳細</h1>
  <p class="item"><span class="price">¥12,800（税込）</span></p>
  <button class="btn btn-primary" type="button">カートに追加</button>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(location.search);
  var sku = params.get('sku') || 'SKU-000';
  var btn = document.querySelector('section .btn-primary');
  btn.addEventListener('click', function () {
    window.LabSite.updateCartBadge(1);
    btn.textContent = 'カートに追加済み';
  });
  window.__labSku = sku; // ページ内スクリプト間の受け渡し用。GTM向けの計測ヒントではない
});
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/products/detail.html?sku=SKU-007
mcp__playwright__browser_evaluate → () => window.LabSite.parsePriceToNumber(document.querySelector('.price').textContent)
```
Expected: `12800`.

```
mcp__playwright__browser_click → button "カートに追加"
mcp__playwright__browser_evaluate → () => document.querySelector('header .badge').textContent
```
Expected: `"1"`.

- [ ] **Step 3: Commit**

```bash
git add site/products/detail.html
git commit -m "feat: build /products/detail.html with text-only price and no-href add-to-cart"
```

---

### Task 11: `/contact/`

**Files:**
- Create: `site/contact/index.html`

**Interfaces:**
- Produces: registers scenario steps `fill_form_fail`/`fill_form_success`/`click_submit` via `LabGrader.registerScenarioSteps('/contact/', {...})` (consumed by the panel's scenario runner, Task 5).

- [ ] **Step 1: Write `site/contact/index.html`**

Form is built 800ms after `DOMContentLoaded`; submit is a mocked `fetch`; `fail@example.com` triggers a failure branch tagged with scenario context `submit_failed`; success swaps the form DOM for a thanks message without navigating.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>お問い合わせ | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="./">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1>お問い合わせ</h1>
  <div class="box" data-role="form-mount">
    <p class="item">読み込み中…</p>
  </div>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
(function () {
  var mount = document.querySelector('[data-role="form-mount"]') || document.querySelector('section .box');

  function renderForm() {
    mount.innerHTML =
      '<div class="box"><label class="item">お名前<br><input class="box" type="text" name="name"></label></div>' +
      '<div class="box"><label class="item">メールアドレス<br><input class="box" type="email" name="email"></label></div>' +
      '<button class="btn btn-primary" type="button">送信する</button>' +
      '<p class="item" data-role="error" style="display:none;color:#c00;">送信に失敗しました。時間をおいて再度お試しください。</p>';

    mount.querySelector('.btn-primary').addEventListener('click', function () {
      submitForm();
    });
  }

  function submitForm() {
    var email = mount.querySelector('input[type="email"]').value;
    var isFail = email === 'fail@example.com';

    if (isFail && window.LabGrader) window.LabGrader.setScenarioContext('submit_failed');

    // モックfetch: 失敗シナリオはrejectする実装だが、実際のネットワークには一切送出しない疑似APIとして
    // Promiseで表現する（本物のfetchはlab-grader.jsの傍受対象APIそのものなので、ここでは別名で呼び出す）
    mockSubmit(isFail).then(function () {
      mount.innerHTML = '<h2 class="item">送信ありがとうございました</h2><p class="item">担当者よりご連絡いたします。</p>';
      if (window.LabGrader) window.LabGrader.setScenarioContext(null);
    }).catch(function () {
      mount.querySelector('[data-role="error"]').style.display = 'block';
      setTimeout(function () { if (window.LabGrader) window.LabGrader.setScenarioContext(null); }, 500);
    });
  }

  function mockSubmit(isFail) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () { isFail ? reject(new Error('mock failure')) : resolve(); }, 300);
    });
  }

  setTimeout(renderForm, 800);

  if (window.LabGrader) {
    window.LabGrader.registerScenarioSteps('/contact/', {
      fill_form_fail: function () {
        return new Promise(function (resolve) {
          var check = setInterval(function () {
            var email = mount.querySelector('input[type="email"]');
            if (email) {
              clearInterval(check);
              mount.querySelector('input[name="name"]').value = 'テスト太郎';
              email.value = 'fail@example.com';
              resolve();
            }
          }, 100);
        });
      },
      fill_form_success: function () {
        return new Promise(function (resolve) {
          var check = setInterval(function () {
            var email = mount.querySelector('input[type="email"]');
            if (email) {
              clearInterval(check);
              mount.querySelector('input[name="name"]').value = 'テスト太郎';
              email.value = 'ok@example.com';
              resolve();
            }
          }, 100);
        });
      },
      click_submit: function () {
        var btn = mount.querySelector('.btn-primary');
        if (btn) btn.click();
      }
    });
  }
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/contact/
```
Wait ~1000ms, then:
```
mcp__playwright__browser_evaluate → () => !!document.querySelector('input[type="email"]')
```
Expected: `true`.

```
mcp__playwright__browser_evaluate → () => window.LabGrader.runScenario('/contact/', ['fill_form_fail', 'click_submit'])
```
Wait ~1000ms, then:
```
mcp__playwright__browser_evaluate → () => document.querySelector('[data-role="error"]').style.display
```
Expected: `"block"` (failure path rendered, and no `generate_lead` should have been recorded with context other than `submit_failed`).

Reload, wait 1000ms, run `fill_form_success`/`click_submit`, then confirm the thanks message renders:
```
mcp__playwright__browser_evaluate → () => document.querySelector('section h2') && document.querySelector('section h2').textContent
```
Expected: `"送信ありがとうございました"`.

- [ ] **Step 3: Commit**

```bash
git add site/contact/index.html
git commit -m "feat: build /contact/ with delayed form generation and mocked success/failure submit"
```

---

### Task 12: `/thanks/`

**Files:**
- Create: `site/thanks/index.html`

- [ ] **Step 1: Write `site/thanks/index.html`**

The site itself does nothing to prevent double counting — that's the learner's job in GTM. It just renders differently based on `?tid=` presence.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ご注文ありがとうございます | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <div class="box" data-role="content"></div>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(location.search);
  var tid = params.get('tid');
  var content = document.querySelector('[data-role="content"]') || document.querySelector('section .box');
  if (tid) {
    content.innerHTML = '<h1 class="item">ご注文ありがとうございます</h1>' +
      '<p class="item">注文番号: <span class="item">' + tid.replace(/[<>]/g, '') + '</span></p>' +
      '<p class="item">ご購入金額: <span class="price">¥12,800（税込）</span></p>';
  } else {
    content.innerHTML = '<h1 class="item">ページが見つかりません</h1>' +
      '<p class="item">正しいご注文完了リンクからアクセスしてください。</p>';
  }
});
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/thanks/?tid=ORDER-123
mcp__playwright__browser_evaluate → () => document.querySelector('section h1').textContent
```
Expected: `"ご注文ありがとうございます"`.

```
mcp__playwright__browser_navigate → http://localhost:8080/thanks/
mcp__playwright__browser_evaluate → () => document.querySelector('section h1').textContent
```
Expected: `"ページが見つかりません"`.

- [ ] **Step 3: Commit**

```bash
git add site/thanks/index.html
git commit -m "feat: build /thanks/ with tid-conditional rendering (no dedup logic — that's the exercise)"
```

---

### Task 13: `/blog/`

**Files:**
- Create: `site/blog/index.html`

- [ ] **Step 1: Write `site/blog/index.html`**

Infinite-scroll article list; clicking an article does `history.pushState` to `?post=xx`, swaps content via JS (no real navigation), supports `popstate` for back button; tracks 60s engaged-read per article with a resettable timer (exposed only as a DOM class change — no dataLayer push).

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>ブログ | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="./">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box" data-role="view"></section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
(function () {
  var TITLES = ['GTMの基本を学ぶ', 'データレイヤー設計のコツ', '二重計上を防ぐ方法', 'SPAでのpage_view設計',
    'GA4のイベント設計', 'Consent Modeの導入手順', 'デバッグの実践', 'サーバーサイド計測入門'];
  var view = document.querySelector('[data-role="view"]') || document.querySelector('section.box');
  var loadedCount = 0;
  var engageTimer = null;
  var engageStart = 0;

  function articleId(n) { return 'post-' + n; }

  function renderList() {
    clearEngageTimer();
    var html = '<h1>ブログ</h1><div class="box" data-role="list"></div>';
    view.innerHTML = html;
    loadedCount = 0;
    loadMore(6);
    window.addEventListener('scroll', onScroll);
  }

  function onScroll() {
    if (!document.querySelector('[data-role="list"]')) return;
    var nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 300;
    if (nearBottom) loadMore(4);
  }

  function loadMore(count) {
    var list = document.querySelector('[data-role="list"]');
    if (!list) return;
    for (var i = 0; i < count && loadedCount < 20; i++) {
      loadedCount++;
      var n = loadedCount;
      var card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<h3>' + TITLES[(n - 1) % TITLES.length] + '（' + n + '）</h3>' +
        '<a class="link" href="?post=' + articleId(n) + '">続きを読む</a>';
      card.querySelector('.link').addEventListener('click', function (e) {
        e.preventDefault();
        var id = new URL(e.target.href).searchParams.get('post');
        history.pushState({ post: id }, '', '?post=' + id);
        renderArticle(id);
      });
      list.appendChild(card);
    }
  }

  function clearEngageTimer() {
    if (engageTimer) { clearTimeout(engageTimer); engageTimer = null; }
  }

  function renderArticle(id) {
    clearEngageTimer();
    window.removeEventListener('scroll', onScroll);
    var n = parseInt(id.replace('post-', ''), 10) || 1;
    view.innerHTML = '<a class="link" href="./">一覧へ戻る</a>' +
      '<h1>' + TITLES[(n - 1) % TITLES.length] + '</h1>' +
      '<p class="item">本文のダミーテキストです。'.repeat ? '<p class="item">' + '本文のダミーテキストです。'.repeat(20) + '</p>' : '<p class="item">本文のダミーテキストです。</p>';
    engageStart = Date.now();
    engageTimer = setTimeout(function () {
      view.classList.add('is-engaged'); // 60秒閲覧の汎用マーカー。GTMのタイマー/カスタムJS変数と組み合わせて使う
    }, 60000);
  }

  function render() {
    var params = new URLSearchParams(location.search);
    var post = params.get('post');
    if (post) renderArticle(post); else renderList();
  }

  window.addEventListener('popstate', render);
  render();
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/blog/
mcp__playwright__browser_evaluate → () => document.querySelectorAll('.card').length
```
Expected: `6`.

```
mcp__playwright__browser_click → first article's "続きを読む" link
mcp__playwright__browser_evaluate → () => location.search
```
Expected: `"?post=post-1"` (URL changed without full navigation).

```
mcp__playwright__browser_navigate_back
mcp__playwright__browser_evaluate → () => !!document.querySelector('[data-role="list"]')
```
Expected: `true` (back button restores the list view via `popstate`).

- [ ] **Step 3: Commit**

```bash
git add site/blog/index.html
git commit -m "feat: build /blog/ with infinite scroll, pushState SPA nav, and 60s engaged-read timer"
```

---

### Task 14: `/modal/`

**Files:**
- Create: `site/modal/index.html`

- [ ] **Step 1: Write `site/modal/index.html`**

Three structurally-differentiated trigger locations (semantic landmarks — `<header>`/`<aside>`/`<footer>` — not classes or ids), each opening an identical modal DOM structure. The site tags scenario context per-trigger purely for the grader's own bookkeeping (not `dataLayer`), matching the Grading Engine Design Notes.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>資料請求 | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="./">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
  <button class="btn" type="button">資料請求</button>
</header>

<section class="box">
  <h1>資料請求</h1>
  <aside class="box">
    <p class="item">サイドバーからのご請求はこちら</p>
    <button class="btn" type="button">資料請求</button>
  </aside>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <button class="btn" type="button">資料請求</button>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<div class="box" data-role="modal-root"></div>

<script src="../assets/site.js"></script>
<script>
(function () {
  var LOCATIONS = { HEADER: 'header', ASIDE: 'sidebar', FOOTER: 'footer' };
  var root = document.querySelector('[data-role="modal-root"]');

  function modalMarkup() {
    return '<div class="box">' +
      '<div class="box">' +
      '<label class="item">お名前<br><input class="box" type="text" name="name"></label>' +
      '<label class="item">メールアドレス<br><input class="box" type="email" name="email"></label>' +
      '<button class="btn btn-primary" type="button">送信する</button>' +
      '<button class="btn" type="button" data-role="close">閉じる</button>' +
      '</div></div>';
  }

  function openModal(location) {
    root.innerHTML = modalMarkup();
    if (window.LabGrader) window.LabGrader.setScenarioContext('modal_' + location);
    var nameInput = root.querySelector('input[name="name"]');
    var fired = false;
    function markStart() {
      if (fired) return;
      fired = true;
      // form_startの発火材料はGTM側で用意する（フォーカスイベント等）。ここではlocationの記録のみ。
    }
    nameInput.addEventListener('focus', markStart, { once: true });
    root.querySelector('[data-role="close"]').addEventListener('click', function () {
      root.innerHTML = '';
      if (window.LabGrader) window.LabGrader.setScenarioContext(null);
    });
  }

  document.querySelector('header .btn').addEventListener('click', function () { openModal(LOCATIONS.HEADER); });
  document.querySelector('aside .btn').addEventListener('click', function () { openModal(LOCATIONS.ASIDE); });
  document.querySelector('footer .btn:not(.btn-primary)').addEventListener('click', function () { openModal(LOCATIONS.FOOTER); });
})();
</script>
</body>
</html>
```

- [ ] **Step 2: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/modal/
mcp__playwright__browser_click → header "資料請求" button
mcp__playwright__browser_evaluate → () => !!document.querySelector('[data-role="modal-root"] input[name="email"]')
```
Expected: `true`.

```
mcp__playwright__browser_click → "閉じる"
mcp__playwright__browser_click → aside "資料請求" button
mcp__playwright__browser_evaluate → () => !!document.querySelector('[data-role="modal-root"] input[name="email"]')
```
Expected: `true` (same structure reopened from a different trigger).

- [ ] **Step 3: Commit**

```bash
git add site/modal/index.html
git commit -m "feat: build /modal/ with three structurally-identical triggers and modals"
```

---

### Task 15: `/embed/` (parent + iframe form)

**Files:**
- Create: `site/embed/index.html`
- Create: `site/embed/form.html`

- [ ] **Step 1: Write `site/embed/form.html`** (loaded inside the iframe; same-origin, posts a message to the parent on submit — no `dataLayer` push, since this is a distinct GTM container the learner must bridge themselves)

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex,nofollow">
<title>資料請求フォーム</title>
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>
<div class="box">
  <label class="item">お名前<br><input class="box" type="text" name="name"></label>
  <label class="item">メールアドレス<br><input class="box" type="email" name="email"></label>
  <button class="btn btn-primary" type="button">送信する</button>
  <p class="item" data-role="done" style="display:none;">送信しました。</p>
</div>
<script>
document.querySelector('.btn-primary').addEventListener('click', function () {
  document.querySelector('[data-role="done"]').style.display = 'block';
  // 同一オリジンiframe → 親ページへの通知。GTM連携（dataLayer反映）は学習者が親ページ側で実装する。
  window.parent.postMessage({ source: 'gtm-lab-embed-form', formId: 'embed_contact' }, window.location.origin);
});
</script>
</body>
</html>
```

- [ ] **Step 2: Write `site/embed/index.html`**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>埋め込みフォーム | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="./">埋め込みフォーム</a>
    <a class="link" href="../downloads/">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1>埋め込みフォーム</h1>
  <p class="item">このフォームは同一オリジンiframeとして埋め込まれています。</p>
  <iframe src="form.html" style="width:100%;max-width:480px;height:260px;border:1px solid #ddd;"></iframe>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
<script>
// 親ページ側でpostMessageを受け取る仕組みだけ用意する。dataLayerへの反映はGTM側（学習者）が行う。
window.addEventListener('message', function (event) {
  if (event.origin !== window.location.origin) return;
  if (!event.data || event.data.source !== 'gtm-lab-embed-form') return;
  window.__lastEmbedFormMessage = event.data; // GTMのCustom HTML/Listenerタグから参照できるよう保持するだけ
});
</script>
</body>
</html>
```

- [ ] **Step 3: Verify with Playwright**

```
mcp__playwright__browser_navigate → http://localhost:8080/embed/
mcp__playwright__browser_evaluate → () => !!document.querySelector('iframe')
```
Expected: `true`.

Interact inside the iframe (Playwright can target frames by index/URL):
```
mcp__playwright__browser_click → the iframe's "送信する" button
mcp__playwright__browser_evaluate → () => window.__lastEmbedFormMessage
```
Expected: `{ source: "gtm-lab-embed-form", formId: "embed_contact" }`.

- [ ] **Step 4: Commit**

```bash
git add site/embed/index.html site/embed/form.html
git commit -m "feat: build /embed/ same-origin iframe form with postMessage bridge"
```

---

### Task 16: `/downloads/` + dummy files

**Files:**
- Create: `site/downloads/index.html`
- Create: `site/downloads/files/*.pdf`, `*.xlsx`, `*.zip` (17 dummy download targets)

- [ ] **Step 1: Generate 17 small dummy files (~1KB each) via shell**

```bash
mkdir -p site/downloads/files
for i in $(seq 1 6); do
  head -c 1024 /dev/urandom > "site/downloads/files/資料${i}.pdf"
done
for i in $(seq 1 6); do
  head -c 1024 /dev/urandom > "site/downloads/files/レポート${i}.xlsx"
done
for i in $(seq 1 5); do
  head -c 1024 /dev/urandom > "site/downloads/files/データ${i}.zip"
done
ls site/downloads/files | wc -l
```
Expected: `17`.

- [ ] **Step 2: Write `site/downloads/index.html`**

17 links to `files/...` (relative, Japanese filenames — the browser handles URL-encoding automatically for `href`) plus 3 links to real external domains, all `class="link"`, extension only inferable from `href`.

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>資料ダウンロード | GTM実践学習ラボ</title>
<link rel="stylesheet" href="../assets/style.css">
<script src="../config.js"></script>
<script src="../assets/lab-grader.js"></script>
<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',window.LAB_CONFIG.GTM_ID);</script>
<!-- End Google Tag Manager -->
<script src="../assets/challenges.js"></script>
</head>
<body>
<header class="box">
  <a class="link" href="../">GTM実践学習ラボ</a>
  <nav class="box">
    <a class="link" href="../products/">商品一覧</a>
    <a class="link" href="../contact/">お問い合わせ</a>
    <a class="link" href="../blog/">ブログ</a>
    <a class="link" href="../modal/">資料請求</a>
    <a class="link" href="../embed/">埋め込みフォーム</a>
    <a class="link" href="./">資料ダウンロード</a>
  </nav>
  <span class="item">カート: <span class="badge">0</span></span>
</header>

<section class="box">
  <h1>資料ダウンロード</h1>
  <ul class="box">
    <li><a class="link" href="files/資料1.pdf">資料1.pdf</a></li>
    <li><a class="link" href="files/資料2.pdf">資料2.pdf</a></li>
    <li><a class="link" href="files/資料3.pdf">資料3.pdf</a></li>
    <li><a class="link" href="files/資料4.pdf">資料4.pdf</a></li>
    <li><a class="link" href="files/資料5.pdf">資料5.pdf</a></li>
    <li><a class="link" href="files/資料6.pdf">資料6.pdf</a></li>
    <li><a class="link" href="files/レポート1.xlsx">レポート1.xlsx</a></li>
    <li><a class="link" href="files/レポート2.xlsx">レポート2.xlsx</a></li>
    <li><a class="link" href="files/レポート3.xlsx">レポート3.xlsx</a></li>
    <li><a class="link" href="files/レポート4.xlsx">レポート4.xlsx</a></li>
    <li><a class="link" href="files/レポート5.xlsx">レポート5.xlsx</a></li>
    <li><a class="link" href="files/レポート6.xlsx">レポート6.xlsx</a></li>
    <li><a class="link" href="files/データ1.zip">データ1.zip</a></li>
    <li><a class="link" href="files/データ2.zip">データ2.zip</a></li>
    <li><a class="link" href="files/データ3.zip">データ3.zip</a></li>
    <li><a class="link" href="files/データ4.zip">データ4.zip</a></li>
    <li><a class="link" href="files/データ5.zip">データ5.zip</a></li>
    <li><a class="link" href="https://www.example.com/">関連情報（外部サイト）</a></li>
    <li><a class="link" href="https://developers.google.com/tag-platform">GTM公式ドキュメント（外部サイト）</a></li>
    <li><a class="link" href="https://support.google.com/analytics">GA4ヘルプ（外部サイト）</a></li>
  </ul>
</section>

<footer class="box">
  <p class="item">GTM実践学習ラボ（練習用ダミーサイト・検索非対象）</p>
  <a class="btn btn-primary" href="../">無料で試す</a>
</footer>

<script src="../assets/site.js"></script>
</body>
</html>
```

- [ ] **Step 3: Verify with Playwright + curl**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:8080/downloads/files/%E8%B3%87%E6%96%991.pdf"
```
Expected: `200`.

```
mcp__playwright__browser_navigate → http://localhost:8080/downloads/
mcp__playwright__browser_evaluate →
() => Array.from(document.querySelectorAll('.link')).filter(function(a){return a.hostname !== location.hostname;}).length
```
Expected: `3`.

- [ ] **Step 4: Commit**

```bash
git add site/downloads/
git commit -m "feat: build /downloads/ with 17 dummy files and 3 external links"
```

---

### Task 17: Integration pass — noindex/consent/robots consistency + `/blog/?post=` deep-link fix

**Files:**
- Modify: every `site/**/*.html` created so far (verification only — fix any gaps found)

**Interfaces:**
- Consumes: all pages from Tasks 8–16.

- [ ] **Step 1: Verify every page has the noindex meta tag**

Run: `grep -L 'name="robots" content="noindex,nofollow"' site/*.html site/*/*.html`
Expected: no output (empty = every file has it). Fix any file missing it.

- [ ] **Step 2: Verify every page loads `config.js` and `lab-grader.js` first, in that order, before the GTM snippet**

Run: `for f in site/index.html site/*/*.html; do echo "== $f =="; grep -n "config.js\|lab-grader.js\|googletagmanager" "$f"; done`
Expected: in every file, `config.js` line number < `lab-grader.js` line number < `googletagmanager.com/gtm.js` line number. Fix any file out of order.

- [ ] **Step 3: Verify no `id="` attributes and no `data-*` measurement-hint attributes slipped in**

Run: `grep -rn 'id="' site/*.html site/*/*.html; grep -rn 'data-' site/*.html site/*/*.html`

Note: `data-role` attributes used as JS DOM mount points (e.g. `data-role="form-mount"`) are acceptable — they are generic structural hooks used by the page's own script, not measurement-hint attributes exposing IDs/SKUs/event names to GTM. Confirm none of the matches expose something like `data-sku=`, `data-event=`, or `data-track=`. Fix any that do.

- [ ] **Step 4: Full-site Playwright smoke test — every page loads with a working grading panel and zero console errors**

For each of `/`, `/products/`, `/products/detail.html?sku=SKU-001`, `/contact/`, `/thanks/?tid=T1`, `/thanks/`, `/blog/`, `/modal/`, `/embed/`, `/downloads/`:
```
mcp__playwright__browser_navigate → http://localhost:8080<path>
mcp__playwright__browser_console_messages
mcp__playwright__browser_evaluate → () => !!document.querySelector('.lg-panel')
```
Expected: no `error`-level console messages, panel present, on every page.

- [ ] **Step 5: Fix any issues found, then commit**

```bash
git add -A
git commit -m "fix: integration pass — consistent noindex, script order, and no measurement hints"
```

---

### Task 18: `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (already exists with the required header and a "会話言語: 日本語" section — preserve that section verbatim, add the rest below it)

- [ ] **Step 1: Extend `CLAUDE.md`**

Keep the existing header and "会話言語" section as-is. Add (in the standard CLAUDE.md format — commands + architecture, no fluff):
- `docker compose up -d` / `down`, `http://localhost:8080`, no build step, no Node.
- How to set `GTM_ID`/`GA4_MEASUREMENT_ID` in `site/config.js` before testing against a real container.
- The Global Constraints and Grading Engine Design Notes from this plan (they define invariants future changes must not break: script load order, no `id`/`data-*` hints, `dataLayer.push` never called from `site/`, `LAB_GRADER_ENABLED=false` fully disables the panel).
- Where the 18 challenges live (`site/assets/challenges.js` is data, `site/assets/lab-grader.js` is the engine) and the `page: '*'` / `observe_ms` / `setScenarioContext` extensions this project adds on top of the spec's literal schema.
- Pointer to `docs/CHALLENGES.md` (problem statements), `docs/ANSWERS.md` (solutions — do not read ahead of solving), `docs/VERIFICATION.md` (how to check work with GTM Preview + GA4 DebugView + the panel).
- `deploy.sh` deploys `site/` as-is to ConoHa Wing; relative paths are load-bearing — never introduce an absolute `/assets/...` reference.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md for future agent sessions"
```

---

### Task 19: `docs/VERIFICATION.md`

**Files:**
- Create: `docs/VERIFICATION.md`

- [ ] **Step 1: Write `docs/VERIFICATION.md`** covering the three-way verification workflow:
  1. **GTM Preview (Tag Assistant)** — connect to `localhost:8080`, confirm which tags/triggers/variables fired per interaction.
  2. **GA4 DebugView** — for `localhost`, hits need `ep.debug_mode=true` (or the GTM "Debug mode" variable) attached to reach DebugView; explain how to toggle it via a GTM Preview-only variable so production hits aren't polluted.
  3. **Grading panel** — the ground truth for this project, since it reads the actual wire format, independent of both of the above.
  Explain the recommended order: use GTM Preview to see what *should* fire, GA4 DebugView to see it land in GA4's UI, and the grading panel as the final automated check.

- [ ] **Step 2: Commit**

```bash
git add docs/VERIFICATION.md
git commit -m "docs: add GTM Preview / GA4 DebugView / grading panel verification workflow"
```

---

### Task 20: `docs/ANSWERS.md`

**Files:**
- Create: `docs/ANSWERS.md`

- [ ] **Step 1: Write `docs/ANSWERS.md`**

Opens with a bold "先に自力で解くこと" warning, then a `<details>`-collapsed section per challenge ID (matching `docs/CHALLENGES.md`), each giving: trigger type, variable types (including exact Custom JavaScript Variable code where needed, e.g. for price-text parsing or `closest('header,aside,footer')` DOM traversal for the modal challenge), and a one-paragraph rationale for why that approach over alternatives. Since this doc's content is GTM configuration guidance (not code the site runs), write it as prose + fenced JS snippets for Custom JS Variables, e.g.:

```markdown
# 解答編

**先に自力で解くこと。** このドキュメントは詰まった時にだけ開いてください。

<details><summary>L1-01: 全ページでpage_viewが1回だけ飛ぶ</summary>

GA4設定タグを「All Pages」トリガーで1つだけ配置する。ページビュートリガーを複数重ねない。
...
</details>

<details><summary>L2-01: ヒーローCTAのみcta_click</summary>

hrefやテキストが同一のため、CSSセレクタの位置情報（`main > .box:first-child a.btn`）か、
Custom JavaScript Variableで`closest`を使った祖先判定が必要:

```js
function() {
  var el = {{Click Element}};
  return el && el.closest('footer') ? 'footer' : 'hero';
}
```
このタグの発火条件に「変数が"hero"と一致」を追加する。
</details>
```

(Continue with one `<details>` block per remaining challenge — all 18 — following this pattern, grounded in the actual DOM structure written in Tasks 8–16.)

- [ ] **Step 2: Commit**

```bash
git add docs/ANSWERS.md
git commit -m "docs: add GTM solutions for all 18 challenges"
```

---

### Task 21: `README.md`

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`** covering:
  - Prerequisites: Docker, a GTM container, a GA4 property.
  - Startup: `docker compose up -d` → `http://localhost:8080`.
  - Configuring `site/config.js` with real `GTM_ID`/`GA4_MEASUREMENT_ID`.
  - ConoHa Wing deploy: create the subdomain, then run `./deploy.sh`.
  - **Publish-time caution**: `robots.txt` already blocks all crawlers, every page has `noindex,nofollow`; additionally recommend Basic Auth on the hosting side since this is a practice dummy site that must not get indexed.
  - How to use the grading panel (collapse/expand, hit log, reset, export, `LAB_GRADER_ENABLED=false` to disable).

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: write README with setup, deploy, and grading panel usage"
```

---

### Task 22: `deploy.sh` + `.env.example`

**Files:**
- Create: `deploy.sh`
- Create: `.env.example`

**Interfaces:**
- Consumes: `.env` (gitignored) with `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_REMOTE_DIR`.

- [ ] **Step 1: Write `.env.example`**

```
FTP_HOST=example.conoha.ne.jp
FTP_USER=your-ftp-user
FTP_PASS=your-ftp-password
FTP_REMOTE_DIR=/public_html
```

- [ ] **Step 2: Write `deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "エラー: .env が見つかりません。.env.example をコピーして値を設定してください。" >&2
  exit 1
fi
# shellcheck disable=SC1091
source .env

: "${FTP_HOST:?FTP_HOST が未設定です}"
: "${FTP_USER:?FTP_USER が未設定です}"
: "${FTP_PASS:?FTP_PASS が未設定です}"
: "${FTP_REMOTE_DIR:?FTP_REMOTE_DIR が未設定です}"

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
fi

if grep -q "GTM-XXXXXXX" site/config.js; then
  echo "警告: site/config.js がまだプレースホルダのGTM IDのままです。"
  read -r -p "本当に転送しますか？ [y/N] " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "中止しました。"
    exit 1
  fi
fi

LFTP_CMD="mirror -R --delete --verbose site/ ${FTP_REMOTE_DIR}"
if [ "$DRY_RUN" = true ]; then
  LFTP_CMD="${LFTP_CMD} --dry-run"
fi

lftp -u "${FTP_USER},${FTP_PASS}" "ftps://${FTP_HOST}" -e "${LFTP_CMD}; bye"
```

- [ ] **Step 3: Make it executable and verify `--dry-run` errors cleanly without `.env`**

```bash
chmod +x deploy.sh
./deploy.sh --dry-run
```
Expected: exits 1 with the ".env が見つかりません" message (since `.env` is intentionally not created in this repo).

- [ ] **Step 4: Commit**

```bash
git add deploy.sh .env.example
git commit -m "feat: add deploy.sh for lftp sync to ConoHa Wing"
```

---

### Task 23: Final full-site verification and tag

**Files:** none (verification only)

- [ ] **Step 1: Full stack rebuild and smoke test**

```bash
docker compose down && docker compose up -d
sleep 1
for path in / /products/ /products/detail.html /contact/ /thanks/ /blog/ /modal/ /embed/ /downloads/ /404-does-not-exist; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080${path}")
  echo "${path} -> ${code}"
done
```
Expected: `200` for every real path, `404` for the last one.

- [ ] **Step 2: Confirm `git status` is clean and all prior commits are present**

Run: `git log --oneline | cat` and `git status --short`
Expected: one commit per task above, working tree clean.

- [ ] **Step 3: Report completion to the user**

Summarize: stack running at `http://localhost:8080`, 18 challenges across 9 pages, docs written, `deploy.sh` ready (needs a real `.env`), and that `site/config.js` still has placeholder GTM/GA4 IDs the user must fill in before real end-to-end testing.
