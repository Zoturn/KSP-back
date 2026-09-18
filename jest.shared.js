/**
 * Jest config shared between the unit-test config (`jest.config.js`) and the e2e config
 * (`test/jest-e2e.config.js`).
 *
 * WHY THIS IS NEARLY EMPTY NOW (it used to be the opposite)
 * ----------------------------------------------------------
 * This file once carried a `transformIgnorePatterns` allowlist plus a ts-jest
 * `module: CommonJS` override, and both configs additionally carried a `moduleNameMapper`
 * pointing at a hand-written stub — all of it to make `@nestjs/*` packages that ship ESM
 * (`config`, `typeorm`, `terminus`) loadable under Jest's CommonJS runtime. See
 * `.claude/rules/nestjs.md` for the full history.
 *
 * All of it is gone. Jest 30 can `require()` ESM natively, gated on **two** conditions that
 * are now both met:
 *
 * 1. **Node >= 24.9** — Jest needs `vm.SourceTextModule.prototype.hasAsyncGraph` to prove a
 *    module graph is synchronously evaluable. Pinned by `engines` in `package.json` and
 *    `.nvmrc`.
 * 2. **`--experimental-vm-modules`** — without this flag `vm.SourceTextModule` is `undefined`
 *    entirely, so condition 1 reads as false no matter which Node is running. This is the
 *    non-obvious half: upgrading Node alone changes nothing. The flag is applied once, in
 *    package.json's `"jest"` script, which every other test script delegates to.
 *
 * Only the ts-jest transform is genuinely shared now, but the file stays: the duplication it
 * prevents already caused one silent regression (a fix applied to the unit config but not the
 * e2e one — `tasks.md` task 3.1/3.2), and that risk returns the moment there are two copies.
 */
module.exports = {
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {}],
  },
};
