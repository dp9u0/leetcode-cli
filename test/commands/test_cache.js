'use strict';
const fs = require('fs');
const assert = require('chai').assert;
const rewire = require('rewire');

const chalk = require('../../lib/chalk');
const log = require('../../lib/log');
const th = require('../helper');

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:cache', function() {
  let cmd;
  let out;
  let cache;
  let file;

  before(function() {
    log.init();
    chalk.init();
  });

  beforeEach(function() {
    th.clean();
    out = [];
    log.output = x => out.push(x);

    file = rewire('../../lib/file');
    file.cacheDir = () => th.DIR;

    cache = rewire('../../lib/cache');
    cache.__set__('file', file);
    cache.init();

    cmd = rewire('../../lib/commands/cache');
    cmd.__set__('cache', cache);
  });

  it('should list caches with a solved marker', function() {
    cache.set('problems', [
      {fid: 1, slug: 'two-sum', state: 'ac', category: 'algorithms'},
      {fid: 2, slug: 'add-two', state: 'None', category: 'algorithms'}
    ]);
    cache.set('problemsMeta', {fetchedAt: Date.now(), v: 2});
    cache.set('1.two-sum.algorithms', {desc: '<pre></pre>'});
    cache.set('2.add-two.algorithms', {desc: '<pre></pre>'});
    cache.set('user', {name: 'x'});

    cmd.handler({keyword: '', delete: false});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, '1.two-sum.algorithms');
    assert.include(text, '2.add-two.algorithms');
    // solved problems get a check mark, unsolved ones a blank slot
    const row1 = out.find(x => x.includes('1.two-sum'));
    const row2 = out.find(x => x.includes('2.add-two'));
    assert.notEqual(row1.indexOf('✔'), -1);
    assert.equal(row2.indexOf('✔'), -1);
    // non-problem caches have no marker column alignment issues
    const rowUser = out.find(x => x.includes('user'));
    assert.exists(rowUser);
  });

  it('should refresh the problems list', function(done) {
    cache.set('problems', [{fid: 1, name: 'old'}]);
    cache.set('problemsMeta', {fetchedAt: Date.now(), v: 2});

    const NEW = [{fid: 1, name: 'new'}, {fid: 2, name: 'two'}];
    cmd.__set__('core', {getProblems: (t, cb) => cb(null, NEW)});

    cmd.handler({refresh: true, dontTranslate: true});

    const text = out.join('\n');
    assert.include(text, 'refreshed (2 questions)');
    // the problems cache was dropped so the next fetch re-pulls
    assert.equal(cache.get('problems'), null);
    assert.equal(cache.get('problemsMeta'), null);
    done();
  });

  it('should fail loudly if refresh fails', function(done) {
    cache.set('problems', [{fid: 1}]);
    cmd.__set__('core', {getProblems: (t, cb) => cb('refresh error')});

    cmd.handler({refresh: true, dontTranslate: true});

    const text = out.join('\n');
    assert.include(text, 'refresh error');
    assert.equal(process.exitCode, 1);
    done();
  });

  it('should delete caches by id', function() {
    cache.set('1.two-sum.algorithms', {x: 1});
    cache.set('2.add-two.algorithms', {x: 1});

    cmd.handler({keyword: '1', delete: true});

    assert.equal(cache.get('1.two-sum.algorithms'), null);
    assert.notEqual(cache.get('2.add-two.algorithms'), null);
  });
});
