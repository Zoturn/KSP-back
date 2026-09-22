import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the uuid-extension decision against silent regression.
 *
 * WHY THIS EXISTS
 * ----------------
 * TypeORM's Postgres driver defaults to **uuid-ossp** for `@PrimaryGeneratedColumn('uuid')`,
 * emitting `DEFAULT uuid_generate_v4()`. This project installs **pgcrypto** (`AddExtensions`),
 * whose function is `gen_random_uuid()`. A migration reaching for the wrong one depends on an
 * extension no migration creates: fine on any database the ORM has already touched, a hard
 * failure on a genuinely fresh one — CI, a first clone, a deploy.
 *
 * WHAT IT DOES AND DOES NOT COVER — the honest version
 * ------------------------------------------------------
 * An earlier draft of this comment claimed the spec guarded *config drift between the two
 * connection files*. It never could: dropping `uuidExtension` from `database.module.ts` changes
 * no migration file, because the app runs no migrations. That half is now fixed properly rather
 * than tested around — both settings live once in `postgres-policy.ts` and are spread into both
 * connections, so they cannot disagree.
 *
 * What remains genuinely worth asserting is the **output**: a hand-written migration, or a
 * regression in the CLI's own config, reaching for the wrong function. That is a real path this
 * catches, and it catches it in the artifact that actually ships rather than in a setting.
 *
 * This replaces a one-off check typed into psql during task 2.3: that proved the schema was
 * right on that day and guarded nothing afterwards.
 */
describe('migrations', () => {
  const migrationsDir = join(__dirname, 'migrations');

  const migrationFiles = readdirSync(migrationsDir).filter((file) =>
    file.endsWith('.ts'),
  );

  const sources = migrationFiles.map((file) => ({
    file,
    sql: readFileSync(join(migrationsDir, file), 'utf8'),
  }));

  it('has migrations to check', () => {
    // Without this, every assertion below passes vacuously the day the directory is empty or
    // the path is wrong — the test would go green for the worst possible reason.
    expect(migrationFiles.length).toBeGreaterThan(0);
  });

  it.each(sources)(
    'does not use the uuid-ossp function in $file',
    ({ sql }) => {
      expect(sql).not.toContain('uuid_generate_v4');
    },
  );

  it('generates every uuid default with pgcrypto', () => {
    // Guards the positive direction too: a migration could avoid uuid_generate_v4 by dropping
    // the default entirely, which would leave inserts without an id rather than fixing
    // anything.
    const uuidDefaults = sources.flatMap(({ sql }) =>
      [...sql.matchAll(/uuid NOT NULL DEFAULT ([a-z_]+\(\))/g)].map(
        (m) => m[1],
      ),
    );

    expect(uuidDefaults.length).toBeGreaterThan(0);
    // A Set rather than a loop: one assertion, and a failure message that names the offending
    // function instead of just reporting which iteration failed.
    expect([...new Set(uuidDefaults)]).toEqual(['gen_random_uuid()']);
  });

  it('creates pgcrypto, the extension those defaults depend on', () => {
    // The migration that installs it must stay. Dropping it would leave every other migration
    // depending on a function that does not exist on a fresh database.
    const installsPgcrypto = sources.some(({ sql }) =>
      /CREATE EXTENSION IF NOT EXISTS "?pgcrypto"?/i.test(sql),
    );

    expect(installsPgcrypto).toBe(true);
  });
});
