/**
 * Jest config shared between the unit-test config (`jest.config.js`) and the e2e config
 * (`test/jest-e2e.config.js`).
 *
 * WHY THIS FILE EXISTS
 * ----------------------
 * This exact block — the ts-jest `module`/`moduleResolution` override plus the
 * `transformIgnorePatterns` allowlist that makes `@nestjs/*` ESM packages loadable under
 * Jest's CommonJS runtime — used to be hand-copied into both configs separately. That
 * duplication already caused a real regression once: task group 2 fixed the
 * `@nestjs/config` ESM issue in `package.json`'s config only, and `npm run test:e2e` broke
 * silently because `test/jest-e2e.json` never got the same fix (see
 * `.claude/rules/nestjs.md`'s "recurring gotcha" section and `openspec/changes/
 * bootstrap-api-foundation/tasks.md` task 3.1/3.2 for the full incident).
 *
 * Extracting it here means the next ESM-shipping `@nestjs/*` package is a **one-line edit
 * in one place**, not two hand-synced copies that can silently drift apart again.
 *
 * `rootDir`, `testRegex`, and `moduleNameMapper` deliberately stay OUT of this file — they
 * genuinely differ between the unit and e2e configs and shouldn't be shared.
 */
module.exports = {
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: {
          // Our real tsconfig.json uses "module": "nodenext", which makes TypeScript decide
          // per-file whether to treat code as ESM based on the CONTAINING PACKAGE's own
          // package.json. This override forces ts-jest's in-memory compilation to always
          // emit CommonJS, regardless of what the source package declares — see
          // nestjs.md's "Failure mode A" for why this is required, not optional, even once
          // the package below is allowlisted for transformation at all.
          module: 'CommonJS',
          moduleResolution: 'node',
          resolvePackageJsonExports: false,
        },
      },
    ],
  },

  // Jest's default skips ALL of node_modules from transformation. This allowlist carves out
  // an exception for the specific @nestjs/* packages that ship ESM ahead of the framework —
  // see nestjs.md for the full story and how to add a new package name here.
  //
  // Note the "." instead of a literal "/" or "\\": Jest doubles backslashes when normalizing
  // these patterns on Windows in a way that breaks an explicit separator character, but a
  // "." wildcard matches whichever separator is actually present and is immune to it.
  transformIgnorePatterns: [
    'node_modules.(?!(@nestjs.config|@nestjs.typeorm).)',
  ],
};
