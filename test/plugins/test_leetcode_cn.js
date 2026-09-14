'use strict';
const assert = require('chai').assert;
const nock = require('nock');

const config = require('../../lib/config');

const plugin = require('../../lib/plugins/leetcode.cn');

describe('plugin:leetcode.cn', function() {
  // ensure the cn endpoints are used while this plugin is active
  before(function() {
    config.app = 'leetcode.cn';
    config.sys.urls.graphql = 'https://leetcode.cn/graphql';
    config.sys.urls.base = 'https://leetcode.cn';
  });

  after(function() {
    config.app = 'leetcode';
    config.sys.urls.graphql = 'https://leetcode.com/graphql';
    config.sys.urls.base = 'https://leetcode.com';
  });

  describe('#getProblemOfToday', function() {
    it('should ok', function(done) {
      nock('https://leetcode.cn')
        .post('/graphql')
        .reply(200, {data: {todayRecord: [
          {question: {titleSlug: 'find-the-difference'}}
        ]}});

      plugin.getProblemOfToday(false, function(e, slug) {
        assert.equal(e, null);
        assert.equal(slug, 'find-the-difference');
        done();
      });
    });

    it('should fail if http error', function(done) {
      nock('https://leetcode.cn')
        .post('/graphql')
        .reply(500);

      plugin.getProblemOfToday(false, function(e, slug) {
        assert.deepEqual(e, {msg: 'http error', statusCode: 500});
        done();
      });
    });

    it('should fail if no daily challenge', function(done) {
      nock('https://leetcode.cn')
        .post('/graphql')
        .reply(200, {data: {todayRecord: []}});

      plugin.getProblemOfToday(false, function(e, slug) {
        assert.equal(e, 'failed to load problem of today!');
        done();
      });
    });
  }); // #getProblemOfToday
});
