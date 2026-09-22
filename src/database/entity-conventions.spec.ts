import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * Enforces the column conventions `database.md` states as rules, across every entity.
 *
 * WHY THIS AND NOT A SHARED BASE ENTITY
 * --------------------------------------
 * The obvious way to stop `id` / `created_at` / `updated_at` drifting between entities is an
 * abstract base class. It was considered and rejected: the trio is not actually uniform
 * (`ProductImage` has no `updatedAt`, so one base would not fit and two bases would be more
 * machinery than the six lines they save), and in a migrations-only project the entity file is
 * the reviewed statement of what columns its table has — moving a third of them into a parent
 * makes that non-local for no real gain.
 *
 * But the duplication was never the real exposure. **Nothing enforced the conventions**, and
 * the way they break is silent. Write `type: 'text'` instead of `'citext'` on a slug and
 * case-insensitive uniqueness simply disappears: no error, no failing test, and `/c/Audio` and
 * `/c/audio` quietly become two different categories. Write `@CreateDateColumn()` without
 * `type: 'timestamptz'` and timestamps lose their offset. Both survive code review easily.
 *
 * So the convention is asserted directly, which is cheaper than an abstraction and catches the
 * cases a base class never could.
 *
 * HOW IT FINDS ENTITIES
 * ----------------------
 * By walking `src/` for `*.entity.ts` and importing each, the same glob shape `data-source.ts`
 * uses. Deliberately not a hand-maintained list: that is exactly the gap that made
 * `schema.generate.ts`'s `RESOLVERS` array able to go stale, and a conventions guard that
 * silently skips the newest entity is worse than none.
 */
function findEntityFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findEntityFiles(full);
    return entry.name.endsWith('.entity.ts') ? [full] : [];
  });
}

const srcRoot = join(__dirname, '..');
const entityFiles = findEntityFiles(srcRoot);

// Importing registers each entity's decorators into TypeORM's metadata storage. No database
// connection is involved — the storage is populated at import time.
for (const file of entityFiles) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(file);
}

const storage = getMetadataArgsStorage();
const entityTargets = storage.tables.map((table) => table.target);

describe('entity conventions', () => {
  it('found entities to check', () => {
    // Without this the whole suite passes vacuously the day the walk breaks or the naming
    // convention changes — green for the worst possible reason.
    expect(entityFiles.length).toBeGreaterThan(0);
    expect(entityTargets.length).toBe(entityFiles.length);
  });

  it('gives every entity a generated uuid primary key', () => {
    // database.md: "uuid via @PrimaryGeneratedColumn('uuid'). Never mix PK types across
    // tables." A plain @PrimaryGeneratedColumn() is an auto-increment integer — enumerable,
    // and a silent inconsistency once one table has it.
    const offenders = entityTargets
      .map((target) => ({
        entity: (target as { name: string }).name,
        strategies: storage.generations
          .filter((generation) => generation.target === target)
          .map((generation) => generation.strategy),
      }))
      .filter(({ strategies }) => strategies.join() !== 'uuid');

    expect(offenders).toEqual([]);
  });

  it('declares every date column as timestamptz', () => {
    // A bare `timestamp` drops the offset, so the same instant reads differently depending on
    // the server's zone — and the damage is only visible once data crosses a DST boundary.
    const offenders = storage.columns
      .filter(
        (column) =>
          entityTargets.includes(column.target) &&
          (column.mode === 'createDate' || column.mode === 'updateDate'),
      )
      .filter((column) => column.options.type !== 'timestamptz')
      .map(
        (column) =>
          `${(column.target as { name: string }).name}.${column.propertyName}`,
      );

    expect(offenders).toEqual([]);
  });

  it('declares every slug column as citext', () => {
    // The silent one. `text` still enforces uniqueness, just case-sensitively, so nothing
    // fails — the catalogue simply starts accepting two URLs that should be the same.
    const offenders = storage.columns
      .filter(
        (column) =>
          entityTargets.includes(column.target) &&
          column.propertyName === 'slug',
      )
      .filter((column) => column.options.type !== 'citext')
      .map((column) => `${(column.target as { name: string }).name}.slug`);

    expect(offenders).toEqual([]);
  });

  it('keeps money as integer minor units, never a float', () => {
    // database.md: price_cents integer + currency char(3). Binary floating point cannot
    // represent 0.1 exactly and the error compounds through totals, so `float`/`double`/
    // `real` on a money column is a correctness bug, not a precision preference.
    const offenders = storage.columns
      .filter(
        (column) =>
          entityTargets.includes(column.target) &&
          /cents$/i.test(column.propertyName),
      )
      .filter((column) => column.options.type !== 'integer')
      .map(
        (column) =>
          `${(column.target as { name: string }).name}.${column.propertyName}`,
      );

    expect(offenders).toEqual([]);
  });
});
