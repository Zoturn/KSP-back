import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { DatabaseConfig } from '../config/configuration';

/**
 * Wires the RUNNING application's connection to PostgreSQL.
 *
 * This is the second of two separate TypeORM configuration surfaces (see design.md
 * Decision #3, and `data-source.ts` in this same folder). The distinction is a real
 * boundary, not duplication for its own sake:
 *
 *   - THIS file runs INSIDE Nest's DI container, so it can (and per nestjs.md, must) get its
 *     connection details from `ConfigService` — already validated by env.validation.ts's Joi
 *     schema before this factory ever runs.
 *   - `data-source.ts` runs OUTSIDE Nest entirely, as a plain script the TypeORM CLI invokes
 *     for `migration:generate`/`migration:run`/`migration:revert`. A CLI process never boots
 *     Nest's DI container, so it has no `ConfigService` to inject — it reads `.env` itself.
 *
 * `TypeOrmModule.forRootAsync` (not the static `forRoot`) is required here for the same
 * reason `ConfigModule` itself needed `forRootAsync` in app.module.ts: the connection details
 * don't exist yet at import time — they only exist once `ConfigService` has been constructed
 * and injected, which `useFactory` + `inject: [ConfigService]` is what makes possible.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const db = configService.getOrThrow<DatabaseConfig>('database');

        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,

          // `autoLoadEntities: true` means we never maintain a manual list (or a glob path
          // that behaves differently under ts-node in dev vs compiled dist/ in prod — a
          // classic gotcha) here. Instead, each future feature module registers its own
          // entities via `TypeOrmModule.forFeature([Entity])`, and Nest automatically folds
          // them into this connection. Zero entities exist yet (Phase 4 adds the first).
          autoLoadEntities: true,

          // Migrations are deliberately NOT configured here. This module only CONNECTS —
          // it never runs migrations itself. Only the standalone CLI (via data-source.ts)
          // ever applies schema changes, and only when a human explicitly runs it after
          // reading the generated SQL. An app that silently migrates its own database on
          // every boot is exactly the kind of surprise database.md's migrations-only rule
          // exists to prevent.

          // NON-NEGOTIABLE per database.md: never true, not even in development. See
          // LEARNING/00-docker.md and database.md for why — synchronize diffs entities
          // against the live schema and alters it automatically, with no reviewable history.
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
