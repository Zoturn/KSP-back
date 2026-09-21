/**
 * Jest config shared between the unit-test config (`jest.config.js`) and the e2e config
 * (`test/jest-e2e.config.js`).
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * Partly to share settings, but mostly for the guard below.
 *
 * Several `@nestjs/*` packages ship native ESM (`config@12`, `typeorm@12`, `terminus@12`)
 * while the framework is still CommonJS. Jest 30 can load them natively, but only on
 * Node >= 24.9 AND only when Node is started with `--experimental-vm-modules` — without the
 * flag `vm.SourceTextModule` does not exist, so Jest's own capability check reads false and
 * every affected suite dies with `Must use import to load ES Module`.
 *
 * That flag lives in package.json's `"jest"` script, which every test script delegates to.
 * But a script is a convention, not a guarantee: `npx jest`, an IDE's Jest runner, or a
 * future CI step calling Jest directly all bypass it and silently reproduce the original
 * error — whose diagnosis cost real time and is no longer in the config as a comment.
 *
 * So rather than trusting the convention, this file makes its absence self-diagnosing. It is
 * the one module every entry point loads (both configs `require()` it, and bare `jest` finds
 * `jest.config.js`), which makes it the only place a check like this covers everything.
 */
const { SourceTextModule } = require('node:vm');

if (typeof SourceTextModule === 'undefined') {
  throw new Error(
    [
      'Jest must be started with `node --experimental-vm-modules`.',
      '',
      'Without it, Node does not expose vm.SourceTextModule, Jest falls back to its',
      'CommonJS-only loader, and every suite importing @nestjs/config, @nestjs/typeorm',
      'or @nestjs/terminus fails with "Must use import to load ES Module".',
      '',
      'Run the npm scripts (`npm test`, `npm run test:e2e`) rather than jest directly —',
      'they all delegate to the "jest" script, which supplies the flag.',
      `(Also requires Node >= 24.9; this process is ${process.version}.)`,
    ].join('\n'),
  );
}

module.exports = {
  // Shared because they are genuinely identical in both configs — the pair most likely to
  // drift silently if hand-copied. `rootDir`, `testRegex` and coverage settings stay out:
  // those legitimately differ between the unit and e2e runs.
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',

  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
};
