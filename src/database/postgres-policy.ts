/**
 * Schema-safety settings that must be identical in **every** connection to this database.
 *
 * WHY THIS FILE EXISTS
 * ---------------------
 * There are two connections: `data-source.ts` (the CLI that generates and runs migrations) and
 * `database.module.ts` (the application). They legitimately differ in where their credentials
 * come from — `process.env` versus `ConfigService` — but they must not differ in the rules
 * below, and until this file they were two hand-synced copies. That is the same drift that
 * `jest.shared.js` exists to prevent on the test side, and it had already produced two verbatim
 * copies of an eleven-line comment.
 *
 * Spreading one frozen object makes disagreement impossible rather than merely discouraged.
 */
export const POSTGRES_SCHEMA_POLICY = {
  /**
   * NON-NEGOTIABLE per `database.md`: never true, not even in development. `synchronize` diffs
   * entities against the live schema and alters it automatically, with no reviewable history —
   * it silently drops columns and the data in them.
   */
  synchronize: false,

  /**
   * Use pgcrypto's `gen_random_uuid()` for `@PrimaryGeneratedColumn('uuid')`.
   *
   * TypeORM's default is **uuid-ossp**, whose function is `uuid_generate_v4()`. Our
   * `AddExtensions` migration installs pgcrypto and citext, so the default would produce
   * migrations depending on an extension no migration creates — working on any machine the ORM
   * had already touched, failing on a genuinely fresh database.
   */
  uuidExtension: 'pgcrypto',

  /**
   * Stop the driver issuing `CREATE EXTENSION` on connect.
   *
   * This is the half that was missed the first time. `PostgresDriver.afterConnect()` scans
   * entity metadata and, when `installExtensions` is left at its default of `true`, runs
   * `CREATE EXTENSION IF NOT EXISTS ...` for every extension the entities imply — pgcrypto for
   * uuid columns, citext for citext ones. Setting `uuidExtension` alone only changes *which*
   * extension it creates; it does not stop it creating one.
   *
   * That matters for the reason the migrations-only rule exists at all: an extension that is
   * present because something connected, rather than because a reviewed migration created it,
   * is invisible to review and absent from the migration history. `AddExtensions` already
   * installs both, so nothing is lost by turning it off — and a missing extension now fails
   * loudly instead of being papered over on first connect.
   *
   * `uuidExtension` is still honoured for migration generation: the driver reads it from its
   * own `uuidGenerator` getter, independently of the install path.
   */
  installExtensions: false,
} as const;
