'use strict';
// Minimal drop-in for the deprecated `request` library, backed by axios.
// Preserves the callback semantics the codebase relies on:
//   http(opts, cb) / http.post(opts, cb)      -> cb(e, resp, body)
//   resp.statusCode, resp.headers, resp.request.uri.href
//   opts.json (json body + parsed response), opts.form (urlencoded body)
//   http.defaults({jar: true, headers}) for cookie-aware login flows
//   http.debug for -vv tracing
// HTTP error statuses resolve normally so plugin.checkError stays the
// single place mapping them to errors.
var axios = require('axios');

var http = function(opts, cb) {
  if (typeof opts === 'string') opts = {url: opts};
  send(null, opts, cb);
};

http.debug = false;

function trace(line) {
  // matches the 'REQUEST ' prefix cli.js routes to log.trace
  if (http.debug) console.error(line);
}

function parseSetCookie(line) {
  var kv = line.split(';')[0].split('=');
  return kv.length < 2 ? null : [kv[0].trim(), kv.slice(1).join('=').trim()];
}

function encodeForm(form) {
  return Object.keys(form).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(form[k]);
  }).join('&');
}

function buildConfig(opts) {
  var headers = Object.assign({}, opts.headers);
  // some CDNs reject the default axios user agent
  if (!headers['User-Agent']) headers['User-Agent'] = 'leetcode-cli';
  var conf = {
    url:               opts.url,
    method:            (opts.method || 'GET').toUpperCase(),
    headers:           headers,
    maxRedirects:      0, // redirects are handled here for cookie control
    validateStatus:    function() { return true; }, // checkError owns statuses
    transformResponse: function(d) { return d; }, // no auto JSON.parse
    responseType:      opts.responseType || 'text'
  };
  if (opts.json) {
    conf.data = JSON.stringify(opts.body || {});
    conf.headers['Content-Type'] = 'application/json';
  } else if (opts.form) {
    conf.data = encodeForm(opts.form);
    conf.headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (opts.body !== undefined && conf.method !== 'GET') {
    conf.data = opts.body;
  }
  return conf;
}

function shim(resp, finalUrl) {
  return {
    statusCode: resp.status,
    headers:    Object.assign({}, resp.headers),
    request:    {uri: {href: finalUrl}}
  };
}

function domainOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function send(jar, opts, cb) {
  var conf = buildConfig(opts);
  if (jar) {
    var host = domainOf(conf.url);
    var cookie = Object.keys(jar).filter(function(k) {
      return host === k || host.endsWith('.' + k);
    }).map(function(k) {
      return Object.keys(jar[k]).map(function(name) {
        return name + '=' + jar[k][name];
      }).join('; ');
    }).join('; ');
    if (cookie) conf.headers['Cookie'] = cookie;
  }

  trace('REQUEST ' + conf.method + ' ' + conf.url);
  axios.request(conf).then(function(resp) {
    // persist cookies from this hop
    var setCookies = resp.headers['set-cookie'];
    if (jar && Array.isArray(setCookies)) {
      var host = domainOf(conf.url);
      jar[host] = jar[host] || {};
      setCookies.forEach(function(line) {
        var kv = parseSetCookie(line);
        if (kv) jar[host][kv[0]] = kv[1];
      });
    }

    var status = resp.status;
    var location = resp.headers['location'];
    var canFollow = conf.method === 'GET' || conf.method === 'HEAD' ||
      opts.followAllRedirects;
    if (location && canFollow && [301, 302, 303, 307, 308].includes(status)) {
      var next = new URL(location, conf.url).href;
      trace('  REDIRECT ' + status + ' -> ' + next);
      var hop = Object.assign({}, opts, {
        url:    next,
        method: [301, 302, 303].includes(status) && conf.method !== 'HEAD' ?
                 'GET' : conf.method,
        json:    false,
        body:    undefined,
        form:    undefined,
        headers: Object.assign({}, opts.headers)
      });
      return send(jar, hop, cb);
    }

    trace('  RESPONSE ' + status + ' ' + conf.url);
    var shimResp = shim(resp, conf.url);
    var body = resp.data;
    if (opts.json && typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* keep raw */ }
    }
    return cb(null, shimResp, body);
  }).catch(function(err) {
    return cb(err);
  });
}

http.request = http;

http.post = function(opts, cb) {
  opts = Object.assign({}, opts, {method: 'POST'});
  http.request(opts, cb);
};

http.get = function(opts, cb) {
  if (typeof opts === 'string') opts = {url: opts};
  opts = Object.assign({}, opts, {method: 'GET'});
  http.request(opts, cb);
};

// request.defaults({jar: true, headers}) equivalent
http.defaults = function(conf) {
  var jar = conf.jar ? {} : null;
  var baseHeaders = conf.headers || {};
  var bound = function(opts, cb) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({}, baseHeaders, opts.headers);
    send(jar, opts, cb);
  };
  bound.post = function(opts, cb) {
    bound(Object.assign({}, opts, {method: 'POST'}), cb);
  };
  bound.get = function(opts, cb) {
    if (typeof opts === 'string') opts = {url: opts};
    bound(Object.assign({}, opts, {method: 'GET'}), cb);
  };
  return bound;
};

module.exports = http;
