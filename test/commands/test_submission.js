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

const PROBLEM = {fid: 1, name: 'Two Sum', slug: 'two-sum', category: 'algorithms'};
const SUBMISSION = {
  id:             's1',
  lang:           'cpp',
  status_display: 'Accepted',
  code:           'int main() {}'
};

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:submission', function() {
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
    process.exitCode = 0;

    cmd = rewire('../../lib/commands/submission');
    cmd.__set__('core', {
      getProblem:     (kw, t, cb) => cb(null, Object.assign({lang: 'cpp'}, PROBLEM)),
      getSubmissions: (problem, cb) => cb(null, [SUBMISSION]),
      getSubmission:  (submission, cb) => cb(null, Object.assign({}, SUBMISSION)),
      exportProblem:  (problem, opts) => opts.code
    });
  });

  it('should download the accepted submission', function(done) {
    this.timeout(2000);
    cmd.handler({keyword: '1', outdir: th.DIR, lang: 'all', extra: false, dontTranslate: true});

    // the write happens from the async queue, poll for it
    (function wait() {
      const files = fs.existsSync(th.DIR) ? fs.readdirSync(th.DIR) : [];
      if (files.length === 0) return setTimeout(wait, 20);

      assert.equal(files.length, 1);
      assert.include(files[0], '1.');
      assert.include(fs.readFileSync(th.DIR + files[0], 'utf8'), 'int main() {}');
      assert.notEqual(process.exitCode, 1);
      done();
    })();
  });

  it('should flag errors and keep going', function() {
    cmd.__set__('core', {
      getProblem: (kw, t, cb) => cb('problem not found!')
    });

    cmd.handler({keyword: '404', outdir: th.DIR, lang: 'all', extra: false, dontTranslate: true});
    assert.equal(process.exitCode, 1);
  });
});
