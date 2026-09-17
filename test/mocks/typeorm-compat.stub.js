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
 * WHY THIS STUB IS FAITHFUL, NOT A HACK — AND THE ASSUMPTION IT DEPENDS ON
 * -----------------------------------------------------------------------
 * The real file's entire job is: try to resolve `Connection`/`AbstractRepository` from the
 * installed `typeorm` package (both existed pre-1.0, for backward compatibility), and return
 * `undefined` for whichever one is missing. This project depends on `typeorm@^1.1.1` (see
 * proposal.md's Impact section) — a CARET RANGE, not an exact pin — where TypeORM's own 1.0
 * upgrade guide confirms BOTH symbols were removed. So on the versions actually installed
 * today, the real file's real behavior already computes exactly what's hardcoded below.
 *
 * BUT a caret range means a routine `npm install` can legitimately pick up a newer `1.x`
 * patch or minor without anyone touching this file — if a future TypeORM 1.x release ever
 * brings either symbol back (unlikely, but this stub can't know that), this hardcoded value
 * would silently go stale: tests would keep passing against `undefined` while the real,
 * unmocked app behavior had quietly changed underneath them. `typeorm-compat.assumptions.
 * spec.ts` (beside this file's consumer, in `src/`) guards against exactly that — it asserts
 * the installed `@nestjs/typeorm`/`typeorm` versions still match what was verified when this
 * stub was written, and fails loudly, naming this file, the moment that stops being true.
 */
module.exports = {
  Connection: undefined,
  AbstractRepository: undefined,
};
