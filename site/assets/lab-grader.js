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

  window.LabGrader = {
    enabled: true,
    getHits: function () { return hits.slice(); },
    onHit: function (fn) { listeners.push(fn); },
    setScenarioContext: function (name) { currentContext = name || null; },
    evaluate: evaluateChallenge,
    getDuplicateFlags: function () { return dupFlags.slice(); },
    _internal: { buildNormalizedHit: buildNormalizedHit, parseParamString: parseParamString }
  };
})();
