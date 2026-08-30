'use strict';
const _ = require('underscore');
const assert = require('chai').assert;
const rewire = require('rewire');

const h = require('../../lib/helper');
const log = require('../../lib/log');
const config = require('../../lib/config');
const th = require('../helper');

describe('plugin:cache', function() {
  let plugin;
  let next;
  let cache;
  let file;
  let session;

  const PROBLEMS = [
    {id: 0, fid: 0, name: 'name0', slug: 'slug0', starred: false, desc: '<pre></pre>', likes: '1', dislikes: '1', hints: [], category: 'algorithms'},
    {id: 1, fid: 1, name: 'name1', slug: 'slug1', starred: true, desc: '<pre></pre>', likes: '1', dislikes: '1', hints: [], category: 'algorithms'}
  ];
  const TRANSLATION_CONFIGS = { useEndpointTranslation: false };
  const PROBLEM = {id: 0, fid: 0, slug: 'slug0', category: 'algorithms'};
  const FRESH_META = () => ({fetchedAt: Date.now(), v: 2});
  const EXPIRED_META = () => ({fetchedAt: Date.now() - 25 * 60 * 60 * 1000, v: 2});

  before(function() {
    log.init();
    config.init();
  });

  beforeEach(function() {
    th.clean();
    next = {};

    file = rewire('../../lib/file');
    file.cacheDir = () => th.DIR;

    cache = rewire('../../lib/cache');
    cache.__set__('file', file);
    cache.init();

    session = rewire('../../lib/session');
    session.__set__('cache', cache);

    plugin = rewire('../../lib/plugins/cache');
    plugin.__set__('cache', cache);
    plugin.__set__('session', session);
    plugin.init();

    plugin.setNext(next);
  });

  describe('#getProblems', function() {
    it('should getProblems w/ fresh cache ok', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, FRESH_META());
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      next.getProblems = () => assert.fail('should not reach next plugin');

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.deepEqual(problems, PROBLEMS);
        done();
      });
    });

    it('should refresh problems w/ expired cache', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, EXPIRED_META());
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      const NEW_PROBLEMS = [{id: 2, fid: 2, name: 'name2', slug: 'slug2', category: 'algorithms'}];
      next.getProblems = (needT, cb) => cb(null, NEW_PROBLEMS);

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.deepEqual(problems, NEW_PROBLEMS);
        assert.isAtLeast(cache.get(h.KEYS.problemsMeta).fetchedAt, Date.now() - 1000);
        done();
      });
    });

    it('should refresh legacy problems cache w/o meta', function(done) {
      cache.set('problems', PROBLEMS);
      cache.del(h.KEYS.problemsMeta);
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      let reachedNext = false;
      next.getProblems = (needT, cb) => { reachedNext = true; return cb(null, PROBLEMS); };

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.deepEqual(problems, PROBLEMS);
        assert.equal(reachedNext, true);
        assert.isNumber(cache.get(h.KEYS.problemsMeta).fetchedAt);
        done();
      });
    });

    it('should refresh problems w/ old meta version', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, {fetchedAt: Date.now(), v: 1});
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      next.getProblems = (needT, cb) => cb(null, PROBLEMS);

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.equal(cache.get(h.KEYS.problemsMeta).v, 2);
        done();
      });
    });

    it('should serve stale problems if refresh fails', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, EXPIRED_META());
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      next.getProblems = (needT, cb) => cb('client getProblems error');

      const originWarn = log.warn;
      log.warn = () => {};
      plugin.getProblems(false, function(e, problems) {
        log.warn = originWarn;
        assert.equal(e, null);
        assert.deepEqual(problems, PROBLEMS);
        done();
      });
    });

    it('should getProblems w/o cache ok', function(done) {
      cache.del('problems');
      next.getProblems = (needT, cb) => cb(null, PROBLEMS);

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.deepEqual(problems, PROBLEMS);
        done();
      });
    });

    it('should getProblems w/o cache fail if client error', function(done) {
      cache.del('problems');
      next.getProblems = (needT, cb) => cb('client getProblems error');

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, 'client getProblems error');
        done();
      });
    });
  }); // #getProblems

  describe('#getProblem', function() {
    it('should getProblem w/ cache ok', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);
      cache.set('0.slug0.algorithms', PROBLEMS[0]);

      plugin.getProblem(_.clone(PROBLEM), false, function(e, problem) {
        assert.equal(e, null);
        assert.deepEqual(problem, PROBLEMS[0]);
        done();
      });
    });

    it('should getProblem w/o cache ok', function(done) {
      cache.set('problems', PROBLEMS);
      cache.del('0.slug0.algorithms');
      next.getProblem = (problem, needT, cb) => cb(null, PROBLEMS[0]);

      plugin.getProblem(_.clone(PROBLEM), false, function(e, problem) {
        assert.equal(e, null);
        assert.deepEqual(problem, PROBLEMS[0]);
        done();
      });
    });

    it('should getProblem fail if client error', function(done) {
      cache.set('problems', PROBLEMS);
      cache.del('0.slug0.algorithms');
      next.getProblem = (problem, needT, cb) => cb('client getProblem error');

      plugin.getProblem(_.clone(PROBLEM), false, function(e, problem) {
        assert.equal(e, 'client getProblem error');
        done();
      });
    });
  }); // #getProblem

  describe('#saveProblem', function() {
    it('should ok', function() {
      cache.del('0.slug0.algorithms');

      const problem = _.clone(PROBLEMS[0]);
      problem.locked = true;
      problem.state = 'ac';

      const ret = plugin.saveProblem(problem);
      assert.equal(ret, true);
      assert.deepEqual(cache.get('0.slug0.algorithms'),
          {id: 0, fid: 0, slug: 'slug0', name: 'name0', desc: '<pre></pre>', likes: '1', dislikes: '1', hints: [], category: 'algorithms'});
    });
  }); // #saveProblem

  describe('#updateProblem', function() {
    it('should updateProblem ok', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, FRESH_META());
      cache.set(h.KEYS.translation, TRANSLATION_CONFIGS);

      const kv = {value: 'value00'};
      const ret = plugin.updateProblem(PROBLEMS[0], kv);
      assert.equal(ret, true);

      plugin.getProblems(false, function(e, problems) {
        assert.equal(e, null);
        assert.deepEqual(problems, [
            {id: 0, fid: 0, name: 'name0', slug: 'slug0', value: 'value00', starred: false, desc: '<pre></pre>', likes: '1', dislikes: '1', hints: [], category: 'algorithms'},
            {id: 1, fid: 1, name: 'name1', slug: 'slug1', starred: true, desc: '<pre></pre>', likes: '1', dislikes: '1', hints: [], category: 'algorithms'}
        ]);
        done();
      });
    });

    it('should updateProblem fail if no problems found', function() {
      cache.del('problems');
      const ret = plugin.updateProblem(PROBLEMS[0], {});
      assert.equal(ret, false);
    });

    it('should updateProblem fail if unknown problem', function() {
      cache.set('problems', [PROBLEMS[1]]);
      const ret = plugin.updateProblem(PROBLEMS[0], {});
      assert.equal(ret, false);
    });
  }); // #updateProblem

  describe('#user', function() {
    const USER = {name: 'test-user', pass: 'password'};
    const USER_SAFE = {name: 'test-user'};

    it('should login ok', function(done) {
      config.autologin.enable = true;
      // before login
      cache.del(h.KEYS.user);
      assert.equal(session.getUser(), null);
      assert.equal(session.isLogin(), false);

      next.login = (user, cb) => cb(null, user);

      plugin.login(USER, function(e, user) {
        assert.equal(e, null);
        assert.deepEqual(user, USER);

        // after login
        assert.deepEqual(session.getUser(), USER);
        assert.equal(session.isLogin(), true);
        done();
      });
    });

    it('should login ok w/ auto login', function(done) {
      config.autologin.enable = false;
      cache.del(h.KEYS.user);

      next.login = (user, cb) => cb(null, user);

      plugin.login(USER, function(e, user) {
        assert.equal(e, null);
        assert.deepEqual(user, USER);
        assert.deepEqual(session.getUser(), USER_SAFE);
        assert.equal(session.isLogin(), true);
        done();
      });
    });

    it('should login fail if client login error', function(done) {
      next.login = (user, cb) => cb('client login error');

      plugin.login(USER, function(e, user) {
        assert.equal(e, 'client login error');
        done();
      });
    });

    it('should cookieLogin purge problems cache ok', function(done) {
      config.autologin.enable = false;
      cache.set(h.KEYS.user, USER);
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, FRESH_META());
      next.cookieLogin = (user, cb) => cb(null, USER);

      // call detached on purpose, commands/user.js invokes it this way
      const cookieLogin = plugin.cookieLogin;
      cookieLogin(USER, function(e, user) {
        assert.equal(e, null);
        assert.deepEqual(user, USER);
        assert.deepEqual(session.getUser(), USER_SAFE);
        assert.equal(cache.get(h.KEYS.problems), null);
        assert.equal(cache.get(h.KEYS.problemsMeta), null);
        done();
      });
    });

    it('should cookieLogin fail if client error', function(done) {
      cache.set('problems', PROBLEMS);
      cache.set(h.KEYS.problemsMeta, FRESH_META());
      next.cookieLogin = (user, cb) => cb('client cookieLogin error');

      const cookieLogin = plugin.cookieLogin;
      cookieLogin(USER, function(e, user) {
        assert.equal(e, 'client cookieLogin error');
        assert.equal(cache.get(h.KEYS.problems), null);
        done();
      });
    });

    it('should logout ok', function(done) {
      // before logout
      cache.set(h.KEYS.user, USER);
      assert.deepEqual(session.getUser(), USER);
      assert.equal(session.isLogin(), true);

      // after logout
      plugin.logout(USER, true);
      assert.equal(session.getUser(), null);
      assert.equal(session.isLogin(), false);
      done();
    });

    it('should logout ok', function(done) {
      // before logout
      cache.set(h.KEYS.user, USER);
      assert.deepEqual(session.getUser(), USER);
      assert.equal(session.isLogin(), true);

      // after logout
      plugin.logout(null, true);
      assert.equal(session.getUser(), null);
      assert.equal(session.isLogin(), false);
      done();
    });
  }); // #user
});
