/**
 * Unit-test Jest config. Jest auto-discovers this file (no `--config` flag needed) —
 * see the `"test"` script in package.json.
 *
 * `transform` and `transformIgnorePatterns` come from `jest.shared.js`, which also backs
 * `test/jest-e2e.config.js` — see that file's header comment for why they're extracted.
 */
const shared = require('./jest.shared');

module.exports = {
  ...shared,

  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',

  // Redirects @nestjs/typeorm's internal typeorm-compat.js (genuinely ESM-native —
  // uses `createRequire(import.meta.url)`, which has no CommonJS equivalent at all, so no
  // transform config can fix it) to a small stub that reproduces its real behavior for our
  // pinned TypeORM version. See nestjs.md's "Failure mode B" and the stub file itself.
  moduleNameMapper: {
    'typeorm-compat(\\.js)?$': '<rootDir>/../test/mocks/typeorm-compat.stub.js',
  },

  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
