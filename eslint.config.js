'use strict';

// Effective ruleset captured from the previous eslint 5 + google 0.11
// setup (via --print-config, active rules only), so lint behavior is
// preserved exactly while dropping the archived google preset.
const RULES = {
      'block-spacing': [2, 'always'],
      'brace-style': [2, '1tbs', {allowSingleLine: true}],
      'camelcase': [2, {properties: 'never'}],
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'key-spacing': [2, {align: 'value'}],
      'max-len': [1, 120],
      'no-case-declarations': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-console': 1,
      'no-const-assign': 'error',
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-delete-var': 'error',
      'no-dupe-args': 'error',
      'no-dupe-class-members': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': [2, {allowEmptyCatch: true}],
      'no-empty-character-class': 'error',
      'no-empty-pattern': 'error',
      'no-eval': 1,
      'no-ex-assign': 'error',
      'no-extra-boolean-cast': 'error',
      'no-extra-semi': 'error',
      'no-fallthrough': 'error',
      'no-func-assign': 'error',
      'no-global-assign': 'error',
      'no-inner-declarations': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-loop-func': 1,
      'no-mixed-spaces-and-tabs': 'error',
      'no-new-symbol': 'error',
      'no-obj-calls': 'error',
      'no-octal': 'error',
      'no-proto': 1,
      'no-redeclare': 'error',
      'no-regex-spaces': 'error',
      'no-self-assign': 'error',
      'no-sparse-arrays': 'error',
      'no-this-before-super': 'error',
      'no-undef': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unused-expressions': 1,
      'no-unused-labels': 'error',
      'no-unused-vars': [1, {args: 'none'}],
      'no-useless-escape': 'error',
      'quote-props': [1, 'consistent'],
      'quotes': [2, 'single', {avoidEscape: true}],
      'require-yield': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error'
};

const NODE_MOCHA_GLOBALS = {
  URL: 'readonly', require: 'readonly', module: 'writable', exports: 'writable',
  process: 'readonly', console: 'readonly', Buffer: 'readonly',
  __dirname: 'readonly', __filename: 'readonly', setTimeout: 'readonly',
  setImmediate: 'readonly',
  clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly',
  beforeEach: 'readonly', afterEach: 'readonly'
};

module.exports = [
  {
    ignores: ['node_modules/**', 'tmp/**', 'lib/plugins/company.js']
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: NODE_MOCHA_GLOBALS
    },
    rules: RULES
  }
];
