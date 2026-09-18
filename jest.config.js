/**
 * Unit-test Jest config. Jest auto-discovers this file (no `--config` flag needed) —
 * see the `"test"` script in package.json.
 *
 * `transform` comes from `jest.shared.js`, which also backs `test/jest-e2e.config.js`.
 */
const shared = require('./jest.shared');

module.exports = {
  ...shared,

  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',

  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
