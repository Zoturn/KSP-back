/**
 * A test-only stand-in for `@nestjs/typeorm/dist/common/typeorm-compat.js`.
 *
 * WHY THIS EXISTS
 * -----------------
 * The real file uses `createRequire(import.meta.url)` — `import.meta` has no CommonJS
 * equivalent, so no amount of ts-jest/Babel transform configuration can convert it. This
 * isn't a syntax-rewrite problem (like plain `import`/`export` keywords, which ARE
 * mechanically convertible); it's a genuine ESM-native runtime feature Jest's CommonJS test
 * environment cannot execute. See nestjs.md's "recurring gotcha" section and tasks.md task
 * 3.1/3.2 for the full investigation.
 *
 * WHY THIS STUB IS FAITHFUL, NOT A HACK
 * ----------------------------------------
 * The real file's entire job is: try to resolve `Connection`/`AbstractRepository` from the
 * installed `typeorm` package (both existed pre-1.0, for backward compatibility), and return
 * `undefined` for whichever one is missing. This project is pinned to `typeorm@^1.1.1` (see
 * proposal.md's Impact section), where TypeORM's own 1.0 upgrade guide confirms BOTH of these
 * were removed. So on this project's actual dependency versions, the real file's real
 * behavior — for us, always, not just in tests — already computes exactly this:
 */
module.exports = {
  Connection: undefined,
  AbstractRepository: undefined,
};
