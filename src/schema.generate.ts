import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import {
  GRAPHQL_SDL_FILE_HEADER,
  GraphQLSchemaBuilderModule,
  GraphQLSchemaFactory,
} from '@nestjs/graphql';
import { lexicographicSortSchema, printSchema } from 'graphql';
import { AppResolver } from './app.resolver';

/**
 * Regenerates `schema.gql` WITHOUT booting the application — and therefore without needing
 * PostgreSQL to be running.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE APP
 * -----------------------------------------
 * The running app writes `schema.gql` as a side effect of `autoSchemaFile` (app.module.ts),
 * but that path requires a full boot: config validation, a live database connection, the
 * whole dependency graph. `schema.gql` is the contract `ksp-frontend` generates its client
 * from, and CI needs to verify it's current — making that check require a database would be
 * real, avoidable coupling (design.md Decision #6).
 *
 * `GraphQLSchemaBuilderModule` is NestJS's own minimal module for exactly this: it provides
 * `GraphQLSchemaFactory` and nothing else, so no `DatabaseModule`, no `ConfigModule`, no
 * `.env` needed.
 *
 * THE ONE MAINTENANCE COST, STATED PLAINLY
 * ------------------------------------------
 * `RESOLVERS` below is a hand-maintained list. The running app discovers resolvers through
 * its module graph; this script cannot, because it never builds that graph. So a resolver
 * added to a feature module but NOT added here would make this script emit a schema missing
 * that resolver's fields — silently disagreeing with what the real server serves.
 *
 * That drift is caught, not merely hoped against: the schema-drift e2e test (task 6.1)
 * compares the committed `schema.gql` against what the actually-running app produces, and
 * the pre-commit hook regenerates the file whenever a resolver/model/input is staged. Adding
 * a resolver to this list is part of adding a resolver, the same way adding it to its
 * module's `providers` is.
 */
const RESOLVERS = [AppResolver];

async function generateSchema(): Promise<void> {
  // `logger: false` keeps the output clean — this runs in CI and pre-commit hooks, where
  // Nest's boot banner is noise.
  const app = await NestFactory.create(GraphQLSchemaBuilderModule, {
    logger: false,
  });
  await app.init();

  const schemaFactory = app.get(GraphQLSchemaFactory);
  const schema = await schemaFactory.create(RESOLVERS);
  await app.close();

  // Must match app.module.ts's `sortSchema: true` exactly, or the two generators produce
  // byte-different files and the drift check fails on a schema that is actually correct.
  // The header constant is imported from @nestjs/graphql rather than hardcoded for the same
  // reason — if they ever change it, this follows automatically.
  const sdl =
    GRAPHQL_SDL_FILE_HEADER + printSchema(lexicographicSortSchema(schema));

  writeFileSync(join(process.cwd(), 'schema.gql'), sdl);
}

generateSchema().catch((error: unknown) => {
  console.error('Failed to generate schema.gql:', error);
  process.exit(1);
});
