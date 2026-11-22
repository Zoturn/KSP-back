import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getMetadataArgsStorage } from 'typeorm';
import type { ColumnMetadataArgs } from 'typeorm/metadata-args/ColumnMetadataArgs';

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
 * `/c/audio` quietly become two different categories. Write a bare `timestamp` and timestamps
 * lose their offset. Both survive code review easily.
 *
 * EVERY RULE ASSERTS IT INSPECTED SOMETHING
 * -------------------------------------------
 * The natural shape for a rule like this is "collect offenders, assert the list is empty" — and
 * that shape is a trap, because an empty list is identical whether the rule holds or the filter
 * matched nothing. A review pass found three live instances in the first version of this file:
 * the slug rule passed if no entity had a `slug` property, the money rule passed if `priceCents`
 * were renamed, and the date rule matched only `@CreateDateColumn`/`@UpdateDateColumn` — so a
 * hand-written `@Column({ type: 'timestamp' }) createdAt`, exactly the mistake described above,
 * was skipped entirely.
 *
 * So each rule asserts a non-empty match set before asserting zero offenders. A rule that stops
 * finding its own subject now fails instead of going quiet.
 *
 * HOW IT FINDS ENTITIES
 * ----------------------
 * By walking `src/` for `*.entity.ts` and importing each, the same glob shape `data-source.ts`
 * uses. Deliberately not a hand-maintained list: that is the gap that lets
 * `schema.generate.ts`'s `RESOLVERS` array go stale, and a conventions guard that silently skips
 * the newest entity is worse than none.
 */
function findEntityFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findEntityFiles(full);
    return entry.name.endsWith('.entity.ts') ? [full] : [];
  });
}

const entityFiles = findEntityFiles(join(__dirname, '..'));

// Importing registers each entity's decorators into TypeORM's metadata storage. No database
// connection is involved — the storage is populated at import time.
for (const file of entityFiles) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(file);
}

const storage = getMetadataArgsStorage();
const entityTargets = storage.tables.map((table) => table.target);

/** Columns belonging to an entity of this project, ignoring anything else in the storage. */
const ownColumns: ColumnMetadataArgs[] = storage.columns.filter((column) =>
  entityTargets.includes(column.target),
);

/** `Entity.property`, so a failure names the offender rather than just a count. */
function label(column: ColumnMetadataArgs): string {
  return `${(column.target as { name: string }).name}.${column.propertyName}`;
}

describe('entity conventions', () => {
  it('found entities to check', () => {
    expect(entityFiles.length).toBeGreaterThan(0);
    expect(entityTargets.length).toBe(entityFiles.length);
    expect(ownColumns.length).toBeGreaterThan(0);
  });

  it('gives every entity a generated uuid primary key', () => {
    // database.md: "uuid via @PrimaryGeneratedColumn('uuid'). Never mix PK types across
    // tables." A plain @PrimaryGeneratedColumn() is an auto-increment integer — enumerable,
    // and a silent inconsistency the moment one table has it.
    const strategiesByEntity = entityTargets.map((target) => ({
      entity: (target as { name: string }).name,
      strategies: storage.generations
        .filter((generation) => generation.target === target)
        .map((generation) => generation.strategy),
    }));

    expect(strategiesByEntity.length).toBeGreaterThan(0);
    expect(
      strategiesByEntity.filter(
        ({ strategies }) => strategies.join() !== 'uuid',
      ),
    ).toEqual([]);
  });

  it('declares every date column as timestamptz', () => {
    // A bare `timestamp` drops the offset, so the same instant reads differently depending on
    // the server's zone — and the damage only shows once data crosses a DST boundary.
    //
    // Matches on the decorator mode AND the property name, so a hand-written
    // `@Column({ type: 'timestamp' }) createdAt` is caught rather than skipped.
    const dateColumns = ownColumns.filter(
      (column) =>
        column.mode === 'createDate' ||
        column.mode === 'updateDate' ||
        /At$/.test(column.propertyName),
    );

    expect(dateColumns.length).toBeGreaterThan(0);
    expect(
      dateColumns
        .filter((column) => column.options.type !== 'timestamptz')
        .map(label),
    ).toEqual([]);
  });

  it('declares every slug column as citext', () => {
    // The silent one. `text` still enforces uniqueness, just case-sensitively, so nothing
    // fails — the catalogue simply starts accepting two URLs that should be the same.
    const slugColumns = ownColumns.filter(
      (column) => column.propertyName === 'slug',
    );

    expect(slugColumns.length).toBeGreaterThan(0);
    expect(
      slugColumns
        .filter((column) => column.options.type !== 'citext')
        .map(label),
    ).toEqual([]);
  });

  it('keeps money as integer minor units, never a float', () => {
    // database.md: price_cents integer + currency char(3). Binary floating point cannot
    // represent 0.1 exactly and the error compounds through totals, so float/double/real on a
    // money column is a correctness bug, not a precision preference.
    const moneyColumns = ownColumns.filter((column) =>
      /cents$/i.test(column.propertyName),
    );

    expect(moneyColumns.length).toBeGreaterThan(0);
    expect(
      moneyColumns
        .filter((column) => column.options.type !== 'integer')
        .map(label),
    ).toEqual([]);
  });
});
