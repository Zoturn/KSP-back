import 'dotenv/config';
import { DataSource } from 'typeorm';
import { join } from 'node:path';

/**
 * The TypeORM CLI's OWN configuration surface — used by `migration:generate`, `migration:run`,
 * and `migration:revert` (see the npm scripts in package.json). Never imported by the running
 * application; `database.module.ts` is what the live app actually connects through.
 *
 * WHY THIS FILE HAS TO EXIST SEPARATELY FROM database.module.ts
 * ---------------------------------------------------------------
 * The TypeORM CLI is a plain Node process (run here via `typeorm-ts-node-commonjs`, which
 * wraps ts-node so it can execute this .ts file directly). It never boots Nest's application
 * context, so there is no DI container and therefore no `ConfigService` to inject — the async
 * `forRootAsync` + `useFactory` pattern `database.module.ts` uses simply isn't available here.
 * This file has to fetch its own connection details, which is what `import 'dotenv/config'`
 * does: it reads `.env` and populates `process.env` before anything else in this file runs.
 *
 * A DELIBERATE GAP, NOT AN OVERSIGHT
 * -----------------------------------
 * Unlike `database.module.ts` (which reads validated config off `ConfigService`), this file
 * reads `process.env` directly and does NOT run it through env.validation.ts's Joi schema —
 * that schema only guards the application's boot path. If `.env` is missing or malformed here,
 * TypeORM's own connection error is the safety net instead of our friendlier Joi message.
 * Acceptable: this is a CLI a developer runs directly and can debug interactively, not a
 * silent production boot path.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST as string,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER as string,
  password: process.env.POSTGRES_PASSWORD as string,
  database: process.env.POSTGRES_DB as string,

  // Globs, not a hand-maintained list — picked up automatically as entities/migrations are
  // added. `__dirname` here resolves to `src/database` because ts-node runs this .ts file
  // directly (not a compiled dist/ copy), so these patterns correctly target source files.
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],

  // Same non-negotiable rule as database.module.ts — see database.md.
  // Use pgcrypto's gen_random_uuid() for @PrimaryGeneratedColumn('uuid').
  //
  // WITHOUT THIS, TypeORM DEFAULTS TO uuid-ossp — and worse, its Postgres driver runs
  // `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` ITSELF on connect, whenever any entity
  // has a uuid column (PostgresDriver, "afterConnect"). That is the ORM performing DDL
  // outside a migration, which is exactly what database.md's migrations-only rule
  // exists to prevent: an extension no migration creates, invisible to review, and
  // present only because something happened to connect first.
  //
  // Caught when the first entity migration generated `DEFAULT uuid_generate_v4()`
  // while our AddExtensions migration installs pgcrypto and citext only.
  uuidExtension: 'pgcrypto' as const,

  synchronize: false,
});
