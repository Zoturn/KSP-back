/**
 * e2e Jest config. Referenced explicitly via `jest --config ./test/jest-e2e.config.js`
 * (the `"test:e2e"` script in package.json) — e2e specs are not auto-discovered by the
 * default unit config.
 *
 * `transform` and `transformIgnorePatterns` come from `../jest.shared.js`, which also backs
 * `jest.config.js` (unit tests) — see that file's header comment for why they're extracted.
 */
const shared = require('../jest.shared');

module.exports = {
  ...shared,

  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',

  // Same stub redirect as jest.config.js — see that file's comment. Note: `<rootDir>` here
  // resolves relative to THIS config file's own location (the test/ folder), not the
  // project root, so the path has no `test/` prefix — verified empirically while debugging
  // the original incident (see tasks.md task 3.1/3.2).
  moduleNameMapper: {
    'typeorm-compat(\\.js)?$': '<rootDir>/mocks/typeorm-compat.stub.js',
  },
};
