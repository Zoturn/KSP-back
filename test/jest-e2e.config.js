/**
 * e2e Jest config. Referenced explicitly via `jest --config ./test/jest-e2e.config.js`
 * (the `"test:e2e"` script in package.json) — e2e specs are not auto-discovered by the
 * default unit config.
 *
 * `transform` comes from `../jest.shared.js`, which also backs `jest.config.js`.
 */
const shared = require('../jest.shared');

module.exports = {
  ...shared,

  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.e2e-spec.ts$',
};
