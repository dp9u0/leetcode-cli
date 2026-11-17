'use strict';
var _ = require('underscore');

var h = require('../helper');
var chalk = require('../chalk');
var log = require('../log');
var cache = require('../cache');
var core = require('../core');
var session = require('../session');
var sprintf = require('../sprintf');

const cmd = {
  command: 'cache [keyword]',
  desc:    'Manage local cache',
  builder: function(yargs) {
    return yargs
      .option('d', {
        alias:    'delete',
        type:     'boolean',
        describe: 'Delete cache by keyword',
        default:  false
      })
      .option('r', {
        alias:    'refresh',
        type:     'boolean',
        describe: 'Force refresh the problems list from leetcode',
        default:  false
      })
      .positional('keyword', {
        type:     'string',
        describe: 'Cache name or question id',
        default:  ''
      })
      .example(chalk.yellow('leetcode cache'), 'Show all cache')
      .example(chalk.yellow('leetcode cache 1'), 'Show cache of question 1')
      .example('', '')
      .example(chalk.yellow('leetcode cache -d'), 'Delete all cache')
      .example(chalk.yellow('leetcode cache 1 -d'), 'Delete cache of question 1')
      .example(chalk.yellow('leetcode cache -r'), 'Force refresh the problems list');
  }
};

cmd.handler = function(argv) {
  session.argv = argv;

  if (argv.refresh) {
    // drop the problems cache so the next fetch is a fresh one
    cache.del(h.KEYS.problems);
    cache.del(h.KEYS.problemsMeta);
    core.getProblems(!argv.dontTranslate, function(e, problems) {
      if (e) return log.fail(e);
      log.info('Problems list refreshed (' + problems.length + ' questions).');
    });
    return;
  }

  const name = argv.keyword;
  const isInteger = Number.isInteger(Number(name));

  const caches = cache.list()
    .filter(function(f) {
      return (name.length === 0) ||
        (isInteger ? f.name.startsWith(name + '.') : f.name === name);
    });

  if (argv.delete) {
    for (let f of caches) cache.del(f.name);
  } else {
    // some cache names (e.g. long slugs) exceed 60 chars, widen the name
    // column to the longest one so size/created columns stay aligned
    const width = caches.reduce((m, f) => Math.max(m, f.name.length), 60);

    // per-problem caches get a solved marker from the problems list
    const problems = name === '' ? cache.get(h.KEYS.problems) : null;

    log.info(chalk.gray(sprintf(' %-' + width + 's %8s    %s', 'Cache', 'Size', 'Created')));
    log.info(chalk.gray('-'.repeat(width + 26)));

    _.sortBy(caches, function(f) {
      let x = parseInt(f.name.split('.')[0], 10);
      if (Number.isNaN(x)) x = 0;
      return x;
    })
    .forEach(function(f) {
      let marker = ' ';
      if (problems) {
        const fid = parseInt(f.name, 10);
        const problem = Number.isInteger(fid) &&
          problems.find(x => x.fid === fid);
        if (problem) marker = problem.state === 'ac' ? h.prettyState('ac') : ' ';
        marker += ' ';
      }
      log.printf(' %s%-' + width + 's %8s    %s ago',
          marker,
          chalk.green(f.name),
          h.prettySize(f.size),
          h.prettyTime((Date.now() - f.mtime) / 1000));
    });
  }
};

module.exports = cmd;
