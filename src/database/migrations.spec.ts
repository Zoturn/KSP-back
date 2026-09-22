import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the uuid-extension decision against silent regression.
 *
 * WHY THIS EXISTS
 * ----------------
 * TypeORM's Postgres driver defaults to **uuid-ossp** for `@PrimaryGeneratedColumn('uuid')`,
 * emitting `DEFAULT uuid_generate_v4()` — and, worse, running
 * `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` itself on connect, which is DDL performed
 * outside any migration. This project installs **pgcrypto** instead (`AddExtensions`), whose
 * function is `gen_random_uuid()`. See `database.md`.
 *
 * The correction is `uuidExtension: 'pgcrypto'`, and it has to be set in **two** places —
 * `data-source.ts` (the CLI that generates migrations) and `database.module.ts` (the app).
 * Nothing makes those two agree. Drop it from either and the next generated migration quietly
 * reverts to `uuid_generate_v4()`, producing a migration that depends on an extension no
 * migration creates. It then works on any machine TypeORM has already connected to, and fails
 * on a genuinely fresh database — CI, a teammate's first clone, a production deploy.
 *
 * WHY IT ASSERTS AGAINST THE MIGRATION FILES RATHER THAN THE CONFIG
 * ------------------------------------------------------------------
 * The migrations are the artifact that actually ships. Checking them catches the drift
 * whichever config caused it, and would also catch a hand-written migration that reached for
 * the wrong function. Asserting `uuidExtension === 'pgcrypto'` in two files would instead be a
 * test that restates the code.
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
    const uuidDefaults = sources.flatMap(({ file, sql }) =>
      [...sql.matchAll(/uuid NOT NULL DEFAULT ([a-z_]+\(\))/g)].map(
        (match) => ({ file, fn: match[1] }),
      ),
    );

    expect(uuidDefaults.length).toBeGreaterThan(0);
    for (const { fn } of uuidDefaults) {
      expect(fn).toBe('gen_random_uuid()');
    }
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
