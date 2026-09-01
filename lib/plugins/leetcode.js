'use strict';
var util = require('util');

var _ = require('underscore');
var request = require('../http');

var config = require('../config');
var h = require('../helper');
var file = require('../file');
var log = require('../log');
var Plugin = require('../plugin');
var Queue = require('../queue');
var session = require('../session');

const plugin = new Plugin(10, 'leetcode', '',
    'Plugin to talk with leetcode APIs.');

var spin;

// the REST problem list carries no tags; fetch them from the paged
// problemset graphql endpoint and merge them into the list
const TAG_PAGE_SIZE = 100;

// update options with user credentials
plugin.signOpts = function(opts, user) {
  opts.headers.Cookie = 'LEETCODE_SESSION=' + user.sessionId +
                        ';csrftoken=' + user.sessionCSRF + ';';
  opts.headers['X-CSRFToken'] = user.sessionCSRF;
  opts.headers['X-Requested-With'] = 'XMLHttpRequest';
};

plugin.makeOpts = function(url) {
  const opts = {};
  opts.url = url;
  opts.headers = {};

  if (session.isLogin())
    plugin.signOpts(opts, session.getUser());
  return opts;
};

plugin.checkError = function(e, resp, expectedStatus) {
  if (!e && resp && resp.statusCode !== expectedStatus) {
    const code = resp.statusCode;
    log.debug('http error: ' + code);

    // leetcode signals auth failures with 401 (REST) or 200 + empty user
    // fields (GraphQL / problem list); a 403/429 is cloudflare blocking or
    // rate limiting the client, not a session problem.
    if (code === 401) {
      e = session.errors.EXPIRED;
    } else if (code === 403 || code === 429) {
      e = session.errors.BLOCKED;
    } else {
      e = {msg: 'http error', statusCode: code};
    }
  }
  return e;
};

plugin.init = function() {
  config.app = 'leetcode';
};

// resolve {fid: [tagSlug]} for the whole problem set
plugin.getTags = function(cb) {
  const map = {};
  const fetchPage = function(skip) {
    const opts = plugin.makeOpts(config.sys.urls.graphql);
    opts.headers.Origin = config.sys.urls.base;
    opts.headers.Referer = config.sys.urls.base;
    opts.json = true;
    opts.body = {
      query: 'query problemTags($limit:Int!,$skip:Int!){' +
             'problemsetQuestionListV2(limit:$limit,skip:$skip,' +
             'filters:{filterCombineType:ALL}){hasMore questions{' +
             'questionFrontendId topicTags{slug}}}}',
      variables: {limit: TAG_PAGE_SIZE, skip: skip}
    };
    request.post(opts, function(e, resp, body) {
      e = plugin.checkError(e, resp, 200);
      if (e) return cb(e);

      const page = body.data.problemsetQuestionListV2;
      for (let q of page.questions) {
        map[+q.questionFrontendId] = q.topicTags.map(t => t.slug);
      }
      if (page.hasMore) return fetchPage(skip + TAG_PAGE_SIZE);
      return cb(null, map);
    });
  };
  fetchPage(0);
};

plugin.getProblems = function (needTranslation, cb) {
  log.debug('running leetcode.getProblems');
  let problems = [];
  const getCategory = function(category, queue, cb) {
    plugin.getCategoryProblems(category, function(e, _problems) {
      if (e) {
        log.debug(category + ': failed to getProblems: ' + e.msg);
      } else {
        log.debug(category + ': getProblems got ' + _problems.length + ' problems');
        problems = problems.concat(_problems);
      }
      return cb(e);
    });
  };

  spin = h.spin('Downloading problems');
  const q = new Queue(config.sys.categories, {}, getCategory);
  q.run(null, function(e) {
    spin.stop();
    if (e) return cb(e, problems);

    plugin.getTags(function(e, tags) {
      if (e) {
        // the list is still useful without tags, make the gap visible
        log.warn('Failed to fetch problem tags: ' + (e.msg || e));
      } else {
        for (let p of problems) p.tags = tags[p.fid] || [];
      }
      return cb(null, problems);
    });
  });
};

plugin.getCategoryProblems = function(category, cb) {
  log.debug('running leetcode.getCategoryProblems: ' + category);
  const opts = plugin.makeOpts(config.sys.urls.problems.replace('$category', category));

  spin.text = 'Downloading category ' + category;
  request(opts, function(e, resp, body) {
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    const json = JSON.parse(body);

    // leetcode permits anonymous access to the problem list
    // while we require login first to make a better experience.
    if (json.user_name.length === 0) {
      log.debug('no user info in list response, maybe session expired...');
      return cb(session.errors.EXPIRED);
    }

    const problems = json.stat_status_pairs
        .filter((p) => !p.stat.question__hide)
        .map(function(p) {
          return {
            state:    p.status || 'None',
            id:       p.stat.question_id,
            fid:      p.stat.frontend_question_id,
            name:     p.stat.question__title,
            slug:     p.stat.question__title_slug,
            link:     config.sys.urls.problem.replace('$slug', p.stat.question__title_slug),
            locked:   p.paid_only,
            percent:  p.stat.total_acs * 100 / p.stat.total_submitted,
            level:    h.levelToName(p.difficulty.level),
            starred:  p.is_favor,
            category: json.category_slug
          };
        });

    return cb(null, problems);
  });
};

// Daily challenge for leetcode.com
plugin.getProblemOfToday = function(needTranslation, cb) {
  log.debug('running leetcode.getProblemOfToday');
  const opts = plugin.makeOpts(config.sys.urls.graphql);
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = config.sys.urls.base;

  opts.json = true;
  opts.body = {
    query:         'query questionOfToday { activeDailyCodingChallengeQuestion { question { titleSlug } } }',
    variables:     {},
    operationName: 'questionOfToday'
  };

  const spin = h.spin('Getting problem of today');
  request.post(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    const daily = body.data.activeDailyCodingChallengeQuestion;
    if (!daily) return cb('failed to load problem of today!');
    return cb(null, daily.question.titleSlug);
  });
};

plugin.getProblem = function(problem, needTranslation, cb) {
  log.debug('running leetcode.getProblem');
  const user = session.getUser();
  if (problem.locked && !user.paid) return cb('failed to load locked problem!');

  const opts = plugin.makeOpts(config.sys.urls.graphql);
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = problem.link;

  opts.json = true;
  opts.body = {
    query: [
      'query getQuestionDetail($titleSlug: String!) {',
      '  question(titleSlug: $titleSlug) {',
      '    content',
      '    stats',
      '    likes',
      '    dislikes',
      '    codeDefinition',
      '    sampleTestCase',
      '    enableRunCode',
      '    metaData',
      '    translatedContent',
      '    hints',
      '  }',
      '}'
    ].join('\n'),
    variables:     {titleSlug: problem.slug},
    operationName: 'getQuestionDetail'
  };

  const spin = h.spin('Downloading ' + problem.slug);
  request.post(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    const q = body.data.question;
    if (!q) return cb('failed to load problem!');

    problem.totalAC = JSON.parse(q.stats).totalAccepted;
    problem.totalSubmit = JSON.parse(q.stats).totalSubmission;
    problem.likes = q.likes;
    problem.dislikes = q.dislikes;

    problem.desc = (q.translatedContent && needTranslation) ? q.translatedContent : q.content;

    problem.templates = JSON.parse(q.codeDefinition);
    problem.testcase = q.sampleTestCase;
    problem.testable = q.enableRunCode;
    problem.templateMeta = JSON.parse(q.metaData);
    problem.hints = q.hints;
    // @si-yao: seems below property is never used.
    // problem.discuss =  q.discussCategoryId;

    return cb(null, problem);
  });
};

function runCode(opts, problem, cb) {
  opts.method = 'POST';
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = problem.link;
  opts.json = true;
  opts._delay = opts._delay || config.network.delay || 1; // in seconds

  opts.body = opts.body || {};
  _.extendOwn(opts.body, {
    lang:        problem.lang,
    question_id: parseInt(problem.id, 10),
    test_mode:   false,
    typed_code:  file.codeData(problem.file)
  });

  const spin = h.spin('Sending code to judge');
  request(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    if (body.error) {
      if (!body.error.includes('too soon'))
        return cb(body.error);

      // hit 'run code too soon' error, have to wait a bit
      log.debug(body.error);

      // linear wait
      ++opts._delay;
      log.debug('Will retry after %d seconds...', opts._delay);

      const reRun = _.partial(runCode, opts, problem, cb);
      return setTimeout(reRun, opts._delay * 1000);
    }

    opts.json = false;
    opts.body = null;

    return cb(null, body);
  });
}

function verifyResult(task, queue, cb) {
  const opts = queue.ctx.opts;
  opts.method = 'GET';
  opts.url = config.sys.urls.verify.replace('$id', task.id);

  const spin = h.spin('Waiting for judge result');
  request(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    let result = JSON.parse(body);
    if (result.state === 'SUCCESS') {
      result = formatResult(result);
      _.extendOwn(result, task);
      queue.ctx.results.push(result);
    } else {
      queue.addTask(task);
    }
    return cb();
  });
}

function formatResult(result) {
  const x = {
    ok:                 result.run_success,
    lang:               result.lang,
    runtime:            result.status_runtime || '',
    runtime_percentile: result.runtime_percentile || '',
    memory:             result.status_memory || '',
    memory_percentile:  result.memory_percentile || '',
    state:              result.status_msg,
    testcase:           util.inspect(result.input || result.last_testcase || ''),
    passed:             result.total_correct || 0,
    total:              result.total_testcases || 0
  };

  x.error = _.chain(result)
      .pick((v, k) => /_error$/.test(k) && v.length > 0)
      .values()
      .value();

  if (/[runcode|interpret].*/.test(result.submission_id)) {
    // It's testing
    let output = result.code_output || [];
    if (Array.isArray(output)) {
      output = output.join('\n');
    }
    x.stdout = util.inspect(output);
    x.answer = result.code_answer;
    // LeetCode use 'expected_code_answer' to store the expected answer
    x.expected_answer = result.expected_code_answer;
  } else {
    // It's submitting
    x.answer = result.code_output;
    x.expected_answer = result.expected_output;
    x.stdout = result.std_output;
  }

  // make sure we pass eveything!
  if (x.passed !== x.total) x.ok = false;
  if (x.state !== 'Accepted') x.ok = false;
  if (x.error.length > 0) x.ok = false;

  return x;
}

plugin.testProblem = function(problem, cb) {
  log.debug('running leetcode.testProblem');
  const opts = plugin.makeOpts(config.sys.urls.test.replace('$slug', problem.slug));
  opts.body = {data_input: problem.testcase};

  runCode(opts, problem, function(e, task) {
    if (e) return cb(e);

    const tasks = [
      {type: 'Actual', id: task.interpret_id},
    ];

    // Used by LeetCode-CN
    if (task.interpret_expected_id) {
      tasks.push({type: 'Expected', id: task.interpret_expected_id});
    }
    const q = new Queue(tasks, {opts: opts, results: []}, verifyResult);
    q.run(null, function(e, ctx) {
      return cb(e, ctx.results);
    });
  });
};

plugin.submitProblem = function(problem, cb) {
  log.debug('running leetcode.submitProblem');
  const opts = plugin.makeOpts(config.sys.urls.submit.replace('$slug', problem.slug));
  opts.body = {judge_type: 'large'};

  runCode(opts, problem, function(e, task) {
    if (e) return cb(e);

    const tasks = [{type: 'Actual', id: task.submission_id}];
    const q = new Queue(tasks, {opts: opts, results: []}, verifyResult);
    q.run(null, function(e, ctx) {
      return cb(e, ctx.results);
    });
  });
};

plugin.getSubmissions = function(problem, cb) {
  log.debug('running leetcode.getSubmissions');
  const opts = plugin.makeOpts(config.sys.urls.submissions.replace('$slug', problem.slug));
  opts.headers.Referer = config.sys.urls.problem.replace('$slug', problem.slug);

  request(opts, function(e, resp, body) {
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    // FIXME: this only return the 1st 20 submissions, we should get next if necessary.
    const submissions = JSON.parse(body).submissions_dump;
    for (const submission of submissions)
      submission.id = _.last(_.compact(submission.url.split('/')));

    return cb(null, submissions);
  });
};

plugin.getSubmission = function(submission, cb) {
  log.debug('running leetcode.getSubmission');
  const opts = plugin.makeOpts(config.sys.urls.submission.replace('$id', submission.id));

  request(opts, function(e, resp, body) {
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    let re = body.match(/submissionCode:\s('[^']*')/);
    if (re) submission.code = eval(re[1]);

    re = body.match(/runtimeDistributionFormatted:\s('[^']+')/);
    if (re) submission.distributionChart = JSON.parse(eval(re[1]));
    return cb(null, submission);
  });
};

plugin.starProblem = function(problem, starred, cb) {
  log.debug('running leetcode.starProblem');
  const user = session.getUser();
  const operationName = starred ? 'addQuestionToFavorite' : 'removeQuestionFromFavorite';
  const opts = plugin.makeOpts(config.sys.urls.graphql);
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = problem.link;

  opts.json = true;
  opts.body = {
    query:         `mutation ${operationName}($favoriteIdHash: String!, $questionId: String!) {\n  ${operationName}(favoriteIdHash: $favoriteIdHash, questionId: $questionId) {\n    ok\n    error\n    favoriteIdHash\n    questionId\n    __typename\n  }\n}\n`,
    variables:     {favoriteIdHash: user.hash, questionId: '' + problem.id},
    operationName: operationName
  };

  const spin = h.spin(starred? 'star': 'unstar' + 'problem');
  request.post(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);
    return cb(null, starred);
  });
};

plugin.getFavorites = function(cb) {
  log.debug('running leetcode.getFavorites');
  const opts = plugin.makeOpts(config.sys.urls.favorites);

  const spin = h.spin('Retrieving user favorites');
  request(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    const favorites = JSON.parse(body);
    return cb(null, favorites);
  });
};

// server-side submission calendar: {unixDay: submissionCount}
plugin.getCalendar = function(cb) {
  log.debug('running leetcode.getCalendar');
  const opts = plugin.makeOpts(config.sys.urls.graphql);
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = config.sys.urls.base;
  opts.json = true;
  opts.body = {
    query:     'query cal($username: String!) { matchedUser(username: $username) { userCalendar { submissionCalendar } } }',
    variables: {username: session.getUser().name}
  };

  const spin = h.spin('Retrieving submission calendar');
  request.post(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    const cal = body.data.matchedUser.userCalendar;
    if (!cal) return cb('failed to load submission calendar!');
    try {
      return cb(null, JSON.parse(cal.submissionCalendar));
    } catch (err) {
      return cb('invalid submission calendar data');
    }
  });
};

plugin.getUserInfo = function(cb) {
  log.debug('running leetcode.getUserInfo');
  const opts = plugin.makeOpts(config.sys.urls.graphql);
  opts.headers.Origin = config.sys.urls.base;
  opts.headers.Referer = config.sys.urls.base;
  opts.json = true;
  opts.body = {
    query: [
      '{',
      '  userStatus {',
      '    username',
      '    isPremium',
      '  }',
      '}'
    ].join('\n'),
    variables: {}
  };

  const spin = h.spin('Retrieving user profile');
  request.post(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    // userStatus works on both leetcode.com and leetcode.cn, while the old
    // `user { isCurrentUserPremium }` query returns http 400 on leetcode.cn.
    const userStatus = body.data.userStatus;
    if (!userStatus) return cb('failed to load user status!');
    return cb(null, userStatus);
  });
};

function runSession(method, data, cb) {
  const opts = plugin.makeOpts(config.sys.urls.session);
  opts.json = true;
  opts.method = method;
  opts.body = data;

  const spin = h.spin('Waiting session result');
  request(opts, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e && e.statusCode === 302) e = session.errors.EXPIRED;

    return e ? cb(e) : cb(null, body.sessions);
  });
}

plugin.getSessions = function(cb) {
  log.debug('running leetcode.getSessions');
  runSession('POST', {}, cb);
};

plugin.activateSession = function(session, cb) {
  log.debug('running leetcode.activateSession');
  const data = {func: 'activate', target: session.id};
  runSession('PUT', data, cb);
};

plugin.createSession = function(name, cb) {
  log.debug('running leetcode.createSession');
  const data = {func: 'create', name: name};
  runSession('PUT', data, cb);
};

plugin.deleteSession = function(session, cb) {
  log.debug('running leetcode.deleteSession');
  const data = {target: session.id};
  runSession('DELETE', data, cb);
};

plugin.signin = function(user, cb) {
  const isCN = config.app === 'leetcode.cn';
  const spin = isCN ? h.spin('Signing in leetcode.cn') : h.spin('Signing in leetcode.com');
  request(config.sys.urls.login, function(e, resp, body) {
    spin.stop();
    e = plugin.checkError(e, resp, 200);
    if (e) return cb(e);

    user.loginCSRF = h.getSetCookieValue(resp, 'csrftoken');

    const opts = {
      url:     config.sys.urls.login,
      headers: {
        Origin:  config.sys.urls.base,
        Referer: config.sys.urls.login,
        Cookie:  'csrftoken=' + user.loginCSRF + ';'
      },
      form: {
        csrfmiddlewaretoken: user.loginCSRF,
        login:               user.login,
        password:            user.pass
      }
    };
    request.post(opts, function(e, resp, body) {
      if (e) return cb(e);
      if (resp.statusCode !== 302) {
        return cb('password login is rejected by leetcode.com, please use ' +
                  'cookie login instead (leetcode user -c)');
      }

      user.sessionCSRF = h.getSetCookieValue(resp, 'csrftoken');
      user.sessionId = h.getSetCookieValue(resp, 'LEETCODE_SESSION');
      session.saveUser(user);
      return cb(null, user);
    });
  });
};

plugin.getUser = function(user, cb) {
  plugin.getFavorites(function(e, favorites) {
    if (!e) {
      const privates = favorites.favorites.private_favorites;
      // leetcode.com names the default list 'Favorite'; leetcode.cn does not
      // (users may name it anything), so fall back to the first list.
      const f = privates.find((f) => f.name === 'Favorite') || privates[0];
      if (f) {
        user.hash = f.id_hash;
        user.name = favorites.user_name;
      } else {
        log.warn('No private favorite list found?');
      }
    } else {
      log.warn('Failed to retrieve user favorites: ' + e);
    }

    plugin.getUserInfo(function(e, userStatus) {
      if (e) {
        // the session itself is fine, keep the login but make the gap visible
        log.warn('Failed to retrieve user info: ' + (e.msg || e));
      } else {
        user.paid = userStatus.isPremium;
        user.name = userStatus.username;
      }
      session.saveUser(user);
      return cb(null, user);
    });
  });
};

plugin.login = function(user, cb) {
  log.debug('running leetcode.login');
  plugin.signin(user, function(e, user) {
    if (e) return cb(e);
    plugin.getUser(user, cb);
  });
};

function parseCookie(cookie) {
  if (!cookie) return null;

  const SessionPattern = /LEETCODE_SESSION=(.+?)(;|$)/;
  const csrfPattern = /csrftoken=(.+?)(;|$)/;
  const reCsrfResult = csrfPattern.exec(cookie);
  const reSessionResult = SessionPattern.exec(cookie);
  if (reSessionResult === null || reCsrfResult === null) {
    return null;
  }
  return {
    sessionId:   reSessionResult[1],
    sessionCSRF: reCsrfResult[1],
  };
}

plugin.cookieLogin = function(user, cb) {
  const cookieData = parseCookie(user.cookie);
  if (!cookieData) return cb('invalid cookie?');
  user.sessionId = cookieData.sessionId;
  user.sessionCSRF = cookieData.sessionCSRF;
  session.saveUser(user);
  plugin.getUser(user, cb);
};

module.exports = plugin;
