'use strict';
const assert = require('chai').assert;
const rewire = require('rewire');

const config = require('../../lib/config');
const chalk = require('../../lib/chalk');
const icon = require('../../lib/icon');
const log = require('../../lib/log');

const PROBLEMS = [
  {fid:      1, name:     'Two Sum', slug:     'two-sum', starred:  true, locked:   false,
      state:    'ac', level:    'Easy', category: 'algorithms', percent:  50},
  {fid:      2, name:     'Two Sum II', slug:     'two-sum-ii', starred:  false, locked:   false,
      state:    'None', level:    'Medium', category: 'algorithms', percent:  40},
  {fid:      3, name:     'Third', slug:     'third', starred:  false, locked:   true,
      state:    'None', level:    'Hard', category: 'algorithms', percent:  30}
];

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:list', function() {
  let cmd;
  let out;
  let filterProblems;

  before(function() {
    log.init();
    config.init();
    chalk.init();
    icon.init();
  });

  beforeEach(function() {
    out = [];
    log.output = x => out.push(x);
    process.exitCode = 0;

    cmd = rewire('../../lib/commands/list');
    filterProblems = (argv, cb) => cb(null, PROBLEMS.slice());
    cmd.__set__('core', {filterProblems: filterProblems});
  });

  it('should list all problems w/ stats', function() {
    cmd.handler({keyword: '', query: '', stat: true, extra: false});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Two Sum');
    assert.include(text, 'Two Sum II');
    assert.include(text, 'Third');
    assert.include(text, 'Listed: 3');
    assert.include(text, 'Locked:  1');
    assert.include(text, 'Accept: 1');
    assert.include(text, 'Remain:  2');
    assert.include(text, 'Easy:   1');
    assert.include(text, 'Medium:  1');
    assert.include(text, 'Hard:    1');
  });

  it('should filter by keyword', function() {
    cmd.handler({keyword: 'two sum', query: '', stat: false, extra: false});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Two Sum');
    assert.notInclude(text, 'Third');
  });

  it('should warn on repeated keyboard characters', function() {
    cmd.handler({keyword: 'aaaaaa', query: '', stat: false, extra: false});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'new keyboard');
  });
});
