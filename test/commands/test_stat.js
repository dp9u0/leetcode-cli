'use strict';
const assert = require('chai').assert;
const rewire = require('rewire');

const config = require('../../lib/config');
const chalk = require('../../lib/chalk');
const icon = require('../../lib/icon');
const log = require('../../lib/log');
const h = require('../../lib/helper');

const PROBLEMS = [];
for (let i = 0; i < 10; ++i) PROBLEMS.push({fid: i + 1, state: 'ac', level: 'Easy'});
for (let i = 0; i < 20; ++i) PROBLEMS.push({fid: i + 11, state: 'None', level: 'Medium'});
for (let i = 0; i < 5; ++i) PROBLEMS.push({fid: i + 31, state: 'notac', level: 'Hard'});

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:stat', function() {
  let cmd;
  let out;

  before(function() {
    log.init();
    config.init();
    chalk.init();
    icon.init();
    h.width = 120;
  });

  beforeEach(function() {
    out = [];
    log.output = x => out.push(x);

    cmd = rewire('../../lib/commands/stat');
    cmd.__set__('core', {filterProblems: (argv, cb) => cb(null, PROBLEMS.slice())});
  });

  it('should show progress bars', function() {
    cmd.handler({lock: true});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Easy');
    assert.include(text, '10/10');
    assert.include(text, 'Medium');
    assert.include(text, ' 0/20');
    assert.include(text, 'Hard');
    assert.include(text, ' 0/5');
    assert.match(text, /█+/, 'green bar rendered');
    assert.match(text, /░+/, 'red bar rendered');
  });

  it('should show the graph legend', function() {
    cmd.handler({lock: true, graph: true});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Accepted');
    assert.include(text, 'Not Accepted');
    assert.include(text, 'Remaining');
  });

  it('should render the calendar from the server', function(done) {
    cmd.__set__('core', {
      filterProblems: (argv, cb) => cb(null, PROBLEMS.slice()),
      getCalendar:    (cb) => cb(null, {[Math.floor(Date.now() / 1000)]: 7})
    });

    cmd.handler({lock: true, cal: true});
    // async getCalendar -> handler prints inside callback
    setTimeout(() => {
      const text = stripAnsi(out.join('\n'));
      assert.include(text, 'Sun');
      assert.include(text, 'Mon');
      assert.match(text, /▣/, 'submission cells rendered');
      done();
    }, 10);
  });

  it('should fall back to local log when server calendar fails', function(done) {
    cmd.__set__('core', {
      filterProblems: (argv, cb) => cb(null, PROBLEMS.slice()),
      getCalendar:    (cb) => cb('boom')
    });

    cmd.handler({lock: true, cal: true});
    setTimeout(() => {
      const text = stripAnsi(out.join('\n'));
      assert.include(text, 'using local log');
      done();
    }, 10);
  });
});
