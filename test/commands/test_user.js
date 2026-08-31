'use strict';
const assert = require('chai').assert;
const rewire = require('rewire');

const config = require('../../lib/config');
const chalk = require('../../lib/chalk');
const log = require('../../lib/log');

const USER = {name: 'ywnwa417', paid: false};

const stripAnsi = s => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('command:user', function() {
  let cmd;
  let out;
  let session;

  before(function() {
    log.init();
    config.init();
    chalk.init();
  });

  beforeEach(function() {
    out = [];
    log.output = x => out.push(x);
    process.exitCode = 0;

    cmd = rewire('../../lib/commands/user');
    session = {
      argv:       null,
      getUser:    () => USER,
      deleteUser: () => {}
    };
    cmd.__set__('session', session);
    cmd.__set__('core', {logout: (user, purge) => USER});
  });

  it('should show the current user', function() {
    cmd.handler({});

    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Premium');
    assert.include(text, 'ywnwa417');
    assert.include(text, 'leetcode.com');
  });

  it('should show not-login for missing user', function() {
    session.getUser = () => null;

    cmd.handler({});
    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'not login yet');
    assert.equal(process.exitCode, 1);
  });

  it('should logout ok', function() {
    cmd.handler({logout: true});
    const text = stripAnsi(out.join('\n'));
    assert.include(text, 'Successfully logout as');
  });
});
