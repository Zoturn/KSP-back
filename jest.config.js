/**
 * Unit-test Jest config. Jest auto-discovers this file (no `--config` flag needed) —
 * see the `"test"` script in package.json.
 *
 * `transform`, `moduleFileExtensions` and `testEnvironment` come from `jest.shared.js`,
 * which also backs `test/jest-e2e.config.js` and carries the --experimental-vm-modules guard.
 */
const shared = require('./jest.shared');

module.exports = {
  ...shared,

  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',

  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
