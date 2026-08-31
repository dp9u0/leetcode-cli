'use strict';
const fs = require('fs');
const assert = require('chai').assert;
const rewire = require('rewire');

const config = require('../../lib/config');
const chalk = require('../../lib/chalk');
const icon = require('../../lib/icon');
const log = require('../../lib/log');
const file = require('../../lib/file');
const th = require('../helper');

const PROBLEM = {
  fid:       1,
  name:      'Two Sum',
  slug:      'two-sum',
  link:      'https://leetcode.com/problems/two-sum/',
  category:  'algorithms',
  level:     'Easy',
  percent:   50,
  starred:   false,
  locked:    false,
  likes:     10,
  dislikes:  2,
  templates: [{value: 'cpp', defaultCode: 'class Solution {};'}],
  testcase:  '[2,7,11,15]',
  testable:  true,
  desc:      '<p>Given an array of integers <code>nums</code>.</p>',
  hints:     ['A brute force way would be <code>O(n^2)</code>.']
};

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:show', function() {
  let cmd;
  let out;

  before(function() {
    log.init();
    config.init();
    file.init();
    chalk.init();
    icon.init();
  });

  beforeEach(function() {
    th.clean();
    out = [];
    log.output = x => out.push(x);

    cmd = rewire('../../lib/commands/show');
    cmd.__set__('core', {
      getProblem:    (kw, t, cb) => cb(null, Object.assign({}, PROBLEM)),
      exportProblem: (problem, opts) => problem.templates[0].defaultCode
    });
  });

  it('should show the problem with plain text desc and hints', function() {
    cmd.handler({keyword: 'two-sum', daily: false, gen: false, codeonly: false, extra: false});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, '[1] Two Sum');
    assert.include(text, PROBLEM.link);
    // html decoded to plain text
    assert.include(text, 'Given an array of integers nums.');
    assert.notInclude(text, '<code>');
    assert.include(text, 'Hint 1: A brute force way would be O(n^2).');
    assert.notInclude(text, '<details>');
  });

  it('should generate source code from template', function() {
    cmd.handler({keyword:  'two-sum', daily:    false, gen:      true, codeonly: false,
        extra:    true, outdir:   th.DIR, lang:     'cpp'});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Source Code:');
    const files = fs.readdirSync(th.DIR);
    assert.equal(files.length, 1);
    assert.include(fs.readFileSync(th.DIR + files[0], 'utf8'), 'class Solution {};');
  });
});
