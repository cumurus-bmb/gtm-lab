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
      runScenario: function () {},
      evaluate: function () { return { status: 'pending', reason: 'grader disabled' }; },
      getDuplicateFlags: function () { return []; }
    };
    return;
  }

  var COLLECT_URL_RE = /^https:\/\/(www\.)?(google-analytics\.com|analytics\.google\.com)\/g\/collect(?:$|[/?])/;

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

  function notify(hit) {
    checkSessionDedup(hit);
    hit.rapidDuplicate = checkRapidDuplicate(hit);
    hits.push(hit);
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](hit); } catch (e) { /* one bad listener must not break others */ }
    }
  }

  function parseAndEmit(url, bodyStr) {
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

  // Scenario registry and runner
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

  // Panel UI
  var PROGRESS_KEY = 'labgrader_progress_v1';

  function currentPath() {
    return location.pathname;
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

  window.LabGrader = {
    enabled: true,
    getHits: function () { return hits.slice(); },
    onHit: function (fn) { listeners.push(fn); },
    setScenarioContext: function (name) { currentContext = name || null; },
    registerScenarioSteps: registerScenarioSteps,
    runScenario: runScenario,
    evaluate: evaluateChallenge,
    getDuplicateFlags: function () { return dupFlags.slice(); },
    _internal: { buildNormalizedHit: buildNormalizedHit, parseParamString: parseParamString }
  };
})();
