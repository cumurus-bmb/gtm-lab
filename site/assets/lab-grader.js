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
