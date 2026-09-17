import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The first migration: enables the two PostgreSQL extensions every later entity depends on.
 *
 * WHY THIS IS HAND-WRITTEN RATHER THAN GENERATED
 * ------------------------------------------------
 * `migration:generate` diffs entities against the live database and writes the SQL to
 * reconcile them — it needs an actual diff, and refuses outright ("No changes in database
 * schema were found") when there isn't one. There are zero entities yet, and extensions
 * aren't entity-derived anyway, so this was made with `migration:create` (an empty file to
 * hand-write) instead. That distinction is the point of `design.md` Decision #4: a migration
 * doesn't have to originate from an entity diff — it's one incremental, reviewable step in
 * schema history, and infrastructure statements belong there too.
 *
 * WHY THESE TWO EXTENSIONS
 * --------------------------
 * - `pgcrypto` provides `gen_random_uuid()`, which backs every table's UUID primary key
 *   (`@PrimaryGeneratedColumn('uuid')`). Without it, the first entity migration fails.
 * - `citext` provides a case-insensitive text type, used for `users.email` so that
 *   `Foo@Example.com` and `foo@example.com` collide on the UNIQUE constraint rather than
 *   creating two accounts. See `database.md`'s column conventions.
 *
 * Both are created here, in a migration, rather than by hand via `psql` — so a fresh clone
 * plus `npm run migration:run` reproduces the database exactly, with no undocumented setup.
 */
export class AddExtensions1789663486369 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // IF NOT EXISTS keeps this idempotent — safe if an extension was already installed
    // (e.g. by a DBA, or from a partially-applied earlier state).
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext";`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Dropped in reverse order of creation, by convention.
    //
    // Deliberately NOT `DROP EXTENSION ... CASCADE`. CASCADE would silently destroy every
    // dependent object — any citext column, any gen_random_uuid() default — turning a
    // routine rollback into data loss. Without it, Postgres refuses to drop an extension
    // that something still depends on, which is exactly the behaviour we want: a loud
    // failure telling you a later migration must be reverted first.
    await queryRunner.query(`DROP EXTENSION IF EXISTS "citext";`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto";`);
  }
}
