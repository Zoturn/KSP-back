/**
 * e2e Jest config. Referenced explicitly via `jest --config ./test/jest-e2e.config.js`
 * (the `"test:e2e"` script in package.json) — e2e specs are not auto-discovered by the
 * default unit config.
 *
 * `transform`, `moduleFileExtensions` and `testEnvironment` come from `../jest.shared.js`,
 * which also backs `jest.config.js` and carries the --experimental-vm-modules guard.
 */
const shared = require('../jest.shared');

module.exports = {
  ...shared,

  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
};
