'use strict';

var h = require('../helper');
var config = require('../config');
var chalk = require('../chalk');
var log = require('../log');
var core = require('../core');
var session = require('../session');
var sprintf = require('../sprintf');

const cmd = {
  command: 'user',
  aliases: ['account'],
  desc:    'Manage account',
  builder: function(yargs) {
    return yargs
        .option('l', {
          alias:    'login',
          type:     'boolean',
          default:  false,
          describe: 'Login'
        })
        .option('c', {
          alias:    'cookie',
          type:     'boolean',
          default:  false,
          describe: 'cookieLogin'
        })
        .option('L', {
          alias:    'logout',
          type:     'boolean',
          default:  false,
          describe: 'Logout'
        })
        .example(chalk.yellow('leetcode user'), 'Show current user')
        .example(chalk.yellow('leetcode user -l'), 'User login')
        .example(chalk.yellow('leetcode user -c'), 'User Cookie login')
        .example(chalk.yellow('leetcode user -L'), 'User logout');
  }
};

cmd.handler = function(argv) {
  session.argv = argv;
  let user = null;
  if (argv.login) {
    // login
    h.readInput([
      {name: 'login'},
      {name: 'pass', hidden: true}
    ], function(e, user) {
      if (e) return log.fail(e);

      core.login(user, function(e, user) {
        if (e) return log.fail(e);
        log.info('Successfully login as', chalk.yellow(user.name || user.login));
      });
    });
  } else if (argv.logout) {
    // logout
    user = core.logout(user, true);
    if (user)
      log.info('Successfully logout as', chalk.yellow(user.name));
    else
      log.fail('You are not login yet?');
  } else if (argv.cookie) {
    // session
    h.readInput([
      {name: 'login'},
      {name: 'cookie'}
    ], function(e, user) {
      if (e) return log.fail(e);
      core.cookieLogin(user, function(e, user) {
        if (e) return log.fail(e);
        log.info('Successfully cookie login as', chalk.yellow(user.name || user.login));
      });
    });
  } else {
    // show current user
    user = session.getUser();
    if (user) {
      log.info(chalk.gray(sprintf(' %-9s %-20s %s', 'Premium', 'User', 'Host')));
      log.info(chalk.gray('-'.repeat(60)));
      log.printf('    %s      %-20s %s',
          h.prettyText('', user.paid || false),
          chalk.yellow(user.name),
          config.sys.urls.base);
    } else
      return log.fail('You are not login yet?');
  }
};

module.exports = cmd;
